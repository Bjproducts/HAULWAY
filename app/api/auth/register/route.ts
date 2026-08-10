import { createSession, normalizePhone } from "@/lib/auth";
import { ensureSchema, getD1 } from "@/db";
import { getErrorMessage, jsonError } from "@/lib/responses";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; phone?: string };
    const name = body.name?.trim().replace(/\s+/g, " ") ?? "";
    const phone = normalizePhone(body.phone ?? "");
    if (name.length < 2 || name.length > 60) return jsonError("Enter your full name.");
    if (!phone) return jsonError("Enter a valid Canadian phone number.");

    await ensureSchema();
    const db = getD1();
    const existing = await db.prepare("SELECT id FROM customers WHERE phone = ?").bind(phone).first<{ id: string }>();
    const id = existing?.id ?? crypto.randomUUID();
    if (existing) {
      await db.prepare("UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, id).run();
    } else {
      await db.prepare("INSERT INTO customers (id, name, phone) VALUES (?, ?, ?)").bind(id, name, phone).run();
    }
    const cookie = await createSession("customer", id, request);
    return Response.json({ customer: { id, name, phone } }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}
