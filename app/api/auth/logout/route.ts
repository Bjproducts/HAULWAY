import { destroySession, getSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { guardMutation } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request, { json: false });
  if (blocked) return blocked;
  const session = await getSession(request, "customer");
  const cookie = await destroySession(request, "customer");
  if (session) {
    await recordAuditEvent({ request, session, action: "customer.logout", targetType: "customer", targetId: session.subjectId });
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
