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
const ARRIVAL_STATUSES = new Set(["approved", "quoted", "accepted", "in_progress"]);

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
    const body = await request.json() as { action?: string; amount?: number; method?: string; etaMinutes?: number; rating?: number; skip?: boolean };
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
      if (job.driver_arrived_at || job.status === "in_progress") return jsonError("The driver has already marked this haul as arrived.", 409);
      const etaMinutes = Number(body.etaMinutes);
      if (!Number.isInteger(etaMinutes) || etaMinutes < 1 || etaMinutes > 360) return jsonError("Enter an ETA from 1 to 360 minutes.");
      const eta = `${etaMinutes} min`;
      const etaDueAt = new Date(Date.now() + etaMinutes * 60_000).toISOString();
      await updateJob(id, { eta: etaDueAt });
      smsEvent = {
        id: await addSystemMessage(id, `Driver ETA: ${eta}.`),
        body: `HAULWAY update: Your driver ETA is ${eta}.`,
      };
    } else if (body.action === "mark_arrived") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      if (job.driver_arrived_at || job.status === "in_progress") return jsonError("Arrival was already confirmed.", 409);
      if (!ARRIVAL_STATUSES.has(job.status)) return jsonError("Arrival can only be marked for an active request.");
      await updateJob(id, {
        driver_arrived_at: new Date().toISOString(),
        status: job.status === "accepted" ? "in_progress" : job.status,
        eta: null,
      });
      smsEvent = {
        id: await addSystemMessage(id, "Your driver has arrived at the pickup address."),
        body: "HAULWAY update: Your driver has arrived at the pickup address.",
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
      await updateJob(id, { status: job.driver_arrived_at ? "in_progress" : "accepted" });
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
      if (job.status !== "in_progress") return jsonError("Mark the driver as arrived before confirming the job complete.");
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
    } else if (body.action === "rate_job") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (job.status !== "completed") return jsonError("A rating can only be left after the haul is complete.");
      if (!job.payment_method) return jsonError("Choose a payment method before finishing your haul.");
      const details = await getJobDetails(id);
      if (details?.customerRating != null || details?.ratingSkipped) return jsonError("You already finished the rating step.", 409);
      const rating = Number(body.rating);
      if (body.skip !== true && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return jsonError("Choose a rating from 1 to 5 stars.");
      const values: Record<string, string | number | boolean | null> = body.skip === true
        ? { rating_skipped: true, rated_at: new Date().toISOString() }
        : { customer_rating: rating, rating_skipped: false, rated_at: new Date().toISOString() };
      try {
        await updateJob(id, values);
      } catch (error) {
        /* Keep the release functional while the additive ratings migration is
           rolling out. The existing messages table is durable Supabase storage;
           once migrated, new ratings use dedicated queryable columns. */
        if (!(error instanceof Error) || !/customer_rating|rating_skipped|rated_at|schema cache/i.test(error.message)) throw error;
        await addSystemMessage(id, body.skip === true ? "Customer skipped the optional rating." : `Customer rated this haul ${rating}/5.`);
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
