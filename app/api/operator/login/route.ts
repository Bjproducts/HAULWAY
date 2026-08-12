import { getSupabase, throwDatabaseError } from "@/db";
import { createSession, hashPin, PIN_ITERATIONS, randomSalt } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";
import { constantTimeEqual, consumeRateLimit, guardMutation } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const { pin } = await request.json() as { pin?: string };
    if (!/^\d{6}$/.test(pin ?? "")) return jsonError("Enter your 6-digit PIN.");
    const allowed = await consumeRateLimit(request, "operator-login", 5, 15 * 60);
    if (!allowed) return jsonError("Too many sign-in attempts. Try again in 15 minutes.", 429);
    const { data: operator, error } = await getSupabase()
      .from("operators")
      .select("id, pin_hash, pin_salt, pin_iterations")
      .limit(1)
      .maybeSingle();
    throwDatabaseError(error);
    if (!operator) return jsonError("Set up the operator account first.", 404);
    const iterations = operator.pin_iterations ?? 120000;
    const hash = await hashPin(pin!, operator.pin_salt, iterations);
    if (!constantTimeEqual(hash, operator.pin_hash)) return jsonError("That PIN is incorrect.", 401);
    if (iterations < PIN_ITERATIONS) {
      const salt = randomSalt();
      const upgraded = await hashPin(pin!, salt);
      const { error: upgradeError } = await getSupabase().from("operators").update({ pin_hash: upgraded, pin_salt: salt, pin_iterations: PIN_ITERATIONS }).eq("id", operator.id);
      throwDatabaseError(upgradeError);
    }
    const cookie = await createSession("operator", operator.id, request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return internalError(error, "operator:login");
  }
}
