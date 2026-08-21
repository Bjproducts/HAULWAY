import { getSupabase, throwDatabaseError } from "@/db";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  /* In shared-passphrase mode an active admin row is all the portal needs; the
     per-account credential columns are only meaningful for named accounts. */
  const sharedPassphrase = (process.env.OPERATOR_PASSWORD ?? "").length > 0;
  let query = getSupabase().from("operators").select("id").eq("active", true);
  if (sharedPassphrase) query = query.eq("role", "admin");
  else query = query.not("password_hash", "is", null).not("totp_ciphertext", "is", null);

  const [operatorResult, session] = await Promise.all([
    query.limit(1).maybeSingle(),
    getSession(request, "operator"),
  ]);
  throwDatabaseError(operatorResult.error);
  return Response.json({
    configured: Boolean(operatorResult.data),
    authenticated: session?.role === "operator",
    operator: session?.operator ?? null,
  });
}
