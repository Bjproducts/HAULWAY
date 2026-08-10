import { env } from "cloudflare:workers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type HaulwayEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  UPLOADS?: R2Bucket;
};

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (!client) {
    const runtime = env as unknown as HaulwayEnv;
    const url = runtime.SUPABASE_URL ?? process.env.SUPABASE_URL;
    const secretKey = runtime.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) {
      throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.");
    }
    client = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "haulway-server" } },
    });
  }
  return client;
}

export function getUploads() {
  const bucket = (env as unknown as HaulwayEnv).UPLOADS;
  if (!bucket) throw new Error("Upload storage binding is unavailable.");
  return bucket;
}

export function throwDatabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
