import { getSupabase, throwDatabaseError } from "@/db";
import { createSession, hashPassword, normalizeEmail, PASSWORD_ITERATIONS, randomSalt, validOperatorPassword } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { encryptTotpSecret, normalizeBase32, verifyTotp } from "@/lib/mfa";
import { internalError, jsonError } from "@/lib/responses";
import { constantTimeEqual, consumeRateLimit, guardMutation, readJsonBody, requestFingerprint, requestId } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const body = await readJsonBody<{
      displayName?: string;
      email?: string;
      password?: string;
      setupToken?: string;
      totpSecret?: string;
      totpCode?: string;
    }>(request);
    const displayName = body.displayName?.trim().replace(/\s+/g, " ") ?? "";
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";
    const totpSecret = normalizeBase32(body.totpSecret ?? "");
    const totpCode = body.totpCode?.replace(/\D/g, "") ?? "";
    if (displayName.length < 2 || displayName.length > 80) return jsonError("Enter the operator's full name.");
    if (!email) return jsonError("Enter a valid operator email address.");
    if (!validOperatorPassword(password, email)) return jsonError("Use a unique passphrase of at least 14 characters.");
    if (totpSecret.length < 26 || totpSecret.length > 104) return jsonError("Generate a valid authenticator secret.");
    if (!/^\d{6}$/.test(totpCode)) return jsonError("Enter the 6-digit code from your authenticator app.");

    const expectedToken = process.env.OPERATOR_SETUP_TOKEN?.trim() ?? "";
    if (expectedToken.length < 32) return jsonError("Operator setup is disabled until a strong OPERATOR_SETUP_TOKEN is configured.", 503);
    const allowed = await consumeRateLimit(request, "operator-setup", 5, 60 * 60);
    if (!allowed) return jsonError("Too many setup attempts. Try again later.", 429);
    if (!constantTimeEqual(body.setupToken?.trim() ?? "", expectedToken)) return jsonError("The setup token is incorrect.", 401);

    const counter = await verifyTotp(totpSecret, totpCode);
    if (counter == null) return jsonError("The authenticator code is invalid. Check your phone's time and try again.", 401);

    const db = getSupabase();
    const { data: configured, error: configuredError } = await db.from("operators")
      .select("id")
      .not("password_hash", "is", null)
      .limit(1)
      .maybeSingle();
    throwDatabaseError(configuredError);
    if (configured) return jsonError("The initial operator account is already configured.", 409);

    const [passwordResult, totpResult] = await Promise.all([
      (async () => {
        const salt = randomSalt();
        return { salt, hash: await hashPassword(password, salt) };
      })(),
      encryptTotpSecret(totpSecret),
    ]);

    const { data: legacy, error: legacyError } = await db.from("operators")
      .select("id")
      .is("password_hash", null)
      .limit(1)
      .maybeSingle();
    throwDatabaseError(legacyError);
    const operatorId = legacy?.id ?? crypto.randomUUID();
    const values = {
      display_name: displayName,
      email,
      password_hash: passwordResult.hash,
      password_salt: passwordResult.salt,
      password_iterations: PASSWORD_ITERATIONS,
      totp_ciphertext: totpResult.ciphertext,
      totp_iv: totpResult.iv,
      mfa_enrolled_at: new Date().toISOString(),
      role: "admin",
      is_owner: true,
      active: true,
    };
    if (legacy) {
      const { data: claimed, error } = await db.from("operators")
        .update(values)
        .eq("id", operatorId)
        .is("password_hash", null)
        .select("id")
        .maybeSingle();
      throwDatabaseError(error);
      if (!claimed) return jsonError("The initial operator account was configured by another request.", 409);
    } else {
      const { error } = await db.from("operators").insert({ id: operatorId, ...values });
      if (error?.code === "23505") return jsonError("The initial operator account was configured by another request.", 409);
      throwDatabaseError(error);
    }

    const fingerprint = await requestFingerprint(request);
    const { data: consumed, error: consumeError } = await db.rpc("consume_operator_totp", {
      p_operator_id: operatorId,
      p_counter: counter,
      p_request_id: requestId(request),
      p_ip_hash: fingerprint.ipHash,
      p_user_agent_hash: fingerprint.userAgentHash,
    });
    throwDatabaseError(consumeError);
    if (consumed !== true) return jsonError("That authenticator code was already used. Wait for the next code.", 409);

    const cookie = await createSession("operator", operatorId, request);
    await recordAuditEvent({
      request,
      actorRole: "operator",
      actorId: operatorId,
      action: "operator.setup",
      targetType: "operator",
      targetId: operatorId,
      metadata: { role: "admin", mfa: true },
    });
    return Response.json({ operator: { displayName, email, phone: null, accessRole: "admin", isOwner: true } }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return internalError(error, "operator:setup");
  }
}
