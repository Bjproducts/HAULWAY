import { getStorage, getSupabase, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { canAccessJob, getJobRow } from "@/lib/jobs";
import { internalError, jsonError } from "@/lib/responses";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);

  try {
    const { id } = await context.params;
    const { data: media, error } = await getSupabase()
      .from("job_media")
      .select("object_key, job_id")
      .eq("id", id)
      .maybeSingle();
    throwDatabaseError(error);
    if (!media) return jsonError("File not found.", 404);
    const job = await getJobRow(media.job_id);
    if (!job || !job.upload_complete) return jsonError("File not found.", 404);
    if (!canAccessJob(session, job)) return jsonError("You cannot access this file.", 403);

    const { data, error: storageError } = await getStorage().createSignedUrl(media.object_key, 60);
    throwDatabaseError(storageError);
    if (!data) return jsonError("File not found.", 404);
    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    return internalError(error, "media:read");
  }
}
