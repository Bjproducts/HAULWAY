import { getApiSession } from "@/lib/auth";
import { INTERAC_EMAIL } from "@/lib/contracts";
import { addSystemMessage, canAccessJob, getJobDetails, getJobRow, updateJob } from "@/lib/jobs";
import { internalError, jsonError } from "@/lib/responses";
import { guardMutation } from "@/lib/security";
import { notifyJobSms } from "@/lib/sms";

type Context = { params: Promise<{ id: string }> };

/* A customer can back out until they have accepted a quote. */
const CANCELLABLE = new Set(["requested", "approved", "quoted"]);
const ETA_STATUSES = new Set(["approved", "quoted", "accepted", "in_progress"]);
const COMPLETABLE = new Set(["accepted", "in_progress"]);

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
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  const session = await getApiSession(request);
  if (!session) return jsonError("Please sign in.", 401);
  try {
    const { id } = await context.params;
    const job = await getJobRow(id);
    if (!job) return jsonError("Job not found.", 404);
    if (!canAccessJob(session, job)) return jsonError("You cannot access this job.", 403);
    const body = await request.json() as { action?: string; amount?: number; method?: string; eta?: string };
    if (job.status === "cancelled") return jsonError("This request was cancelled.", 409);
    let smsEvent: { id: string; body: string } | null = null;

    if (body.action === "approve_request") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      if (job.status !== "requested") return jsonError("This request was already accepted.");
      await updateJob(id, { status: "approved" });
      smsEvent = {
        id: await addSystemMessage(id, "Haulway accepted your request. Your quote will arrive in this chat."),
        body: "HAULWAY update: A driver accepted your request. Open the app for live ETA tracking.",
      };
    } else if (body.action === "set_eta") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      if (!ETA_STATUSES.has(job.status)) return jsonError("An ETA can only be set for an active request.");
      const eta = (body.eta ?? "").trim().slice(0, 40);
      if (!eta) return jsonError("Enter an ETA.");
      await updateJob(id, { eta });
      smsEvent = {
        id: await addSystemMessage(id, `Driver ETA: ${eta}.`),
        body: `HAULWAY update: Your driver ETA is ${eta}.`,
      };
    } else if (body.action === "cancel_request") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (!CANCELLABLE.has(job.status)) return jsonError("This haul is already booked. Message Haulway in chat to change it.");
      await updateJob(id, { status: "cancelled" });
      smsEvent = {
        id: await addSystemMessage(id, "The customer cancelled this request."),
        body: "HAULWAY confirmation: Your request was cancelled.",
      };
    } else if (body.action === "send_quote") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      if (job.status !== "approved" && job.status !== "quoted") return jsonError("Accept the request before sending a quote.");
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return jsonError("Enter a valid quote amount.");
      const cents = Math.round(amount * 100);
      await updateJob(id, { quote_cents: cents, status: "quoted" });
      smsEvent = {
        id: await addSystemMessage(id, `Quote sent: ${formatMoney(cents)}.`),
        body: `HAULWAY update: Your quote is ready for ${formatMoney(cents)}. Open the app to review it.`,
      };
    } else if (body.action === "accept_quote") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (job.status !== "quoted" || !job.quote_cents) return jsonError("There is no quote to accept.");
      await updateJob(id, { status: "accepted" });
      smsEvent = {
        id: await addSystemMessage(id, `Quote accepted: ${formatMoney(job.quote_cents)}.`),
        body: `HAULWAY confirmation: Your ${formatMoney(job.quote_cents)} quote was accepted and your haul is booked.`,
      };
    } else if (body.action === "decline_quote") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (job.status !== "quoted" || !job.quote_cents) return jsonError("There is no quote to decline.");
      /* Back to approved, not requested — the driver already took the job. */
      await updateJob(id, { quote_cents: null, status: "approved" });
      smsEvent = {
        id: await addSystemMessage(id, "Quote declined. You can discuss a different price here."),
        body: "HAULWAY confirmation: You declined the quote. Open the app to discuss a different price.",
      };
    } else if (body.action === "payment_method") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      /* Payment is settled after the job, not when the quote is accepted. */
      if (job.status !== "completed") return jsonError("Payment is arranged once the job is confirmed complete.");
      if (job.payment_status === "paid") return jsonError("The payment method cannot be changed after payment is received.", 409);
      if (body.method !== "interac" && body.method !== "cash") return jsonError("Choose Interac or cash.");
      await updateJob(id, { payment_method: body.method });
      const paymentMessage = body.method === "interac"
        ? `Payment method: Interac e-Transfer. Send it to ${INTERAC_EMAIL}.`
        : "Payment method: cash, paid directly to the driver.";
      smsEvent = {
        id: await addSystemMessage(id, paymentMessage),
        body: `HAULWAY payment update: ${paymentMessage}`,
      };
    } else if (body.action === "mark_paid") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      if (job.status !== "completed") return jsonError("The job must be completed before payment is recorded.");
      if (!job.payment_method) return jsonError("The customer must choose a payment method first.");
      if (job.payment_status === "paid") return jsonError("Payment was already marked as received.", 409);
      await updateJob(id, { payment_status: "paid" });
      smsEvent = {
        id: await addSystemMessage(id, "Payment marked as received."),
        body: "HAULWAY confirmation: Your payment was received. Thank you.",
      };
    } else if (body.action === "confirm_complete") {
      if (!COMPLETABLE.has(job.status)) return jsonError("Only an active booked job can be confirmed complete.");
      const confirmationField = session.role === "operator" ? "operator_confirmed" : "customer_confirmed";
      if (job[confirmationField]) return jsonError("You already confirmed this job.", 409);
      await updateJob(id, { [confirmationField]: true });
      const updated = await getJobRow(id);
      if (updated?.customer_confirmed && updated.operator_confirmed) {
        await updateJob(id, { status: "completed" });
        smsEvent = {
          id: await addSystemMessage(id, "Job completed and confirmed by both sides. Choose how you'd like to pay."),
          body: "HAULWAY update: Your haul is complete. Open the app to choose cash or Interac payment.",
        };
      } else {
        const confirmer = session.role === "operator" ? "Haulway" : "Customer";
        smsEvent = {
          id: await addSystemMessage(id, `${confirmer} confirmed the job is complete.`),
          body: `HAULWAY update: ${confirmer} confirmed the job is complete. The other side still needs to confirm.`,
        };
      }
    } else {
      return jsonError("Unknown action.");
    }

    if (smsEvent) await notifyJobSms(job, smsEvent.id, smsEvent.body);
    return Response.json({ job: await getJobDetails(id) });
  } catch (error) {
    return internalError(error, "jobs:action");
  }
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}
