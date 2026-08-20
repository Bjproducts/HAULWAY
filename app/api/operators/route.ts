import { getSupabase, throwDatabaseError } from "@/db";
import { getSession } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";

export async function GET(request: Request) {
  try {
    const session = await getSession(request, "operator");
    if (!session || session.operator?.accessRole !== "admin") return jsonError("Administrator access required.", 403);
    const { data: drivers, error } = await getSupabase().from("operators")
      .select("id, display_name, email, phone, active, suspended_at, compliance_expires_on, engagement_type, vehicle_source, driver_application_id")
      .eq("role", "driver")
      .order("display_name", { ascending: true });
    throwDatabaseError(error);

    const applicationIds = (drivers ?? []).map((driver) => driver.driver_application_id).filter(Boolean) as string[];
    const driverIds = (drivers ?? []).map((driver) => driver.id);
    const applicationMap = new Map<string, { vehicle_type: string; service_area: string }>();
    if (applicationIds.length) {
      const { data: applications, error: applicationError } = await getSupabase().from("driver_applications")
        .select("id, vehicle_type, service_area")
        .in("id", applicationIds);
      throwDatabaseError(applicationError);
      for (const application of applications ?? []) applicationMap.set(application.id, application);
    }
    const complianceMap = new Map<string, Record<string, string>>();
    if (driverIds.length) {
      const { data: compliance, error: complianceError } = await getSupabase().from("driver_compliance")
        .select("operator_id, licence_expires_on, abstract_issued_on, commercial_insurance_expires_on, vehicle_registration_expires_on, wcb_clearance_checked_on, edmonton_business_licence_expires_on")
        .in("operator_id", driverIds);
      throwDatabaseError(complianceError);
      for (const record of compliance ?? []) complianceMap.set(record.operator_id, record);
    }

    return Response.json({ drivers: (drivers ?? []).map((driver) => {
      const application = driver.driver_application_id ? applicationMap.get(driver.driver_application_id) : null;
      const compliance = complianceMap.get(driver.id);
      return {
        id: driver.id,
        displayName: driver.display_name,
        email: driver.email,
        phone: driver.phone,
        active: driver.active,
        suspendedAt: driver.suspended_at,
        complianceExpiresOn: driver.compliance_expires_on,
        engagementType: driver.engagement_type,
        vehicleSource: driver.vehicle_source,
        vehicleType: application?.vehicle_type ?? null,
        serviceArea: application?.service_area ?? null,
        licenceExpiresOn: compliance?.licence_expires_on ?? null,
        abstractIssuedOn: compliance?.abstract_issued_on ?? null,
        commercialInsuranceExpiresOn: compliance?.commercial_insurance_expires_on ?? null,
        vehicleRegistrationExpiresOn: compliance?.vehicle_registration_expires_on ?? null,
        wcbClearanceCheckedOn: compliance?.wcb_clearance_checked_on ?? null,
        businessLicenceExpiresOn: compliance?.edmonton_business_licence_expires_on ?? null,
      };
    }) });
  } catch (error) {
    return internalError(error, "operators:list-drivers");
  }
}
