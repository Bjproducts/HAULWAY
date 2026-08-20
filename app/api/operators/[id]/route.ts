import { getSupabase, throwDatabaseError } from "@/db";
import { getSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody, requestFingerprint, requestId } from "@/lib/security";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const session = await getSession(request, "operator");
    if (!session || session.operator?.accessRole !== "admin") return jsonError("Administrator access required.", 403);
    const allowed = await consumeRateLimit(request, "driver-account-action", 30, 60 * 60, session.subjectId);
    if (!allowed) return jsonError("Too many account changes. Try again later.", 429);
    const { id } = await context.params;
    const body = await readJsonBody<{
      action?: string;
      licenceExpiresOn?: string;
      abstractIssuedOn?: string;
      commercialInsuranceExpiresOn?: string;
      vehicleRegistrationExpiresOn?: string;
      wcbClearanceCheckedOn?: string;
      businessLicenceExpiresOn?: string;
      complianceConfirmed?: boolean;
    }>(request);
    if (body.action !== "suspend" && body.action !== "reactivate" && body.action !== "refresh_compliance") return jsonError("Choose a valid driver account action.");

    const db = getSupabase();
    const { data: driver, error } = await db.from("operators")
      .select("id, active, compliance_expires_on")
      .eq("id", id)
      .eq("role", "driver")
      .maybeSingle();
    throwDatabaseError(error);
    if (!driver) return jsonError("Driver not found.", 404);
    if (body.action === "refresh_compliance") {
      const dates = [body.licenceExpiresOn, body.abstractIssuedOn, body.commercialInsuranceExpiresOn, body.vehicleRegistrationExpiresOn, body.wcbClearanceCheckedOn, body.businessLicenceExpiresOn];
      if (body.complianceConfirmed !== true || dates.some((value) => !value || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
        return jsonError("Confirm the review and enter every compliance date.");
      }
      const fingerprint = await requestFingerprint(request);
      const { data: result, error: refreshError } = await db.rpc("refresh_driver_compliance", {
        p_driver_id: id,
        p_reviewer_id: session.subjectId,
        p_licence_expires_on: body.licenceExpiresOn,
        p_abstract_issued_on: body.abstractIssuedOn,
        p_commercial_insurance_expires_on: body.commercialInsuranceExpiresOn,
        p_vehicle_registration_expires_on: body.vehicleRegistrationExpiresOn,
        p_wcb_clearance_checked_on: body.wcbClearanceCheckedOn,
        p_business_licence_expires_on: body.businessLicenceExpiresOn,
        p_request_id: requestId(request),
        p_ip_hash: fingerprint.ipHash,
        p_user_agent_hash: fingerprint.userAgentHash,
      });
      throwDatabaseError(refreshError);
      const outcome = (result as { outcome?: string })?.outcome;
      if (outcome === "invalid_compliance") return jsonError("One or more compliance records are expired or too old.", 409);
      if (outcome !== "updated") return jsonError(outcome === "forbidden" ? "Administrator access required." : "Driver compliance could not be updated.", outcome === "forbidden" ? 403 : 409);
      return Response.json({ result });
    }
    if (body.action === "reactivate" && (!driver.compliance_expires_on || driver.compliance_expires_on < new Date().toISOString().slice(0, 10))) {
      return jsonError("Refresh the driver's compliance review before reactivation.", 409);
    }

    const suspended = body.action === "suspend";
    const { error: updateError } = await db.from("operators").update({
      active: !suspended,
      suspended_at: suspended ? new Date().toISOString() : null,
      suspended_by: suspended ? session.subjectId : null,
    }).eq("id", id).eq("role", "driver");
    throwDatabaseError(updateError);
    const { error: sessionError } = await db.from("sessions").delete().eq("role", "operator").eq("subject_id", id);
    throwDatabaseError(sessionError);
    await recordAuditEvent({
      request,
      session,
      action: suspended ? "driver.suspend" : "driver.reactivate",
      targetType: "operator",
      targetId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return internalError(error, "operators:driver-action");
  }
}
