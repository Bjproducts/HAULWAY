import { getApiSession } from "@/lib/auth";
import { addSystemMessage, canAccessJob, getJobDetails, getJobRow, updateJob } from "@/lib/jobs";
import { getErrorMessage, jsonError } from "@/lib/responses";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  const { id } = await context.params;
  const job = await getJobRow(id);
  if (!job) return jsonError("Job not found.", 404);
  if (!canAccessJob(session, job)) return jsonError("You cannot access this job.", 403);
  return Response.json({ job: await getJobDetails(id) });
}

export async function PATCH(request: Request, context: Context) {
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  try {
    const { id } = await context.params;
    const job = await getJobRow(id);
    if (!job) return jsonError("Job not found.", 404);
    if (!canAccessJob(session, job)) return jsonError("You cannot access this job.", 403);
    const body = await request.json() as { action?: string; amount?: number; method?: string };

    if (body.action === "send_quote") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return jsonError("Enter a valid quote amount.");
      const cents = Math.round(amount * 100);
      await updateJob(id, { quote_cents: cents, status: "quoted" });
      await addSystemMessage(id, `Quote sent: ${formatMoney(cents)}.`);
    } else if (body.action === "accept_quote") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (!job.quote_cents) return jsonError("There is no quote to accept.");
      await updateJob(id, { status: "accepted" });
      await addSystemMessage(id, `Quote accepted: ${formatMoney(job.quote_cents)}.`);
    } else if (body.action === "decline_quote") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (!job.quote_cents) return jsonError("There is no quote to decline.");
      await updateJob(id, { quote_cents: null, status: "requested" });
      await addSystemMessage(id, "Quote declined. You can discuss a different price in chat.");
    } else if (body.action === "payment_method") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (job.status !== "accepted" && job.status !== "in_progress") return jsonError("Accept the quote before choosing payment.");
      if (body.method !== "interac" && body.method !== "cash") return jsonError("Choose Interac or cash.");
      await updateJob(id, { payment_method: body.method });
      await addSystemMessage(id, body.method === "interac" ? "Payment method: Interac e-Transfer." : "Payment method: cash.");
    } else if (body.action === "mark_paid") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      await updateJob(id, { payment_status: "paid" });
      await addSystemMessage(id, "Payment marked as received.");
    } else if (body.action === "confirm_complete") {
      const confirmationField = session.role === "operator" ? "operator_confirmed" : "customer_confirmed";
      await updateJob(id, { [confirmationField]: true });
      const updated = await getJobRow(id);
      if (updated?.customer_confirmed && updated.operator_confirmed) {
        await updateJob(id, { status: "completed" });
        await addSystemMessage(id, "Job completed and confirmed by both sides.");
      } else {
        await addSystemMessage(id, `${session.role === "operator" ? "Haulway" : "Customer"} confirmed the job is complete.`);
      }
    } else {
      return jsonError("Unknown action.");
    }

    return Response.json({ job: await getJobDetails(id) });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}
