import { getSupabase, getSupabaseAuth, throwDatabaseError } from "@/db";
import { createSession, normalizePhone } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const body = await readJsonBody<{ name?: string; phone?: string; code?: string }>(request);
    const name = body.name?.trim().replace(/\s+/g, " ") ?? "";
    const phone = normalizePhone(body.phone ?? "");
    const code = body.code?.replace(/\D/g, "") ?? "";
    if (name.length < 2 || name.length > 60) return jsonError("Enter your full name.");
    if (!phone) return jsonError("Enter a valid Canadian phone number.");
    if (!/^\d{6}$/.test(code)) return jsonError("Enter the 6-digit verification code.");

    const allowed = await consumeRateLimit(request, "customer-verify", 8, 15 * 60, phone);
    if (!allowed) return jsonError("Too many verification attempts. Request a new code later.", 429);

    const { data, error } = await getSupabaseAuth().auth.verifyOtp({ phone, token: code, type: "sms" });
    if (error || !data.user?.id || !data.user.phone_confirmed_at || normalizePhone(data.user.phone ?? "") !== phone) {
      if (error) console.warn("[auth:verify-otp]", error.message);
      return jsonError("That verification code is invalid or expired.", 401);
    }

    const db = getSupabase();
    const { data: byPhone, error: lookupError } = await db
      .from("customers")
      .select("id, auth_user_id")
      .eq("phone", phone)
      .maybeSingle();
    throwDatabaseError(lookupError);
    if (byPhone?.auth_user_id && byPhone.auth_user_id !== data.user.id) {
      return jsonError("This phone number is already linked to another account. Contact support.", 409);
    }

    const id = byPhone?.id ?? data.user.id;
    if (byPhone) {
      const { error: updateError } = await db.from("customers").update({ name, auth_user_id: data.user.id }).eq("id", id);
      throwDatabaseError(updateError);
    } else {
      const { error: insertError } = await db.from("customers").insert({ id, name, phone, auth_user_id: data.user.id });
      throwDatabaseError(insertError);
    }

    const cookie = await createSession("customer", id, request);
    return Response.json({ customer: { id, name, phone } }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return internalError(error, "auth:verify-otp");
  }
}
