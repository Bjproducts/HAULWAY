import { getSupabase, throwDatabaseError } from "@/db";
import { recordAuditEvent } from "@/lib/audit";
import { constantTimeEqual } from "@/lib/security";

const MAX_WEBHOOK_BYTES = 16 * 1024;
const KNOWN_STATUSES = new Set(["accepted", "queued", "sending", "sent", "delivered", "undelivered", "failed"]);

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return new Response(null, { status: 415 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isSafeInteger(contentLength) || contentLength > MAX_WEBHOOK_BYTES) return new Response(null, { status: 413 });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_WEBHOOK_BYTES) return new Response(null, { status: 413 });
  const form = new URLSearchParams(raw);
  if (!await validTwilioSignature(request, form)) return new Response(null, { status: 401 });

  const providerId = form.get("MessageSid") ?? "";
  const status = (form.get("MessageStatus") ?? "").toLowerCase();
  const errorCode = form.get("ErrorCode");
  if (!/^SM[a-f0-9]{32}$/i.test(providerId) || !KNOWN_STATUSES.has(status)) return new Response(null, { status: 400 });

  const values: Record<string, string | null> = { delivery_status: status };
  if (status === "delivered") {
    values.status = "sent";
    values.delivered_at = new Date().toISOString();
    values.last_error = null;
  } else if (status === "failed" || status === "undelivered") {
    values.status = "failed";
    values.last_error = errorCode ? `Twilio delivery error ${errorCode}.` : `Twilio reported ${status}.`;
  }

  const { data, error } = await getSupabase().from("sms_outbox")
    .update(values)
    .eq("provider_id", providerId)
    .select("id, job_id, driver_application_id")
    .maybeSingle();
  throwDatabaseError(error);
  if (data) {
    await recordAuditEvent({
      request,
      actorRole: "system",
      action: "sms.delivery_status",
      targetType: data.driver_application_id ? "driver_application" : "job",
      targetId: data.driver_application_id ?? data.job_id,
      metadata: { status, errorCode: errorCode ?? null },
    });
  }
  return new Response(null, { status: 204 });
}

async function validTwilioSignature(request: Request, form: URLSearchParams) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const callbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL?.trim() ?? "";
  const supplied = request.headers.get("x-twilio-signature") ?? "";
  if (!authToken || !callbackUrl || !supplied) return false;

  const pairs = [...form.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = leftKey.localeCompare(rightKey);
    return keyOrder || leftValue.localeCompare(rightValue);
  });
  const signed = callbackUrl + pairs.map(([key, value]) => `${key}${value}`).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = Buffer.from(digest).toString("base64");
  return constantTimeEqual(expected, supplied);
}
