import { ensureSchema, getD1 } from "@/db";
import { createSession, hashPin, randomSalt } from "@/lib/auth";
import { getErrorMessage, jsonError } from "@/lib/responses";

export async function POST(request: Request) {
  try {
    const { pin } = await request.json() as { pin?: string };
    if (!/^\d{6}$/.test(pin ?? "")) return jsonError("Choose a 6-digit PIN.");
    await ensureSchema();
    const db = getD1();
    const existing = await db.prepare("SELECT id FROM operators LIMIT 1").first();
    if (existing) return jsonError("The operator account is already configured.", 409);
    const id = crypto.randomUUID();
    const salt = randomSalt();
    const hash = await hashPin(pin!, salt);
    await db.prepare("INSERT INTO operators (id, pin_hash, pin_salt) VALUES (?, ?, ?)").bind(id, hash, salt).run();
    const cookie = await createSession("operator", id, request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}
