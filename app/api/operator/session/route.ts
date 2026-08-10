import { getSupabase, throwDatabaseError } from "@/db";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  const [operatorResult, session] = await Promise.all([
    getSupabase().from("operators").select("id").limit(1).maybeSingle(),
    getSession(request, "operator"),
  ]);
  throwDatabaseError(operatorResult.error);
  return Response.json({ configured: Boolean(operatorResult.data), authenticated: session?.role === "operator" });
}
