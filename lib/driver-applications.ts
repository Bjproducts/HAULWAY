import { normalizeEmail, normalizePhone } from "@/lib/auth";
import { PublicError } from "@/lib/responses";

export type DriverApplicationValues = {
  full_name: string;
  phone: string;
  email: string;
  service_area: string;
  engagement_type: "contractor";
  vehicle_source: "own";
  vehicle_type: string;
  axle_count: number;
  registered_gvw_kg: number;
  has_trailer: boolean;
  travels_outside_alberta: boolean;
  licence_class: "1" | "2" | "3" | "5";
  licence_expires_on: string;
  legal_work_attested_at: string;
  privacy_consented_at: string;
  screening_consented_at: string;
};

export function validateDriverApplication(input: Record<string, unknown>, verifiedPhone: string): DriverApplicationValues {
  const fullName = cleanText(input.fullName, 80).replace(/\s+/g, " ");
  const phone = normalizePhone(String(input.phone ?? ""));
  const email = normalizeEmail(String(input.email ?? ""));
  const serviceArea = cleanText(input.serviceArea, 100);
  const vehicleType = cleanText(input.vehicleType, 80);
  const axleCount = Number(input.axleCount);
  const registeredGvwKg = Number(input.registeredGvwKg);
  const licenceClass = String(input.licenceClass ?? "") as DriverApplicationValues["licence_class"];
  const licenceExpiresOn = String(input.licenceExpiresOn ?? "");

  if (fullName.length < 2) throw new PublicError("Enter your legal full name.");
  if (!phone || phone !== verifiedPhone) throw new PublicError("Verify the same mobile number used on this application.");
  if (!email) throw new PublicError("Enter a valid email address.");
  if (serviceArea.length < 2) throw new PublicError("Enter the Edmonton-area communities you can serve.");
  if (vehicleType.length < 2) throw new PublicError("Describe the vehicle you will use.");
  if (!Number.isInteger(axleCount) || axleCount < 2 || axleCount > 10) throw new PublicError("Enter the vehicle's axle count.");
  if (!Number.isInteger(registeredGvwKg) || registeredGvwKg < 500 || registeredGvwKg > 100000) {
    throw new PublicError("Enter the registered gross vehicle weight in kilograms.");
  }
  if (!["1", "2", "3", "5"].includes(licenceClass)) throw new PublicError("Choose your Alberta driver's licence class.");
  if (axleCount >= 3 && licenceClass === "5") throw new PublicError("A Class 5 licence does not cover a vehicle with three or more axles.");
  if (!validFutureDate(licenceExpiresOn, 10)) throw new PublicError("Enter a valid future driver's licence expiry date.");
  if (input.legalWorkAttested !== true) throw new PublicError("Confirm that you are legally able to work in Canada.");
  if (input.privacyConsented !== true || input.screeningConsented !== true) {
    throw new PublicError("Consent is required to submit and review this application.");
  }
  if (input.smsConsented !== true) throw new PublicError("Agree to the service-text terms before submitting.");

  const now = new Date().toISOString();
  return {
    full_name: fullName,
    phone,
    email,
    service_area: serviceArea,
    engagement_type: "contractor",
    vehicle_source: "own",
    vehicle_type: vehicleType,
    axle_count: axleCount,
    registered_gvw_kg: registeredGvwKg,
    has_trailer: input.hasTrailer === true,
    travels_outside_alberta: input.travelsOutsideAlberta === true,
    licence_class: licenceClass,
    licence_expires_on: licenceExpiresOn,
    legal_work_attested_at: now,
    privacy_consented_at: now,
    screening_consented_at: now,
  };
}

export function mapDriverApplication(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    phone: String(row.phone),
    email: String(row.email),
    serviceArea: String(row.service_area),
    engagementType: row.engagement_type,
    vehicleSource: row.vehicle_source,
    vehicleType: String(row.vehicle_type),
    axleCount: Number(row.axle_count),
    registeredGvwKg: Number(row.registered_gvw_kg),
    hasTrailer: Boolean(row.has_trailer),
    travelsOutsideAlberta: Boolean(row.travels_outside_alberta),
    licenceClass: String(row.licence_class),
    licenceExpiresOn: String(row.licence_expires_on),
    status: row.status,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return Array.from(value.trim()).slice(0, max).join("");
}

function validFutureDate(value: string, maxYears: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setUTCFullYear(limit.getUTCFullYear() + maxYears);
  return Number.isFinite(time) && time >= today.getTime() && time <= limit.getTime();
}
