import { getSupabase, throwDatabaseError } from "@/db";
import { createSession, hashPin, randomSalt } from "@/lib/auth";
import { getErrorMessage, jsonError } from "@/lib/responses";

export async function POST(request: Request) {
  try {
    const { pin } = await request.json() as { pin?: string };
    if (!/^\d{6}$/.test(pin ?? "")) return jsonError("Choose a 6-digit PIN.");
    const db = getSupabase();
    const { data: existing, error: lookupError } = await db.from("operators").select("id").limit(1).maybeSingle();
    throwDatabaseError(lookupError);
    if (existing) return jsonError("The operator account is already configured.", 409);
    const id = crypto.randomUUID();
    const salt = randomSalt();
    const hash = await hashPin(pin!, salt);
    const { error } = await db.from("operators").insert({ id, pin_hash: hash, pin_salt: salt });
    throwDatabaseError(error);
    const cookie = await createSession("operator", id, request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}
