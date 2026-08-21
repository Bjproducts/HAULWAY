import { getSupabase, throwDatabaseError } from "@/db";
import { createSession } from "@/lib/auth";
import { ConfigError, internalError, jsonError } from "@/lib/responses";
import { constantTimeEqual, consumeRateLimit, guardMutation, readJsonBody } from "@/lib/security";

/*
 * Single shared passphrase for the operator portal.
 *
 * This deliberately replaces the previous email + passphrase + TOTP sign-in
 * while Haulway is a one-person operation. It is a real reduction in security:
 * anyone holding the passphrase reaches every customer's address, photos and
 * phone number, and there is no per-person accountability in the audit trail.
 *
 * The value lives in OPERATOR_PASSWORD rather than in this file so it is not
 * published with the source. Login fails closed when it is unset.
 *
 * The per-driver accounts, invitations and MFA are still in the database and
 * still enforced elsewhere; restoring them is a matter of putting the richer
 * sign-in back, not rebuilding the model.
 */
export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const expected = process.env.OPERATOR_PASSWORD ?? "";
    if (expected.length < 1) throw new ConfigError("OPERATOR_PASSWORD is not set.");

    const body = await readJsonBody<{ password?: string }>(request);
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || password.length > 200) return invalidPassphrase();

    /* Still rate limited: a short passphrase is guessable, so throttling is the
       only thing standing between the portal and a dictionary run. */
    const allowed = await consumeRateLimit(request, "operator-login-ip", 10, 15 * 60);
    if (!allowed) return jsonError("Too many sign-in attempts. Try again in 15 minutes.", 429);

    if (!constantTimeEqual(password, expected)) return invalidPassphrase();

    /* Sign in as the owner account so downstream role checks, job assignment and
       the audit trail keep working unchanged. */
    const db = getSupabase();
    const { data: operator, error } = await db.from("operators")
      .select("id")
      .eq("role", "admin")
      .eq("active", true)
      .order("is_owner", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwDatabaseError(error);
    if (!operator) return jsonError("No active operator account exists yet. Run operator setup first.", 409);

    const cookie = await createSession("operator", operator.id, request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return internalError(error, "operator:login");
  }
}

function invalidPassphrase() {
  return jsonError("That passphrase is incorrect.", 401);
}
