import { getStorage, getSupabase, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { addSystemMessage, canAccessJob, getJobDetails, getJobRow } from "@/lib/jobs";
import { internalError, jsonError } from "@/lib/responses";
import { guardMutation } from "@/lib/security";
import { notifyJobSms } from "@/lib/sms";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const blocked = guardMutation(request, { json: false });
  if (blocked) return blocked;
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

    const { error: finalizeError } = await getSupabase().from("jobs").update({ upload_complete: true }).eq("id", id);
    /* The database serializes finalization for this customer, closing the tiny
       race between two tabs without counting abandoned upload drafts. */
    if (finalizeError?.code === "23505") {
      return jsonError("You already have an active haul. Finish or cancel it before booking another.", 409);
    }
    throwDatabaseError(finalizeError);
    const eventId = await addSystemMessage(id, "Request received. We’ll review the details and send your quote here.");
    await notifyJobSms(job, eventId, "HAULWAY: We received your request and are finding a driver. Updates will be sent here. Reply STOP to opt out.");
    return Response.json({ job: await getJobDetails(id) }, { status: 201 });
  } catch (error) {
    return internalError(error, "jobs:uploads:finalize");
  }
}

export async function DELETE(request: Request, context: Context) {
  const blocked = guardMutation(request, { json: false });
  if (blocked) return blocked;
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
    return internalError(error, "jobs:uploads:discard");
  }
}
