import { getSupabase, throwDatabaseError } from "@/db";
import { getApiSession } from "@/lib/auth";
import { canAccessJob, getJobDetails, getJobRow } from "@/lib/jobs";
import { getErrorMessage, jsonError } from "@/lib/responses";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  try {
    const { id } = await context.params;
    const job = await getJobRow(id);
    if (!job) return jsonError("Job not found.", 404);
    if (!canAccessJob(session, job)) return jsonError("You cannot access this job.", 403);
    const { body } = await request.json() as { body?: string };
    const message = body?.trim() ?? "";
    if (!message || message.length > 1000) return jsonError("Enter a message under 1,000 characters.");
    const { error } = await getSupabase().from("messages").insert({
      id: crypto.randomUUID(),
      job_id: id,
      sender: session.role,
      body: message,
    });
    throwDatabaseError(error);
    return Response.json({ job: await getJobDetails(id) }, { status: 201 });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}
