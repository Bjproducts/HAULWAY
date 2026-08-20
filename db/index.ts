import { ConfigError } from "@/lib/responses";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) {
      throw new ConfigError("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.");
    }
    client = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "haulway-server" } },
    });
  }
  return client;
}

/* Auth clients are deliberately request-scoped. verifyOtp creates an auth
   session in the client instance, so sharing one across server requests risks
   session state bleeding between customers. */
export function getSupabaseAuth() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new ConfigError("Supabase Auth is not configured.");
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "haulway-auth-server" } },
  });
}

export function getStorageBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "job-media";
}

export function getStorage() {
  return getSupabase().storage.from(getStorageBucketName());
}

export function getSupabasePublicConfig() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new ConfigError("Supabase uploads are not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, publishableKey, bucket: getStorageBucketName() };
}

export function throwDatabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
