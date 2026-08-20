import { getSupabase, throwDatabaseError } from "@/db";
import { getSession } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody } from "@/lib/security";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const session = await getSession(request, "operator");
    if (!session?.operator?.isOwner) return jsonError("Owner access required.", 403);
    const allowed = await consumeRateLimit(request, "admin-account-action", 20, 60 * 60, session.subjectId);
    if (!allowed) return jsonError("Too many administrator changes. Try again later.", 429);
    const { id } = await context.params;
    if (id === session.subjectId) return jsonError("The owner cannot disable their own account here.", 409);
    const body = await readJsonBody<{ action?: string }>(request);
    if (body.action !== "suspend" && body.action !== "reactivate") return jsonError("Choose suspend or reactivate.");
    const db = getSupabase();
    const { data: target, error } = await db.from("operators")
      .select("id, active, is_owner, password_hash, totp_ciphertext")
      .eq("id", id)
      .eq("role", "admin")
      .maybeSingle();
    throwDatabaseError(error);
    if (!target) return jsonError("Administrator not found.", 404);
    if (target.is_owner) return jsonError("The owner account cannot be changed here.", 409);
    if (body.action === "reactivate" && (!target.password_hash || !target.totp_ciphertext)) return jsonError("This administrator has not completed secure activation.", 409);

    const active = body.action === "reactivate";
    const { error: updateError } = await db.from("operators").update({ active }).eq("id", id).eq("role", "admin").eq("is_owner", false);
    throwDatabaseError(updateError);
    const { error: sessionsError } = await db.from("sessions").delete().eq("role", "operator").eq("subject_id", id);
    throwDatabaseError(sessionsError);
    await recordAuditEvent({
      request,
      session,
      action: active ? "admin.reactivate" : "admin.suspend",
      targetType: "operator",
      targetId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return internalError(error, "operator:admin-action");
  }
}
