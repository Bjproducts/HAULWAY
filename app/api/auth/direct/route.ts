import { getSupabase, throwDatabaseError } from "@/db";
import { createSession, normalizePhone, phoneOtpRequired } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation } from "@/lib/security";

/*
 * TEMPORARY: sign-in without proving phone ownership.
 *
 * This exists only so the site can operate before a paid SMS provider is live.
 * It trusts a phone number on the client's word, so anyone who knows a
 * customer's number can sign in as them and read their photos, addresses and
 * chat. It refuses to run unless CUSTOMER_PHONE_OTP=off is set explicitly.
 *
 * Once Twilio is funded: set CUSTOMER_PHONE_OTP=on (or drop the variable) and
 * delete this file. /api/auth/register + /api/auth/verify are the real path and
 * are already wired.
 */
export async function POST(request: Request) {
  if (phoneOtpRequired()) {
    return jsonError("Phone verification is required. Use the code we texted you.", 403);
  }

  const blocked = guardMutation(request);
  if (blocked) return blocked;

  try {
    const body = await request.json() as { name?: string; phone?: string };
    const name = body.name?.trim().replace(/\s+/g, " ") ?? "";
    const phone = normalizePhone(body.phone ?? "");
    if (name.length < 2 || name.length > 60) return jsonError("Enter your full name.");
    if (!phone) return jsonError("Enter a valid Canadian phone number.");

    const [ipAllowed, phoneAllowed] = await Promise.all([
      consumeRateLimit(request, "customer-direct-ip", 12, 60 * 60),
      consumeRateLimit(request, "customer-direct-phone", 6, 60 * 60, phone),
    ]);
    if (!ipAllowed || !phoneAllowed) return jsonError("Too many sign-in attempts. Try again later.", 429);

    const db = getSupabase();
    const { data: existing, error: lookupError } = await db
      .from("customers")
      .select("id, auth_user_id")
      .eq("phone", phone)
      .maybeSingle();
    throwDatabaseError(lookupError);

    /* A number already proven by OTP never regresses to unverified sign-in. */
    if (existing?.auth_user_id) {
      return jsonError("This number is verified. Sign in with the code we text you.", 409);
    }

    const id = existing?.id ?? crypto.randomUUID();
    if (existing) {
      const { error } = await db.from("customers").update({ name }).eq("id", id);
      throwDatabaseError(error);
    } else {
      const { error } = await db.from("customers").insert({ id, name, phone });
      throwDatabaseError(error);
    }

    console.warn("[auth:direct] unverified sign-in — CUSTOMER_PHONE_OTP is off");
    const cookie = await createSession("customer", id, request);
    return Response.json({ customer: { id, name, phone } }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return internalError(error, "auth:direct");
  }
}
