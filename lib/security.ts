import { getSupabase, throwDatabaseError } from "@/db";
import { jsonError } from "@/lib/responses";

const JSON_TYPES = ["application/json", "application/ld+json"];

/* Behind a proxy (Netlify, and any CDN in front of it) request.url reports the
   internal origin, not the address the browser actually used, so the public host
   has to come from the forwarded headers instead. */
function publicHost(request: Request) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",", 1)[0].trim();
  const host = forwarded || request.headers.get("host") || new URL(request.url).host;
  return host.toLowerCase();
}

export function guardMutation(request: Request, options: { json?: boolean; maxBytes?: number } = {}) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  /* Sec-Fetch-Site is set by the browser and cannot be forged from script, so it
     is authoritative where present. Origin is the fallback for the few clients
     that omit it, compared on host alone — the proxy terminates TLS, so the
     scheme it reports internally is not the one the browser saw. */
  if (fetchSite) {
    if (fetchSite !== "same-origin" && fetchSite !== "none") return jsonError("Cross-site request blocked.", 403);
  } else if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host.toLowerCase(); } catch { return jsonError("Cross-site request blocked.", 403); }
    if (originHost !== publicHost(request)) return jsonError("Cross-site request blocked.", 403);
  }

  if (options.json !== false) {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (!JSON_TYPES.includes(contentType)) return jsonError("Content-Type must be application/json.", 415);
  }

  const maxBytes = options.maxBytes ?? 32 * 1024;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return jsonError("Request is too large.", 413);
  return null;
}

export async function consumeRateLimit(request: Request, scope: string, limit: number, windowSeconds: number, subject = "") {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Rate limiting is not configured.");
  const ip = request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",", 1)[0].trim()
    || "unknown";
  const key = await sha256(`${secret}:${scope}:${ip}:${subject}`);
  const { data, error } = await getSupabase().rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  throwDatabaseError(error);
  return data === true;
}

export function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
