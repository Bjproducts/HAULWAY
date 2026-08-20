import { getSupabase, throwDatabaseError } from "@/db";
import { createSession, hashPassword, PASSWORD_ITERATIONS, randomSalt, validOperatorPassword } from "@/lib/auth";
import { encryptTotpSecret, normalizeBase32, verifyTotp } from "@/lib/mfa";
import { internalError, jsonError } from "@/lib/responses";
import { consumeRateLimit, guardMutation, readJsonBody, requestFingerprint, requestId, sha256 } from "@/lib/security";

type AcceptResult = { outcome?: string; operatorId?: string; displayName?: string; email?: string };

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const body = await readJsonBody<{ token?: string; password?: string; totpSecret?: string; totpCode?: string }>(request);
    const token = body.token?.trim() ?? "";
    const password = body.password ?? "";
    const totpSecret = normalizeBase32(body.totpSecret ?? "");
    const totpCode = body.totpCode?.replace(/\D/g, "") ?? "";
    if (token.length < 32 || token.length > 200) return invalidInvitation();
    const tokenHash = await sha256(token);
    const allowed = await consumeRateLimit(request, "admin-invitation-accept", 8, 60 * 60, tokenHash);
    if (!allowed) return jsonError("Too many activation attempts. Try again later.", 429);

    const { data: invitation, error: invitationError } = await getSupabase().from("operator_invitations")
      .select("email")
      .eq("token_hash", tokenHash)
      .is("consumed_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    throwDatabaseError(invitationError);
    if (!invitation) return invalidInvitation();
    if (!validOperatorPassword(password, invitation.email)) return jsonError("Use a unique passphrase of at least 14 characters.");
    if (totpSecret.length < 26 || totpSecret.length > 104 || !/^\d{6}$/.test(totpCode)) return jsonError("Set up the authenticator and enter its six-digit code.");
    const counter = await verifyTotp(totpSecret, totpCode);
    if (counter == null) return jsonError("The authenticator code is invalid. Check your phone's time and try again.", 401);

    const salt = randomSalt();
    const [passwordHash, encryptedTotp, fingerprint] = await Promise.all([
      hashPassword(password, salt),
      encryptTotpSecret(totpSecret),
      requestFingerprint(request),
    ]);
    const operatorId = crypto.randomUUID();
    const { data, error } = await getSupabase().rpc("accept_operator_invitation", {
      p_invitation_token_hash: tokenHash,
      p_operator_id: operatorId,
      p_password_hash: passwordHash,
      p_password_salt: salt,
      p_password_iterations: PASSWORD_ITERATIONS,
      p_totp_ciphertext: encryptedTotp.ciphertext,
      p_totp_iv: encryptedTotp.iv,
      p_totp_counter: counter,
      p_request_id: requestId(request),
      p_ip_hash: fingerprint.ipHash,
      p_user_agent_hash: fingerprint.userAgentHash,
    });
    throwDatabaseError(error);
    const result = data as AcceptResult;
    if (result.outcome === "identity_conflict") return jsonError("An administrator account already uses this identity.", 409);
    if (result.outcome !== "accepted" || !result.operatorId) return invalidInvitation();

    const cookie = await createSession("operator", result.operatorId, request);
    return Response.json({
      operator: { id: result.operatorId, displayName: result.displayName, email: result.email, phone: null, accessRole: "admin", isOwner: false },
    }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return internalError(error, "operator:invitation:accept");
  }
}

function invalidInvitation() {
  return jsonError("This administrator invitation is invalid, expired, or already used.", 410);
}
