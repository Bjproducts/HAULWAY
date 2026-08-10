import { getStorage, getSupabase, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { addSystemMessage, canAccessJob, getJobDetails, getJobRow, updateJob } from "@/lib/jobs";
import { getErrorMessage, jsonError } from "@/lib/responses";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const session = await getApiSession(request);
  if (!session || session.role !== "customer") return jsonError("Please sign in as a customer.", 401);

  try {
    const { id } = await context.params;
    const job = await getJobRow(id);
    if (!job) return jsonError("Job not found.", 404);
    if (!canAccessJob(session, job)) return jsonError("You cannot access this job.", 403);
    if (job.upload_complete) return Response.json({ job: await getJobDetails(id) });

    const { data: media, error } = await getSupabase()
      .from("job_media")
      .select("object_key, size_bytes, content_type")
      .eq("job_id", id);
    throwDatabaseError(error);
    if (!media?.length) return jsonError("No uploads were prepared.");

    await Promise.all(media.map(async (file) => {
      const { data, error: storageError } = await getStorage().info(file.object_key);
      throwDatabaseError(storageError);
      if (!data || Number(data.size) !== file.size_bytes || data.contentType !== file.content_type) {
        throw new Error("An upload is incomplete or invalid.");
      }
    }));

    await updateJob(id, { upload_complete: true });
    await addSystemMessage(id, "Request received. We’ll review the details and send your quote here.");
    return Response.json({ job: await getJobDetails(id) }, { status: 201 });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}

export async function DELETE(request: Request, context: Context) {
  const session = await getApiSession(request);
  if (!session || session.role !== "customer") return jsonError("Please sign in as a customer.", 401);

  try {
    const { id } = await context.params;
    const job = await getJobRow(id);
    if (!job) return Response.json({ ok: true });
    if (!canAccessJob(session, job)) return jsonError("You cannot access this job.", 403);
    if (job.upload_complete) return jsonError("Completed uploads cannot be discarded.", 409);

    const { data: media, error } = await getSupabase().from("job_media").select("object_key").eq("job_id", id);
    throwDatabaseError(error);
    const keys = (media ?? []).map((file) => file.object_key);
    if (keys.length) {
      const { error: storageError } = await getStorage().remove(keys);
      throwDatabaseError(storageError);
    }
    const { error: deleteError } = await getSupabase().from("jobs").delete().eq("id", id);
    throwDatabaseError(deleteError);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}
