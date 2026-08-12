import { getStorage, getSupabase, getSupabasePublicConfig, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { BUILDING_TYPES, MAX_OPEN_REQUESTS, NEEDS_UNIT, STAIRS_OPTIONS } from "@/lib/contracts";
import { flattenJob, mapJob } from "@/lib/jobs";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation } from "@/lib/security";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const ALLOWED_MEDIA = new Map<string, Set<string>>([
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
  ["image/webp", new Set([".webp"])],
  ["image/gif", new Set([".gif"])],
  ["image/heic", new Set([".heic"])],
  ["image/heif", new Set([".heif"])],
  ["video/mp4", new Set([".mp4", ".m4v"])],
  ["video/quicktime", new Set([".mov"])],
  ["video/webm", new Set([".webm"])],
]);

type MediaInput = {
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
};

export async function GET(request: Request) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  const operator = session.role === "operator";
  let query = getSupabase()
    .from("jobs")
    .select("*, customers!inner(name, phone)")
    .eq("upload_complete", true)
    .order("created_at", { ascending: false });
  /* A cancelled request disappears for the customer; the operator keeps seeing it
     so they know a job they may have started is off. */
  if (!operator) query = query.eq("customer_id", session.subjectId).neq("status", "cancelled");
  const { data, error } = await query;
  throwDatabaseError(error);
  const rows = (data ?? []).map((job) => flattenJob(job as Parameters<typeof flattenJob>[0]));
  rows.sort((left, right) => Number(left.status === "completed") - Number(right.status === "completed"));

  /* Message counts ride along so the list can flag hauls with something new. */
  const counts = new Map<string, number>();
  if (rows.length) {
    const { data: messages, error: messageError } = await getSupabase()
      .from("messages")
      .select("job_id")
      .in("job_id", rows.map((job) => job.id));
    throwDatabaseError(messageError);
    for (const message of (messages ?? []) as Array<{ job_id: string }>) {
      counts.set(message.job_id, (counts.get(message.job_id) ?? 0) + 1);
    }
  }

  return Response.json({ jobs: rows.map((job) => ({ ...mapJob(job), messageCount: counts.get(job.id) ?? 0 })) });
}

