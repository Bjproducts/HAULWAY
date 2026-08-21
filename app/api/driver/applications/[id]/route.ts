import { getSupabase, throwDatabaseError } from "@/db";
import { getSession } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody, requestFingerprint, requestId } from "@/lib/security";
import { notifyDriverApplicationSms } from "@/lib/sms";

type Context = { params: Promise<{ id: string }> };
type ReviewResult = { outcome?: string; phone?: string; operatorId?: string; complianceExpiresOn?: string };

export async function PATCH(request: Request, context: Context) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const session = await getSession(request, "operator");
    if (!session || session.operator?.accessRole !== "admin") return jsonError("Administrator access required.", 403);
    const allowed = await consumeRateLimit(request, "driver-application-review", 40, 60 * 60, session.subjectId);
    if (!allowed) return jsonError("Too many driver reviews. Try again later.", 429);

    const { id } = await context.params;
    const body = await readJsonBody<{
      action?: string;
      rejectionReason?: string;
      abstractIssuedOn?: string;
      commercialInsuranceExpiresOn?: string;
      vehicleRegistrationExpiresOn?: string;
      wcbClearanceCheckedOn?: string;
      businessLicenceExpiresOn?: string;
      complianceConfirmed?: boolean;
    }>(request);
    const decision = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
    if (!decision) return jsonError("Choose approve or reject.");
    if (decision === "approve" && body.complianceConfirmed !== true) {
      return jsonError("Confirm that every required compliance record was reviewed.");
    }
    const dates = decision === "approve" ? [
      body.abstractIssuedOn,
      body.commercialInsuranceExpiresOn,
      body.vehicleRegistrationExpiresOn,
      body.wcbClearanceCheckedOn,
      body.businessLicenceExpiresOn,
    ] : [];
    if (dates.some((value) => !value || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      return jsonError("Enter every compliance date before approval.");
    }

    const fingerprint = await requestFingerprint(request);
    const { data, error } = await getSupabase().rpc("review_driver_application", {
      p_application_id: id,
      p_reviewer_id: session.subjectId,
      p_decision: decision,
      p_rejection_reason: body.rejectionReason?.trim().slice(0, 500) || null,
      p_abstract_issued_on: body.abstractIssuedOn ?? null,
      p_commercial_insurance_expires_on: body.commercialInsuranceExpiresOn ?? null,
      p_vehicle_registration_expires_on: body.vehicleRegistrationExpiresOn ?? null,
      p_wcb_clearance_checked_on: body.wcbClearanceCheckedOn ?? null,
      p_business_licence_expires_on: body.businessLicenceExpiresOn ?? null,
      p_request_id: requestId(request),
      p_ip_hash: fingerprint.ipHash,
      p_user_agent_hash: fingerprint.userAgentHash,
    });
    throwDatabaseError(error);
    const result = data as ReviewResult;
    if (result.outcome === "not_found") return jsonError("Driver application not found.", 404);
    if (result.outcome === "already_reviewed") return jsonError("This application was already reviewed.", 409);
    if (result.outcome === "forbidden") return jsonError("Administrator access required.", 403);
    if (result.outcome === "invalid_compliance") return jsonError("One or more compliance records are expired or too old.", 409);
    if (result.outcome === "identity_conflict") return jsonError("This driver's verified identity is already in use.", 409);
    if (result.outcome !== "approved" && result.outcome !== "rejected") return jsonError("The review could not be completed.", 409);

    if (result.phone) {
      const message = result.outcome === "approved"
        ? "HAULWAY: Your driver application was approved. Sign in at haulway.ca/driver using this verified mobile number."
        : "HAULWAY: Your driver application was reviewed and was not approved. Contact HAULWAY if you need more information.";
      await notifyDriverApplicationSms(id, result.phone, crypto.randomUUID(), message);
    }
    return Response.json({ result });
  } catch (error) {
    return internalError(error, "driver:application:review");
  }
}
