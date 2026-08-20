import { getSupabase, getSupabaseAuth, throwDatabaseError } from "@/db";
import { createSession, normalizePhone } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { validateDriverApplication } from "@/lib/driver-applications";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request, { maxBytes: 48 * 1024 });
  if (blocked) return blocked;
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 48 * 1024);
    const phone = normalizePhone(String(body.phone ?? ""));
    const code = String(body.code ?? "").replace(/\D/g, "");
    const purpose = body.purpose === "application" ? "application" : body.purpose === "login" ? "login" : null;
    if (!phone || !purpose || !/^\d{6}$/.test(code)) return jsonError("Enter the six-digit SMS verification code.");

    const allowed = await consumeRateLimit(request, `driver-verify-${purpose}`, 8, 15 * 60, phone);
    if (!allowed) return jsonError("Too many verification attempts. Request a new code later.", 429);

    const { data, error } = await getSupabaseAuth().auth.verifyOtp({ phone, token: code, type: "sms" });
    if (error || !data.user?.id || !data.user.phone_confirmed_at || normalizePhone(data.user.phone ?? "") !== phone) {
      if (error) console.warn("[driver:verify-otp]", error.message);
      return jsonError("That verification code is invalid or expired.", 401);
    }

    if (purpose === "login") return completeDriverLogin(request, data.user.id, phone);
    return submitDriverApplication(request, body, data.user.id, phone);
  } catch (error) {
    return internalError(error, "driver:verify-otp");
  }
}

async function completeDriverLogin(request: Request, authUserId: string, phone: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: driver, error } = await getSupabase().from("operators")
    .select("id, display_name, email, phone, role, is_owner, compliance_expires_on")
    .eq("auth_user_id", authUserId)
    .eq("phone", phone)
    .eq("role", "driver")
    .eq("active", true)
    .is("suspended_at", null)
    .gte("compliance_expires_on", today)
    .maybeSingle();
  throwDatabaseError(error);
  if (!driver) return jsonError("This driver account is not approved or its compliance review has expired.", 403);

  const cookie = await createSession("operator", driver.id, request);
  await recordAuditEvent({
    request,
    actorRole: "operator",
    actorId: driver.id,
    action: "driver.login",
    targetType: "operator",
    targetId: driver.id,
    metadata: { mfa: "sms" },
  });
  return Response.json({
    operator: {
      id: driver.id,
      displayName: driver.display_name,
      email: driver.email,
      phone: driver.phone,
      accessRole: "driver",
      isOwner: false,
    },
  }, { headers: { "Set-Cookie": cookie } });
}

async function submitDriverApplication(request: Request, body: Record<string, unknown>, authUserId: string, phone: string) {
  const values = validateDriverApplication(body, phone);
  const db = getSupabase();
  const [byAuthResult, byPhoneResult] = await Promise.all([
    db.from("driver_applications").select("id, auth_user_id, phone, status").eq("auth_user_id", authUserId).maybeSingle(),
    db.from("driver_applications").select("id, auth_user_id, phone, status").eq("phone", phone).maybeSingle(),
  ]);
  throwDatabaseError(byAuthResult.error);
  throwDatabaseError(byPhoneResult.error);
  const existing = byAuthResult.data ?? byPhoneResult.data;
  if (byAuthResult.data && byPhoneResult.data && byAuthResult.data.id !== byPhoneResult.data.id) {
    return jsonError("This verified identity is already connected to another application. Contact support.", 409);
  }
  if (existing && (existing.auth_user_id !== authUserId || existing.phone !== phone)) {
    return jsonError("This verified identity is already connected to another application. Contact support.", 409);
  }
  if (existing?.status === "approved") return jsonError("Your application is already approved. Sign in as a driver.", 409);
  if (existing?.status === "rejected") return jsonError("This application was already reviewed. Contact HAULWAY before applying again.", 409);

  let applicationId = existing?.id as string | undefined;
  if (applicationId) {
    const { data: updated, error: updateError } = await db.from("driver_applications")
      .update({ ...values, phone_verified_at: new Date().toISOString() })
      .eq("id", applicationId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    throwDatabaseError(updateError);
    if (!updated) return jsonError("This application changed while you were submitting it. Contact HAULWAY.", 409);
  } else {
    applicationId = crypto.randomUUID();
    const { error: insertError } = await db.from("driver_applications").insert({
      id: applicationId,
      auth_user_id: authUserId,
      ...values,
      phone_verified_at: new Date().toISOString(),
    });
    throwDatabaseError(insertError);
  }

  await recordAuditEvent({
    request,
    actorRole: "system",
    action: existing ? "driver.application.update" : "driver.application.submit",
    targetType: "driver_application",
    targetId: applicationId,
    metadata: { phoneVerified: true, engagementType: "contractor", vehicleSource: "own" },
  });
  return Response.json({ application: { id: applicationId, status: "pending" } }, { status: existing ? 200 : 201 });
}
