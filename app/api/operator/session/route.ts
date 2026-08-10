import { ensureSchema, getD1 } from "@/db";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  await ensureSchema();
  const [operator, session] = await Promise.all([
    getD1().prepare("SELECT id FROM operators LIMIT 1").first<{ id: string }>(),
    getSession(request, "operator"),
  ]);
  return Response.json({ configured: Boolean(operator), authenticated: session?.role === "operator" });
}