export async function POST(request: Request) {
  const blocked = guardMutation(request, { maxBytes: 96 * 1024 });
  if (blocked) return blocked;
  const session = await getApiSession(request);
  if (!session || session.role !== "customer") return jsonError("Please sign in as a customer.", 401);

  let insertedJobId: string | null = null;
  try {
    const body = await request.json() as {
      serviceType?: string;
      pickup?: string;
      pickupUnit?: string;
      pickupBuilding?: string;
      pickupStairs?: string;
      dropoff?: string;
      dropoffUnit?: string;
      dropoffBuilding?: string;
      dropoffStairs?: string;
      fragile?: boolean;
      description?: string;
      scheduledDate?: string;
      scheduledTime?: string;
      media?: MediaInput[];
    };
    const serviceType = textField(body.serviceType);
    const pickup = textField(body.pickup);
    const dropoff = textField(body.dropoff);
    const description = textField(body.description);
    const pickupBuilding = oneOf(body.pickupBuilding, BUILDING_TYPES);
    const pickupStairs = oneOf(body.pickupStairs, STAIRS_OPTIONS);
    const dropoffBuilding = oneOf(body.dropoffBuilding, BUILDING_TYPES);
    const dropoffStairs = oneOf(body.dropoffStairs, STAIRS_OPTIONS);
    const fragile = typeof body.fragile === "boolean" ? body.fragile : null;
    /* Only meaningful for an apartment — drop it otherwise so the row stays honest. */
    const pickupUnit = pickupBuilding === NEEDS_UNIT ? unitField(body.pickupUnit) : null;
    const dropoffUnit = dropoffBuilding === NEEDS_UNIT ? unitField(body.dropoffUnit) : null;
    const scheduledDate = textField(body.scheduledDate);
    const scheduledTime = normalizeTime(textField(body.scheduledTime));
    if (serviceType !== "junk" && serviceType !== "move") return jsonError("Choose a service.");
    if (!pickup || pickup.length > 180) return jsonError("Enter the pickup address.");
    if (serviceType === "move" && (!dropoff || dropoff.length > 180)) return jsonError("Enter a valid drop-off address.");
    if (!scheduledDate || !scheduledTime) return jsonError("Choose a date and time.");
    if (!validScheduledDate(scheduledDate)) return jsonError("Choose a date within the next year.");
    if (description.length > 1000) return jsonError("Keep the description under 1,000 characters.");

    /* The description is one free-text box. `item` is the headline the operator sees in
       their list, so derive it from the first line and keep the full text in `notes`. */
    const item = deriveItem(description, serviceType);
    const notes = description === item ? "" : description;

    const media = Array.isArray(body.media) ? body.media.map(normalizeMedia) : [];
    if (!media.length || !media.some((file) => file.contentType.startsWith("image/"))) return jsonError("Add at least one photo.");
    if (media.length > 8) return jsonError("Upload up to 8 photos or videos.");
    if (media.some((file) => !ALLOWED_MEDIA.get(file.contentType)?.has(safeExtension(file.filename)))) return jsonError("Use a supported photo or video format.");
    if (media.some((file) => file.sizeBytes > MAX_FILE_BYTES)) return jsonError("Each file must be 25 MB or smaller.");
    if (media.reduce((total, file) => total + file.sizeBytes, 0) > MAX_TOTAL_BYTES) return jsonError("Uploads must total 60 MB or less.");

    const allowed = await consumeRateLimit(request, "job-create", 6, 60 * 60, session.subjectId);
    if (!allowed) return jsonError("Too many booking attempts. Try again later.", 429);

    /* Cap how many hauls sit unclaimed per customer, so the board stays real. */
    const { count: openCount, error: countError } = await getSupabase()
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", session.subjectId)
      .eq("upload_complete", true)
      .eq("status", "requested");
    throwDatabaseError(countError);
    if ((openCount ?? 0) >= MAX_OPEN_REQUESTS) {
      return jsonError(`You already have ${MAX_OPEN_REQUESTS} hauls waiting for a driver. Once one is picked up you can book another.`, 409);
    }

    const jobId = crypto.randomUUID();
    const mediaRows: Array<{ id: string; key: string; filename: string; contentType: string; sizeBytes: number }> = [];
    for (const file of media) {
      const mediaId = crypto.randomUUID();
      const key = `jobs/${jobId}/${mediaId}${safeExtension(file.filename)}`;
      mediaRows.push({ id: mediaId, key, ...file });
    }

    const db = getSupabase();
    const { error: jobError } = await db.from("jobs").insert({
      id: jobId,
      customer_id: session.subjectId,
      service_type: serviceType,
      item,
      pickup,
      pickup_unit: pickupUnit,
      pickup_building: pickupBuilding,
      pickup_stairs: pickupStairs,
      dropoff: dropoff || null,
      dropoff_unit: serviceType === "move" ? dropoffUnit : null,
      dropoff_building: serviceType === "move" ? dropoffBuilding : null,
      dropoff_stairs: serviceType === "move" ? dropoffStairs : null,
      fragile,
      notes,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      upload_complete: false,
    });
    throwDatabaseError(jobError);
    insertedJobId = jobId;

    const { error: mediaError } = await db.from("job_media").insert(mediaRows.map(({ id, key, filename, contentType, sizeBytes }) => ({
      id,
      job_id: jobId,
      object_key: key,
      filename,
      content_type: contentType,
      size_bytes: sizeBytes,
    })));
    throwDatabaseError(mediaError);

    const uploads = await Promise.all(mediaRows.map(async ({ id, key }) => {
      const { data, error } = await getStorage().createSignedUploadUrl(key);
      throwDatabaseError(error);
      if (!data) throw new Error("Could not prepare the upload.");
      return { id, path: data.path, token: data.token };
    }));
    return Response.json({ jobId, storage: getSupabasePublicConfig(), uploads }, { status: 201 });
  } catch (error) {
    if (insertedJobId) await getSupabase().from("jobs").delete().eq("id", insertedJobId);
    return internalError(error, "jobs:create");
  }
}

function textField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/* These are optional, so anything unrecognised is stored as "not answered". */
function oneOf(value: unknown, allowed: readonly string[]) {
  const text = textField(value);
  return allowed.includes(text) ? text : null;
}

function unitField(value: unknown) {
  return textField(value).slice(0, 20) || null;
}

function deriveItem(description: string, serviceType: "junk" | "move") {
  const firstLine = description.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  if (!firstLine) return serviceType === "junk" ? "Junk removal" : "Small move";
  /* Count by code point so an emoji is never sliced into a lone surrogate — Postgres
     measures char_length the same way, and the column caps at 120. */
  const points = Array.from(firstLine);
  return points.length <= 120 ? firstLine : `${points.slice(0, 119).join("")}…`;
}

/* Accepts the browser's 24-hour "HH:MM" and stores a readable 12-hour label. */
function normalizeTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hours = Number(match[1]);
  if (hours > 23 || Number(match[2]) > 59) return "";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

function normalizeMedia(value: MediaInput) {
  const filename = Array.from(textField(value?.filename))
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join("")
    .slice(0, 180);
  const contentType = textField(value?.contentType).toLowerCase();
  const sizeBytes = Number(value?.sizeBytes);
  if (!filename || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Invalid upload details.");
  }
  return { filename, contentType, sizeBytes };
}

/* Haulway serves Edmonton, so "today" means today there — not in UTC. Judging it
   in UTC rejected the customer's own date every evening after 6pm local, when UTC
   has already rolled over to tomorrow. */
const SERVICE_TIMEZONE = "America/Edmonton";

function serviceToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SERVICE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function validScheduledDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const selected = Date.parse(`${value}T12:00:00Z`);
  const today = Date.parse(`${serviceToday()}T12:00:00Z`);
  if (Number.isNaN(selected) || Number.isNaN(today)) return false;
  return selected >= today && selected <= today + 366 * 24 * 60 * 60 * 1000;
}

function safeExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return match?.[0] ?? "";
}
