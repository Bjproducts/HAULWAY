import { getSupabaseAuth } from "@/db";
import { normalizePhone } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody, refundRateLimit } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const body = await readJsonBody<{ name?: string; phone?: string; smsConsented?: boolean; turnstileToken?: string }>(request);
    const name = body.name?.trim().replace(/\s+/g, " ") ?? "";
    const phone = normalizePhone(body.phone ?? "");
    if (name.length < 2 || name.length > 60) return jsonError("Enter your full name.");
    if (!phone) return jsonError("Enter a valid Canadian phone number.");
    if (body.smsConsented !== true) return jsonError("Agree to the service-text terms before requesting a code.");
    await verifyTurnstile(request, body.turnstileToken, "customer_otp");

    const [ipAllowed, phoneAllowed] = await Promise.all([
      consumeRateLimit(request, "customer-otp-ip", 8, 60 * 60),
      consumeRateLimit(request, "customer-otp-phone", 3, 60 * 60, phone),
    ]);
    if (!ipAllowed || !phoneAllowed) return jsonError("Too many verification requests. Try again later.", 429);

    const { error } = await getSupabaseAuth().auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true },
    });
    if (error) {
      console.error("[auth:send-otp]", error.message);
      /* No code was sent, so the attempt should not count against the customer.
         Otherwise a provider outage burns their hourly quota and locks them out
         of retrying once it is fixed. */
      await Promise.all([
        refundRateLimit(request, "customer-otp-ip"),
        refundRateLimit(request, "customer-otp-phone", phone),
      ]);
      const status = error.status === 429 ? 429 : 502;
      return jsonError(status === 429 ? "Please wait before requesting another code." : "We could not send the code. Try again.", status);
    }
    return Response.json({ sent: true });
  } catch (error) {
    return internalError(error, "auth:send-otp");
  }
}
