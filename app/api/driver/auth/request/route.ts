import { getSupabase, getSupabaseAuth, throwDatabaseError } from "@/db";
import { normalizePhone } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const body = await readJsonBody<{ phone?: string; purpose?: string; companyWebsite?: string; smsConsented?: boolean; turnstileToken?: string }>(request);
    const phone = normalizePhone(body.phone ?? "");
    const purpose = body.purpose === "application" ? "application" : body.purpose === "login" ? "login" : null;
    if (!phone || !purpose) return jsonError("Enter a valid Canadian mobile number.");
    if (body.companyWebsite) return Response.json({ sent: true });
    if (purpose === "application" && body.smsConsented !== true) {
      return jsonError("Agree to the service-text terms before requesting a code.");
    }
    await verifyTurnstile(request, body.turnstileToken, purpose === "application" ? "driver_application_otp" : "driver_login_otp");
    const privacyContact = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() ?? "";
    if (purpose === "application" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privacyContact)) {
      return jsonError("Driver applications are unavailable until the privacy contact is configured.", 503);
    }

    const [ipAllowed, phoneAllowed] = await Promise.all([
      consumeRateLimit(request, "driver-otp-ip", 8, 60 * 60),
      consumeRateLimit(request, `driver-otp-${purpose}`, 3, 60 * 60, phone),
    ]);
    if (!ipAllowed || !phoneAllowed) return jsonError("Too many verification requests. Try again later.", 429);

    if (!await mayReceiveCode(phone, purpose)) {
      // Keep the response identical so this endpoint cannot enumerate approved
      // drivers or pending applications by phone number.
      return Response.json({ sent: true });
    }

    const { error } = await getSupabaseAuth().auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: purpose === "application" },
    });
    if (error) {
      console.error("[driver:send-otp]", error.message);
      return jsonError(error.status === 429 ? "Please wait before requesting another code." : "We could not send the code. Try again.", error.status === 429 ? 429 : 502);
    }
    return Response.json({ sent: true });
  } catch (error) {
    return internalError(error, "driver:send-otp");
  }
}

async function mayReceiveCode(phone: string, purpose: "application" | "login") {
  const db = getSupabase();
  if (purpose === "login") {
    const { data, error } = await db.from("operators")
      .select("id")
      .eq("phone", phone)
      .eq("role", "driver")
      .eq("active", true)
      .is("suspended_at", null)
      .gte("compliance_expires_on", new Date().toISOString().slice(0, 10))
      .maybeSingle();
    throwDatabaseError(error);
    return Boolean(data);
  }

  const { data: operator, error: operatorError } = await db.from("operators")
    .select("id")
    .eq("phone", phone)
    .eq("role", "driver")
    .maybeSingle();
  throwDatabaseError(operatorError);
  if (operator) return false;

  const { data: application, error: applicationError } = await db.from("driver_applications")
    .select("status")
    .eq("phone", phone)
    .maybeSingle();
  throwDatabaseError(applicationError);
  return !application || application.status === "pending";
}
