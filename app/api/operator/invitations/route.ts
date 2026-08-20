import { getSupabase, throwDatabaseError } from "@/db";
import { getSession, normalizeEmail } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody, sha256 } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const session = await getSession(request, "operator");
    if (!session?.operator?.isOwner) return jsonError("Owner access required.", 403);
    const db = getSupabase();
    const [adminsResult, invitationsResult] = await Promise.all([
      db.from("operators").select("id, display_name, email, active, is_owner, last_login_at, created_at").eq("role", "admin").order("created_at"),
      db.from("operator_invitations").select("id, display_name, email, expires_at, consumed_at, revoked_at, created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    throwDatabaseError(adminsResult.error);
    throwDatabaseError(invitationsResult.error);
    return Response.json({
      admins: (adminsResult.data ?? []).map((admin) => ({
        id: admin.id,
        displayName: admin.display_name,
        email: admin.email,
        active: admin.active,
        isOwner: admin.is_owner,
        lastLoginAt: admin.last_login_at,
        createdAt: admin.created_at,
      })),
      invitations: (invitationsResult.data ?? []).map((invite) => ({
        id: invite.id,
        displayName: invite.display_name,
        email: invite.email,
        expiresAt: invite.expires_at,
        consumedAt: invite.consumed_at,
        revokedAt: invite.revoked_at,
        createdAt: invite.created_at,
        pending: !invite.consumed_at && !invite.revoked_at && Date.parse(invite.expires_at) > Date.now(),
      })),
    });
  } catch (error) {
    return internalError(error, "operator:invitations:list");
  }
}

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const session = await getSession(request, "operator");
    if (!session?.operator?.isOwner) return jsonError("Owner access required.", 403);
    const allowed = await consumeRateLimit(request, "admin-invitation", 10, 24 * 60 * 60, session.subjectId);
    if (!allowed) return jsonError("Too many administrator invitations. Try again later.", 429);
    const body = await readJsonBody<{ displayName?: string; email?: string }>(request);
    const displayName = body.displayName?.trim().replace(/\s+/g, " ") ?? "";
    const email = normalizeEmail(body.email ?? "");
    if (displayName.length < 2 || displayName.length > 80) return jsonError("Enter the administrator's full name.");
    if (!email) return jsonError("Enter a valid administrator email address.");

    const db = getSupabase();
    const { data: existing, error: existingError } = await db.from("operators").select("id").eq("email", email).maybeSingle();
    throwDatabaseError(existingError);
    if (existing) return jsonError("An administrator already uses this email address.", 409);
    const now = new Date();
    const { error: expiryError } = await db.from("operator_invitations")
      .update({ revoked_at: now.toISOString() })
      .eq("email", email)
      .is("consumed_at", null)
      .is("revoked_at", null)
      .lte("expires_at", now.toISOString());
    throwDatabaseError(expiryError);

    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const id = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await db.from("operator_invitations").insert({
      id,
      display_name: displayName,
      email,
      token_hash: await sha256(token),
      invited_by: session.subjectId,
      expires_at: expiresAt,
    });
    if (error?.code === "23505") return jsonError("A pending invitation already exists for this email address.", 409);
    throwDatabaseError(error);
    await recordAuditEvent({ request, session, action: "admin.invitation.create", targetType: "operator_invitation", targetId: id });

    const base = process.env.APP_ORIGIN?.trim() || new URL(request.url).origin;
    const invitationUrl = new URL("/driver/invite", base);
    invitationUrl.searchParams.set("token", token);
    return Response.json({ invitation: { id, displayName, email, expiresAt, url: invitationUrl.toString() } }, { status: 201 });
  } catch (error) {
    return internalError(error, "operator:invitations:create");
  }
}
