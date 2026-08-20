import { destroySession, getSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { guardMutation } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request, { json: false });
  if (blocked) return blocked;
  const session = await getSession(request, "operator");
  const cookie = await destroySession(request, "operator");
  if (session) {
    await recordAuditEvent({
      request,
      session,
      action: "operator.logout",
      targetType: "operator",
      targetId: session.subjectId,
    });
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
