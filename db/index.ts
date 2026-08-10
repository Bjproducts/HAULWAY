import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
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
    throw new Error("Supabase uploads are not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, publishableKey, bucket: getStorageBucketName() };
}

export function throwDatabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
