import { getSupabase, throwDatabaseError } from "@/db";
import { jsonError, PublicError } from "@/lib/responses";

const JSON_TYPES = ["application/json", "application/ld+json"];
const DEFAULT_BODY_BYTES = 32 * 1024;

export function guardMutation(request: Request, options: { json?: boolean; maxBytes?: number } = {}) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return jsonError("Cross-site request blocked.", 403);
  }

  if (origin) {
    let parsedOrigin: string;
    try { parsedOrigin = new URL(origin).origin.toLowerCase(); } catch { return jsonError("Cross-site request blocked.", 403); }
    const allowed = allowedOrigins(request);
    if (!allowed.has(parsedOrigin)) {
      /* A same-origin request being rejected means APP_ORIGIN is wrong, not that
         an attack was blocked — and that misconfiguration takes down every
         mutation at once. Say so in the logs rather than failing mutely. */
      if (fetchSite === "same-origin") {
        console.error("[security:origin] same-origin request rejected — APP_ORIGIN does not match the served host.",
          { requestOrigin: parsedOrigin, allowed: [...allowed] });
      }
      return jsonError("Cross-site request blocked.", 403);
    }
  } else if (!fetchSite && process.env.NODE_ENV === "production") {
    // Browser mutations send Origin or Fetch Metadata. Failing closed also
    // prevents non-browser clients from bypassing the same-origin contract.
    return jsonError("Request origin is required.", 403);
  }

  if (options.json !== false) {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (!JSON_TYPES.includes(contentType)) return jsonError("Content-Type must be application/json.", 415);
  }

  const maxBytes = options.maxBytes ?? DEFAULT_BODY_BYTES;
  const rawLength = request.headers.get("content-length");
  if (rawLength) {
    const contentLength = Number(rawLength);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) return jsonError("Invalid Content-Length.", 400);
    if (contentLength > maxBytes) return jsonError("Request is too large.", 413);
  }
  return null;
}

export async function readJsonBody<T>(request: Request, maxBytes = DEFAULT_BODY_BYTES): Promise<T> {
  if (!request.body) throw new PublicError("Request body is required.", 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PublicError("Request is too large.", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError("Request body must be valid UTF-8 JSON.", 400);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new PublicError("Request body must be valid JSON.", 400);
  }
}

export async function consumeRateLimit(request: Request, scope: string, limit: number, windowSeconds: number, subject = "") {
  const secret = process.env.RATE_LIMIT_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new Error("RATE_LIMIT_SECRET must contain at least 32 characters.");
  const key = await sha256(`${secret}:${scope}:${clientIp(request)}:${subject}`);
  const { data, error } = await getSupabase().rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  throwDatabaseError(error);
  return data === true;
}

export async function requestFingerprint(request: Request) {
  const secret = process.env.SECURITY_FINGERPRINT_SECRET?.trim() || process.env.RATE_LIMIT_SECRET?.trim() || "";
  if (secret.length < 32) throw new Error("A security fingerprint secret of at least 32 characters is required.");
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) || "unknown";
  const [ipHash, userAgentHash] = await Promise.all([
    sha256(`${secret}:ip:${clientIp(request)}`),
    sha256(`${secret}:ua:${userAgent}`),
  ]);
  return { ipHash, userAgentHash };
}

export function requestId(request: Request) {
  const value = request.headers.get("x-nf-request-id")
    || request.headers.get("x-request-id")
    || request.headers.get("traceparent")
    || "";
  return /^[a-z0-9._:-]{1,160}$/i.test(value) ? value : crypto.randomUUID();
}

export function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function allowedOrigins(request: Request) {
  const origins = new Set<string>();

  /* APP_ORIGIN accepts a comma-separated list so an apex and its www host (or a
     domain mid-migration) can both be served. Netlify's own URL is used when
     nothing is configured: it is set by the platform rather than the caller, so
     it is safe to trust, and it stops a missing variable from silently blocking
     every mutation on a correctly deployed site. */
  const configured = process.env.APP_ORIGIN?.trim() || process.env.URL?.trim();
  for (const candidate of (configured ?? "").split(",")) {
    const value = candidate.trim();
    if (!value) continue;
    try { origins.add(new URL(value).origin.toLowerCase()); } catch { /* skip malformed entry */ }
  }

  if (process.env.NODE_ENV !== "production") {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0].trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0].trim();
    if (forwardedHost && (forwardedProto === "http" || forwardedProto === "https")) {
      origins.add(`${forwardedProto}://${forwardedHost}`.toLowerCase());
    }
    origins.add(new URL(request.url).origin.toLowerCase());
  }
  return origins;
}

function clientIp(request: Request) {
  return request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",", 1)[0].trim()
    || "unknown";
}
