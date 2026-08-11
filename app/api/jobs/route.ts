import { getStorage, getSupabase, getSupabasePublicConfig, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { BUILDING_TYPES, STAIRS_OPTIONS } from "@/lib/contracts";
import { flattenJob, mapJob } from "@/lib/jobs";
import { getErrorMessage, jsonError } from "@/lib/responses";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

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
  return Response.json({ jobs: rows.map(mapJob) });
}

export async function POST(request: Request) {
  const session = await getApiSession(request);
  if (!session || session.role !== "customer") return jsonError("Please sign in as a customer.", 401);

  let insertedJobId: string | null = null;
  try {
    const body = await request.json() as {
      serviceType?: string;
      pickup?: string;
      pickupBuilding?: string;
      pickupStairs?: string;
      dropoff?: string;
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
    const scheduledDate = textField(body.scheduledDate);
    const scheduledTime = normalizeTime(textField(body.scheduledTime));
    if (serviceType !== "junk" && serviceType !== "move") return jsonError("Choose a service.");
    if (!pickup || pickup.length > 180) return jsonError("Enter the pickup address.");
    if (serviceType === "move" && !dropoff) return jsonError("Enter the drop-off address.");
    if (!scheduledDate || !scheduledTime) return jsonError("Choose a date and time.");
    if (description.length > 1000) return jsonError("Keep the description under 1,000 characters.");

    /* The description is one free-text box. `item` is the headline the operator sees in
       their list, so derive it from the first line and keep the full text in `notes`. */
    const item = deriveItem(description, serviceType);
    const notes = description === item ? "" : description;

    const media = Array.isArray(body.media) ? body.media.map(normalizeMedia) : [];
    if (!media.length || !media.some((file) => file.contentType.startsWith("image/"))) return jsonError("Add at least one photo.");
    if (media.length > 8) return jsonError("Upload up to 8 photos or videos.");
    if (media.some((file) => !file.contentType.startsWith("image/") && !file.contentType.startsWith("video/"))) return jsonError("Only photos and videos are allowed.");
    if (media.some((file) => file.sizeBytes > MAX_FILE_BYTES)) return jsonError("Each file must be 25 MB or smaller.");
    if (media.reduce((total, file) => total + file.sizeBytes, 0) > MAX_TOTAL_BYTES) return jsonError("Uploads must total 60 MB or less.");

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
      pickup_building: pickupBuilding,
      pickup_stairs: pickupStairs,
      dropoff: dropoff || null,
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
    return jsonError(getErrorMessage(error), 500);
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
  if (!match) return value.slice(0, 40);
  const hours = Number(match[1]);
  if (hours > 23 || Number(match[2]) > 59) return "";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

function normalizeMedia(value: MediaInput) {
  const filename = textField(value?.filename).slice(0, 180);
  const contentType = textField(value?.contentType).toLowerCase();
  const sizeBytes = Number(value?.sizeBytes);
  if (!filename || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Invalid upload details.");
  }
  return { filename, contentType, sizeBytes };
}

function safeExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return match?.[0] ?? "";
}
