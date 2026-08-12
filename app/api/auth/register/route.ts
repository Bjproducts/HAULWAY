import { getSupabaseAuth } from "@/db";
import { normalizePhone } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const body = await request.json() as { name?: string; phone?: string };
    const name = body.name?.trim().replace(/\s+/g, " ") ?? "";
    const phone = normalizePhone(body.phone ?? "");
    if (name.length < 2 || name.length > 60) return jsonError("Enter your full name.");
    if (!phone) return jsonError("Enter a valid Canadian phone number.");

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
      const status = error.status === 429 ? 429 : 502;
      return jsonError(status === 429 ? "Please wait before requesting another code." : "We could not send the code. Try again.", status);
    }
    return Response.json({ sent: true });
  } catch (error) {
    return internalError(error, "auth:send-otp");
  }
}
