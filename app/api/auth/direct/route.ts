import { jsonError } from "@/lib/responses";

// Kept as an explicit tombstone so older clients cannot mistake a missing route
// for a transient outage and retry an insecure legacy sign-in flow.
export async function POST() {
  return jsonError("Unverified sign-in has been permanently removed. Request an SMS verification code.", 410);
}
