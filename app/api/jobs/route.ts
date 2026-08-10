import { getSupabase, getUploads, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { flattenJob, getJobDetails, mapJob } from "@/lib/jobs";
import { getErrorMessage, jsonError } from "@/lib/responses";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

export async function GET(request: Request) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  const operator = session.role === "operator";
  let query = getSupabase()
    .from("jobs")
    .select("*, customers!inner(name, phone)")
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

  const storedKeys: string[] = [];
  let insertedJobId: string | null = null;
  try {
    const form = await request.formData();
    const serviceType = textField(form, "serviceType");
    const item = textField(form, "item");
    const pickup = textField(form, "pickup");
    const dropoff = textField(form, "dropoff");
    const notes = textField(form, "notes");
    const scheduledDate = textField(form, "scheduledDate");
    const scheduledTime = textField(form, "scheduledTime");
    if (serviceType !== "junk" && serviceType !== "move") return jsonError("Choose a service.");
    if (!item || item.length > 120) return jsonError("Tell us what needs hauling.");
    if (!pickup || pickup.length > 180) return jsonError("Enter the pickup address.");
    if (serviceType === "move" && !dropoff) return jsonError("Enter the drop-off address.");
    if (!scheduledDate || !scheduledTime) return jsonError("Choose a date and time.");
    if (notes.length > 1000) return jsonError("Keep notes under 1,000 characters.");

    const files = form.getAll("media").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length || !files.some((file) => file.type.startsWith("image/"))) return jsonError("Add at least one photo.");
    if (files.length > 8) return jsonError("Upload up to 8 photos or videos.");
    if (files.some((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/"))) return jsonError("Only photos and videos are allowed.");
    if (files.some((file) => file.size > MAX_FILE_BYTES)) return jsonError("Each file must be 25 MB or smaller.");
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) return jsonError("Uploads must total 60 MB or less.");

    const jobId = crypto.randomUUID();
    const bucket = getUploads();
    const mediaRows: Array<{ id: string; key: string; file: File }> = [];
    for (const file of files) {
      const mediaId = crypto.randomUUID();
      const extension = safeExtension(file.name);
      const key = `jobs/${jobId}/${mediaId}${extension}`;
      await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      storedKeys.push(key);
      mediaRows.push({ id: mediaId, key, file });
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
    });
    throwDatabaseError(jobError);
    insertedJobId = jobId;

    const { error: mediaError } = await db.from("job_media").insert(mediaRows.map(({ id, key, file }) => ({
      id,
      job_id: jobId,
      object_key: key,
      filename: file.name.slice(0, 180),
      content_type: file.type,
      size_bytes: file.size,
    })));
    throwDatabaseError(mediaError);

    const { error: messageError } = await db.from("messages").insert({
      id: crypto.randomUUID(),
      job_id: jobId,
      sender: "system",
      body: "Request received. We’ll review the details and send your quote here.",
    });
    throwDatabaseError(messageError);
    return Response.json({ job: await getJobDetails(jobId) }, { status: 201 });
  } catch (error) {
    if (storedKeys.length) await Promise.all(storedKeys.map((key) => getUploads().delete(key)));
    if (insertedJobId) await getSupabase().from("jobs").delete().eq("id", insertedJobId);
    return jsonError(getErrorMessage(error), 500);
  }
}

function textField(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return match?.[0] ?? "";
}
