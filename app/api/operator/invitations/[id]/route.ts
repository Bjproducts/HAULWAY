import { getSupabase, throwDatabaseError } from "@/db";
import { getSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation } from "@/lib/security";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  const blocked = guardMutation(request, { json: false });
  if (blocked) return blocked;
  try {
    const session = await getSession(request, "operator");
    if (!session?.operator?.isOwner) return jsonError("Owner access required.", 403);
    const allowed = await consumeRateLimit(request, "admin-invitation-revoke", 20, 60 * 60, session.subjectId);
    if (!allowed) return jsonError("Too many invitation changes. Try again later.", 429);
    const { id } = await context.params;
    const { data, error } = await getSupabase().from("operator_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .is("consumed_at", null)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    throwDatabaseError(error);
    if (!data) return jsonError("This invitation is no longer pending.", 409);
    await recordAuditEvent({ request, session, action: "admin.invitation.revoke", targetType: "operator_invitation", targetId: id });
    return Response.json({ ok: true });
  } catch (error) {
    return internalError(error, "operator:invitations:revoke");
  }
}
