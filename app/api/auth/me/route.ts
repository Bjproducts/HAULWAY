import { getSession, phoneOtpRequired } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getSession(request, "customer");
  /* The sign-in screen already calls this on boot, so it also reports which
     sign-in mode is live rather than costing a second round trip. */
  return Response.json({ customer: session?.customer ?? null, otpRequired: phoneOtpRequired() });
}

