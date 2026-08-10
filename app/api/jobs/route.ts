import { getStorage, getSupabase, getSupabasePublicConfig, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
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
  if (!operator) query = query.eq("customer_id", session.subjectId);
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
      item?: string;
      pickup?: string;
      dropoff?: string;
      notes?: string;
      scheduledDate?: string;
      scheduledTime?: string;
      media?: MediaInput[];
    };
    const serviceType = textField(body.serviceType);
    const item = textField(body.item);
    const pickup = textField(body.pickup);
    const dropoff = textField(body.dropoff);
    const notes = textField(body.notes);
    const scheduledDate = textField(body.scheduledDate);
    const scheduledTime = textField(body.scheduledTime);
    if (serviceType !== "junk" && serviceType !== "move") return jsonError("Choose a service.");
    if (!item || item.length > 120) return jsonError("Tell us what needs hauling.");
    if (!pickup || pickup.length > 180) return jsonError("Enter the pickup address.");
    if (serviceType === "move" && !dropoff) return jsonError("Enter the drop-off address.");
    if (!scheduledDate || !scheduledTime) return jsonError("Choose a date and time.");
    if (notes.length > 1000) return jsonError("Keep notes under 1,000 characters.");

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
      dropoff: dropoff || null,
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
