import { getSupabase, throwDatabaseError } from "@/db";
import { getSession } from "@/lib/auth";
import { mapDriverApplication } from "@/lib/driver-applications";
import { internalError, jsonError } from "@/lib/responses";

export async function GET(request: Request) {
  try {
    const session = await getSession(request, "operator");
    if (!session || session.operator?.accessRole !== "admin") return jsonError("Administrator access required.", 403);
    const { data, error } = await getSupabase().from("driver_applications")
      .select("id, full_name, phone, email, service_area, engagement_type, vehicle_source, vehicle_type, axle_count, registered_gvw_kg, has_trailer, travels_outside_alberta, licence_class, licence_expires_on, status, rejection_reason, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(200);
    throwDatabaseError(error);
    return Response.json({ applications: (data ?? []).map((row) => mapDriverApplication(row)) });
  } catch (error) {
    return internalError(error, "driver:applications:list");
  }
}
