import { getStorage, getSupabase, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { addSystemMessage, canAccessJob, getJobDetails, getJobRow } from "@/lib/jobs";
import { UnsafeMediaError, verifyStoredMediaHeader } from "@/lib/media";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation } from "@/lib/security";
import { notifyJobSms } from "@/lib/sms";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const blocked = guardMutation(request, { json: false });
  if (blocked) return blocked;
  const session = await getApiSession(request);
  if (!session || session.role !== "customer") return jsonError("Please sign in as a customer.", 401);
  const { id } = await context.params;

  try {
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

    const allowed = await consumeRateLimit(request, "job-upload-finalize", 12, 60 * 60, session.subjectId);
    if (!allowed) return jsonError("Too many upload attempts. Try again later.", 429);

    await Promise.all(media.map(async (file) => {
      if (!file.object_key.startsWith(`jobs/${id}/`)) throw new UnsafeMediaError("An upload path is invalid.");
      const { data, error: storageError } = await getStorage().info(file.object_key);
      throwDatabaseError(storageError);
      if (!data || Number(data.size) !== file.size_bytes || data.contentType !== file.content_type) {
        throw new UnsafeMediaError("An upload is incomplete or invalid.");
      }
      await verifyStoredMediaHeader(file.object_key, file.content_type);
    }));

    const verifiedAt = new Date().toISOString();
    const { error: verificationError } = await getSupabase().from("job_media").update({ verified_at: verifiedAt }).eq("job_id", id);
    throwDatabaseError(verificationError);

    const { data: finalized, error: finalizeError } = await getSupabase().from("jobs")
      .update({ upload_complete: true })
      .eq("id", id)
      .eq("updated_at", job.updated_at)
      .select("id")
      .maybeSingle();
    /* The database serializes finalization for this customer, closing the tiny
       race between two tabs without counting abandoned upload drafts. */
    if (finalizeError?.code === "23505") {
      return jsonError("You already have an active haul. Finish it or ask Haulway to close it before booking another.", 409);
    }
    throwDatabaseError(finalizeError);
    if (!finalized) return jsonError("This upload changed while it was being verified. Start the booking again.", 409);
    const eventId = await addSystemMessage(id, "Request received. We’ll review the details and send your quote here.");
    await notifyJobSms(job, eventId, "HAULWAY: We received your request and are finding a driver. Updates will be sent here. Reply STOP to opt out.");
    await recordAuditEvent({
      request,
      session,
      action: "job.upload.finalize",
      targetType: "job",
      targetId: id,
      metadata: { files: media.length, verified: true },
    });
    return Response.json({ job: await getJobDetails(id) }, { status: 201 });
  } catch (error) {
    if (error instanceof UnsafeMediaError) {
      const { data: rows } = await getSupabase().from("job_media").select("object_key").eq("job_id", id);
      const keys = (rows ?? []).map((row) => row.object_key);
      if (keys.length) await getStorage().remove(keys);
      await getSupabase().from("jobs").delete().eq("id", id).eq("customer_id", session.subjectId).eq("upload_complete", false);
      await recordAuditEvent({
        request,
        session,
        action: "job.upload.rejected",
        targetType: "job",
        targetId: id,
        metadata: { reason: error.message },
      });
    }
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
