import { ensureSchema, getD1, getUploads } from "@/db";
import { getApiSession } from "@/lib/auth";
import { getJobDetails, mapJob, type JobRow } from "@/lib/jobs";
import { getErrorMessage, jsonError } from "@/lib/responses";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

export async function GET(request: Request) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  await ensureSchema();
  const operator = session.role === "operator";
  const sql = `SELECT j.*, c.name AS customer_name, c.phone AS customer_phone
    FROM jobs j JOIN customers c ON c.id = j.customer_id
    ${operator ? "" : "WHERE j.customer_id = ?"}
    ORDER BY CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END, j.created_at DESC`;
  const statement = getD1().prepare(sql);
  const rows = operator
    ? await statement.all<JobRow>()
    : await statement.bind(session.subjectId).all<JobRow>();
  return Response.json({ jobs: rows.results.map(mapJob) });
}

export async function POST(request: Request) {
  const session = await getApiSession(request);
  if (!session || session.role !== "customer") return jsonError("Please sign in as a customer.", 401);

  const storedKeys: string[] = [];
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

    await ensureSchema();
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

    const db = getD1();
    const statements = [
      db.prepare(`INSERT INTO jobs
        (id, customer_id, service_type, item, pickup, dropoff, notes, scheduled_date, scheduled_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(jobId, session.subjectId, serviceType, item, pickup, dropoff || null, notes, scheduledDate, scheduledTime),
      ...mediaRows.map(({ id, key, file }) => db.prepare(`INSERT INTO job_media
        (id, job_id, object_key, filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, jobId, key, file.name.slice(0, 180), file.type, file.size)),
      db.prepare("INSERT INTO messages (id, job_id, sender, body) VALUES (?, ?, 'system', ?)")
        .bind(crypto.randomUUID(), jobId, "Request received. We’ll review the details and send your quote here."),
    ];
    await db.batch(statements);
    return Response.json({ job: await getJobDetails(jobId) }, { status: 201 });
  } catch (error) {
    if (storedKeys.length) await Promise.all(storedKeys.map((key) => getUploads().delete(key)));
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
