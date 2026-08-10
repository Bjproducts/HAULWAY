import { ensureSchema, getD1 } from "@/db";
import { createSession, hashPin } from "@/lib/auth";
import { getErrorMessage, jsonError } from "@/lib/responses";

export async function POST(request: Request) {
  try {
    const { pin } = await request.json() as { pin?: string };
    if (!/^\d{6}$/.test(pin ?? "")) return jsonError("Enter your 6-digit PIN.");
    await ensureSchema();
    const operator = await getD1().prepare("SELECT id, pin_hash, pin_salt FROM operators LIMIT 1")
      .first<{ id: string; pin_hash: string; pin_salt: string }>();
    if (!operator) return jsonError("Set up the operator account first.", 404);
    const hash = await hashPin(pin!, operator.pin_salt);
    if (hash !== operator.pin_hash) return jsonError("That PIN is incorrect.", 401);
    const cookie = await createSession("operator", operator.id, request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}
