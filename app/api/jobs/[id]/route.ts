import { ensureSchema, getD1 } from "@/db";
import { getApiSession } from "@/lib/auth";
import { canAccessJob, getJobDetails, getJobRow } from "@/lib/jobs";
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
    await ensureSchema();
    const { id } = await context.params;
    const job = await getJobRow(id);
    if (!job) return jsonError("Job not found.", 404);
    if (!canAccessJob(session, job)) return jsonError("You cannot access this job.", 403);
    const body = await request.json() as { action?: string; amount?: number; method?: string };
    const db = getD1();

    if (body.action === "send_quote") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return jsonError("Enter a valid quote amount.");
      const cents = Math.round(amount * 100);
      await db.batch([
        db.prepare("UPDATE jobs SET quote_cents = ?, status = 'quoted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(cents, id),
        systemMessage(db, id, `Quote sent: ${formatMoney(cents)}.`),
      ]);
    } else if (body.action === "accept_quote") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (!job.quote_cents) return jsonError("There is no quote to accept.");
      await db.batch([
        db.prepare("UPDATE jobs SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id),
        systemMessage(db, id, `Quote accepted: ${formatMoney(job.quote_cents)}.`),
      ]);
    } else if (body.action === "decline_quote") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (!job.quote_cents) return jsonError("There is no quote to decline.");
      await db.batch([
        db.prepare("UPDATE jobs SET quote_cents = NULL, status = 'requested', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id),
        systemMessage(db, id, "Quote declined. You can discuss a different price in chat."),
      ]);
    } else if (body.action === "payment_method") {
      if (session.role !== "customer") return jsonError("Customer access required.", 403);
      if (job.status !== "accepted" && job.status !== "in_progress") return jsonError("Accept the quote before choosing payment.");
      if (body.method !== "interac" && body.method !== "cash") return jsonError("Choose Interac or cash.");
      await db.batch([
        db.prepare("UPDATE jobs SET payment_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.method, id),
        systemMessage(db, id, body.method === "interac" ? "Payment method: Interac e-Transfer." : "Payment method: cash."),
      ]);
    } else if (body.action === "mark_paid") {
      if (session.role !== "operator") return jsonError("Operator access required.", 403);
      await db.batch([
        db.prepare("UPDATE jobs SET payment_status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id),
        systemMessage(db, id, "Payment marked as received."),
      ]);
    } else if (body.action === "confirm_complete") {
      const confirmationField = session.role === "operator" ? "operator_confirmed" : "customer_confirmed";
      await db.prepare(`UPDATE jobs SET ${confirmationField} = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
      const updated = await getJobRow(id);
      if (updated?.customer_confirmed && updated.operator_confirmed) {
        await db.batch([
          db.prepare("UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id),
          systemMessage(db, id, "Job completed and confirmed by both sides."),
        ]);
      } else {
        await systemMessage(db, id, `${session.role === "operator" ? "Haulway" : "Customer"} confirmed the job is complete.`).run();
      }
    } else {
      return jsonError("Unknown action.");
    }

    return Response.json({ job: await getJobDetails(id) });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}

function systemMessage(db: D1Database, jobId: string, body: string) {
  return db.prepare("INSERT INTO messages (id, job_id, sender, body) VALUES (?, ?, 'system', ?)")
    .bind(crypto.randomUUID(), jobId, body);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}
