import { getSupabase, throwDatabaseError } from "@/db";

export async function GET() {
  try {
    const { error } = await getSupabase().from("customers").select("id").limit(1);
    throwDatabaseError(error);
    return Response.json({ status: "ok", service: "haulway" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[health]", error instanceof Error ? error.message : error);
    return Response.json({ status: "unavailable", service: "haulway" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
