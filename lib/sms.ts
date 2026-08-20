import { getSupabase, throwDatabaseError } from "@/db";
import type { JobRow } from "@/lib/jobs";

type OutboxRow = {
  id: string;
  phone: string;
  body: string;
  status: "pending" | "sending" | "sent" | "failed";
  attempts: number;
};

export async function notifyJobSms(job: JobRow, eventId: string, body: string) {
  return queueSms({
    eventId,
    phone: job.customer_phone,
    body,
    jobId: job.id,
    customerId: job.customer_id,
  });
}

export async function notifyDriverApplicationSms(applicationId: string, phone: string, eventId: string, body: string) {
  return queueSms({ eventId, phone, body, driverApplicationId: applicationId });
}

async function queueSms(input: {
  eventId: string;
  phone: string;
  body: string;
  jobId?: string;
  customerId?: string;
  driverApplicationId?: string;
}) {
  try {
    const db = getSupabase();
    const message = normalizeBody(input.body);
    const { error } = await db.from("sms_outbox").upsert({
      event_id: input.eventId,
      job_id: input.jobId ?? null,
      customer_id: input.customerId ?? null,
      driver_application_id: input.driverApplicationId ?? null,
      phone: input.phone,
      body: message,
    }, { onConflict: "event_id", ignoreDuplicates: true });
    throwDatabaseError(error);

    const { data: queued, error: lookupError } = await db
      .from("sms_outbox")
      .select("id, phone, body, status, attempts")
      .eq("event_id", input.eventId)
      .maybeSingle();
    throwDatabaseError(lookupError);
    if (queued?.status !== "sent") await deliverSms(queued as OutboxRow);
  } catch (error) {
    /* The request update has already committed. Keep the API truthful and let
       the outbox retry rather than reporting the whole action as failed. */
    console.error("[sms:queue]", error instanceof Error ? error.message : error);
  }
}

export async function dispatchPendingSms(limit = 25) {
  if (!smsDeliveryConfigured()) return { configured: false, attempted: 0, sent: 0 };
  const db = getSupabase();
  const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { error: recoveryError } = await db.from("sms_outbox").update({ status: "failed", last_error: "Delivery worker interrupted." })
    .eq("status", "sending").lt("updated_at", stale);
  throwDatabaseError(recoveryError);

  const { data, error } = await db
    .from("sms_outbox")
    .select("id, phone, body, status, attempts")
    .in("status", ["pending", "failed"])
    .is("delivery_status", null)
    .lt("attempts", 8)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 100));
  throwDatabaseError(error);

  let sent = 0;
  for (const row of (data ?? []) as OutboxRow[]) {
    if (await deliverSms(row)) sent += 1;
  }
  return { configured: true, attempted: data?.length ?? 0, sent };
}

async function deliverSms(row: OutboxRow) {
  if (!smsDeliveryConfigured() || row.status === "sent" || row.attempts >= 8) return false;
  const db = getSupabase();
  const { data: claimed, error: claimError } = await db
    .from("sms_outbox")
    .update({ status: "sending", attempts: row.attempts + 1, last_error: null })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id")
    .maybeSingle();
  throwDatabaseError(claimError);
  if (!claimed) return false;

  try {
    const providerId = await sendTwilio(row.phone, row.body);
    const { error } = await db.from("sms_outbox").update({
      status: "sent",
      provider_id: providerId,
      delivery_status: "accepted",
      sent_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", row.id);
    throwDatabaseError(error);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "SMS delivery failed.";
    await db.from("sms_outbox").update({ status: "failed", last_error: message }).eq("id", row.id);
    console.error("[sms:deliver]", message);
    return false;
  }
}

async function sendTwilio(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const username = process.env.TWILIO_API_KEY || accountSid;
  const password = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN!;
  const params = new URLSearchParams({ To: to, Body: body });
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (serviceSid) params.set("MessagingServiceSid", serviceSid);
  else params.set("From", from!);
  if (statusCallback) params.set("StatusCallback", statusCallback);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const result = await response.json().catch(() => ({})) as { sid?: string; message?: string };
  if (!response.ok || !result.sid) throw new Error(result.message || `Twilio returned ${response.status}.`);
  return result.sid;
}

export function smsDeliveryConfigured() {
  const credentials = Boolean(process.env.TWILIO_ACCOUNT_SID
    && ((process.env.TWILIO_API_KEY && process.env.TWILIO_API_KEY_SECRET) || process.env.TWILIO_AUTH_TOKEN));
  const callback = process.env.TWILIO_STATUS_CALLBACK_URL?.trim() ?? "";
  let callbackValid = false;
  try { callbackValid = new URL(callback).protocol === "https:"; } catch { /* invalid callback */ }
  return credentials
    && Boolean(process.env.TWILIO_AUTH_TOKEN)
    && Boolean(process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)
    && callbackValid;
}

function normalizeBody(value: string) {
  const body = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(body).slice(0, 480).join("");
}
