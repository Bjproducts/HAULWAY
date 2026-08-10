import { ensureSchema, getD1, getUploads } from "@/db";
import { getApiSession } from "@/lib/auth";
import { canAccessJob, type JobRow } from "@/lib/jobs";
import { jsonError } from "@/lib/responses";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  await ensureSchema();
  const { id } = await context.params;
  const row = await getD1().prepare(`SELECT m.object_key, m.filename, m.content_type, j.*,
    c.name AS customer_name, c.phone AS customer_phone
    FROM job_media m JOIN jobs j ON j.id = m.job_id JOIN customers c ON c.id = j.customer_id
    WHERE m.id = ?`).bind(id).first<JobRow & { object_key: string; filename: string; content_type: string }>();
  if (!row) return jsonError("File not found.", 404);
  if (!canAccessJob(session, row)) return jsonError("You cannot access this file.", 403);
  const object = await getUploads().get(row.object_key);
  if (!object) return jsonError("File not found.", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Disposition": `inline; filename="${row.filename.replace(/["\\]/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
      ETag: object.httpEtag,
    },
  });
}
