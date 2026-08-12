import { getSupabase, throwDatabaseError } from "@/db";
import { createSession, hashPin, PIN_ITERATIONS, randomSalt } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/responses";
import { constantTimeEqual, consumeRateLimit, guardMutation } from "@/lib/security";

export async function POST(request: Request) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  try {
    const { pin, setupToken } = await request.json() as { pin?: string; setupToken?: string };
    if (!/^\d{6}$/.test(pin ?? "")) return jsonError("Choose a 6-digit PIN.");
    const expectedToken = process.env.OPERATOR_SETUP_TOKEN?.trim() ?? "";
    if (expectedToken.length < 24) return jsonError("Operator setup is disabled until OPERATOR_SETUP_TOKEN is configured.", 503);
    const allowed = await consumeRateLimit(request, "operator-setup", 5, 60 * 60);
    if (!allowed) return jsonError("Too many setup attempts. Try again later.", 429);
    if (!constantTimeEqual(setupToken?.trim() ?? "", expectedToken)) return jsonError("The setup token is incorrect.", 401);
    const db = getSupabase();
    const { data: existing, error: lookupError } = await db.from("operators").select("id").limit(1).maybeSingle();
    throwDatabaseError(lookupError);
    if (existing) return jsonError("The operator account is already configured.", 409);
    const id = crypto.randomUUID();
    const salt = randomSalt();
    const hash = await hashPin(pin!, salt);
    const { error } = await db.from("operators").insert({ id, pin_hash: hash, pin_salt: salt, pin_iterations: PIN_ITERATIONS });
    throwDatabaseError(error);
    const cookie = await createSession("operator", id, request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return internalError(error, "operator:setup");
  }
}
