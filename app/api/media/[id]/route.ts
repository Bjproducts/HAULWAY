import { getSupabase, getUploads, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { canAccessJob, getJobRow } from "@/lib/jobs";
import { jsonError } from "@/lib/responses";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  const { id } = await context.params;
  const { data: media, error } = await getSupabase()
    .from("job_media")
    .select("object_key, filename, content_type, job_id")
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  if (!media) return jsonError("File not found.", 404);
  const job = await getJobRow(media.job_id);
  if (!job) return jsonError("File not found.", 404);
  if (!canAccessJob(session, job)) return jsonError("You cannot access this file.", 403);
  const object = await getUploads().get(media.object_key);
  if (!object) return jsonError("File not found.", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": media.content_type,
      "Content-Disposition": `inline; filename="${media.filename.replace(/["\\]/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
      ETag: object.httpEtag,
    },
  });
}
