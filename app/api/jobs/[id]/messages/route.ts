import { getSupabase, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { canAccessJob, getJobDetails, getJobRow } from "@/lib/jobs";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody } from "@/lib/security";
import { notifyJobSms } from "@/lib/sms";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  try {
    const { id } = await context.params;
    const job = await getJobRow(id);
    if (!job) return jsonError("Job not found.", 404);
    if (!canAccessJob(session, job)) return jsonError("You cannot access this job.", 403);
    const { body } = await readJsonBody<{ body?: string }>(request);
    const message = body?.trim() ?? "";
    if (!message || message.length > 1000) return jsonError("Enter a message under 1,000 characters.");
    const allowed = await consumeRateLimit(request, "job-message", 30, 5 * 60, session.subjectId);
    if (!allowed) return jsonError("Too many messages. Wait a few minutes and try again.", 429);
    const messageId = crypto.randomUUID();
    const { error } = await getSupabase().from("messages").insert({
      id: messageId,
      job_id: id,
      sender: session.role,
      body: message,
    });
    throwDatabaseError(error);
    await recordAuditEvent({
      request,
      session,
      action: "job.message.create",
      targetType: "job",
      targetId: id,
      metadata: { sender: session.role, length: Array.from(message).length },
    });
    if (session.role === "operator") {
      const preview = Array.from(message.replace(/\s+/g, " ")).slice(0, 280).join("");
      await notifyJobSms(job, messageId, `HAULWAY message: ${preview}`);
    }
    return Response.json({ job: await getJobDetails(id) }, { status: 201 });
  } catch (error) {
    return internalError(error, "jobs:message");
  }
}
