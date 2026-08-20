import { getSupabase, throwDatabaseError } from "@/db";
import { createSession, hashPassword, normalizeEmail, PASSWORD_ITERATIONS } from "@/lib/auth";
import { decryptTotpSecret, verifyTotp } from "@/lib/mfa";
import { internalError, jsonError } from "@/lib/responses";
import { constantTimeEqual, consumeRateLimit, guardMutation, readJsonBody, requestFingerprint, requestId } from "@/lib/security";

const DUMMY_SALT = "12b8ecfd91ad5bb6b1d72b1da7bef83bdebb80841983de39";

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const body = await readJsonBody<{ email?: string; password?: string; totpCode?: string }>(request);
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";
    const totpCode = body.totpCode?.replace(/\D/g, "") ?? "";
    if (!email || password.length > 128 || !/^\d{6}$/.test(totpCode)) return invalidCredentials();

    const [ipAllowed, accountAllowed] = await Promise.all([
      consumeRateLimit(request, "operator-login-ip", 8, 15 * 60),
      consumeRateLimit(request, "operator-login-account", 5, 15 * 60, email),
    ]);
    if (!ipAllowed || !accountAllowed) return jsonError("Too many sign-in attempts. Try again in 15 minutes.", 429);

    const db = getSupabase();
    const { data: operator, error } = await db.from("operators")
      .select("id, password_hash, password_salt, password_iterations, totp_ciphertext, totp_iv, active")
      .eq("email", email)
      .eq("role", "admin")
      .maybeSingle();
    throwDatabaseError(error);

    const iterations = operator?.password_iterations ?? PASSWORD_ITERATIONS;
    const computed = await hashPassword(password, operator?.password_salt ?? DUMMY_SALT, iterations);
    if (!operator?.active || !operator.password_hash || !constantTimeEqual(computed, operator.password_hash)
      || !operator.totp_ciphertext || !operator.totp_iv) {
      return invalidCredentials();
    }

    const secret = await decryptTotpSecret(operator.totp_ciphertext, operator.totp_iv);
    const counter = await verifyTotp(secret, totpCode);
    if (counter == null) return invalidCredentials();

    const fingerprint = await requestFingerprint(request);
    const { data: consumed, error: consumeError } = await db.rpc("consume_operator_totp", {
      p_operator_id: operator.id,
      p_counter: counter,
      p_request_id: requestId(request),
      p_ip_hash: fingerprint.ipHash,
      p_user_agent_hash: fingerprint.userAgentHash,
    });
    throwDatabaseError(consumeError);
    if (consumed !== true) return jsonError("That authenticator code was already used. Wait for the next code.", 409);

    const cookie = await createSession("operator", operator.id, request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return internalError(error, "operator:login");
  }
}

function invalidCredentials() {
  return jsonError("The email, passphrase, or authenticator code is incorrect.", 401);
}
