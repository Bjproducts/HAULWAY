import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getSession(request, "customer");
  return Response.json({ customer: session?.customer ?? null, otpRequired: true });
}
