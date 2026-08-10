import { createSession, normalizePhone } from "@/lib/auth";
import { getSupabase, throwDatabaseError } from "@/db";
import { getErrorMessage, jsonError } from "@/lib/responses";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; phone?: string };
    const name = body.name?.trim().replace(/\s+/g, " ") ?? "";
    const phone = normalizePhone(body.phone ?? "");
    if (name.length < 2 || name.length > 60) return jsonError("Enter your full name.");
    if (!phone) return jsonError("Enter a valid Canadian phone number.");

    const db = getSupabase();
    const { data: existing, error: lookupError } = await db
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    throwDatabaseError(lookupError);
    const id = existing?.id ?? crypto.randomUUID();
    if (existing) {
      const { error } = await db.from("customers").update({ name }).eq("id", id);
      throwDatabaseError(error);
    } else {
      const { error } = await db.from("customers").insert({ id, name, phone });
      throwDatabaseError(error);
    }
    const cookie = await createSession("customer", id, request);
    return Response.json({ customer: { id, name, phone } }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return jsonError(getErrorMessage(error), 500);
  }
}
