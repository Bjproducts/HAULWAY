import { ConfigError, PublicError } from "@/lib/responses";

type TurnstileResult = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export async function verifyTurnstile(request: Request, token: unknown, expectedAction: string) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const hosted = process.env.NETLIFY === "true" || process.env.CONTEXT === "production";

  if (!siteKey && !secret && !hosted) return;
  if (!siteKey || !secret) throw new ConfigError("Turnstile site and secret keys must both be configured.");
  if (typeof token !== "string" || token.length < 20 || token.length > 2048) {
    throw new PublicError("Complete the security check and try again.", 403);
  }

  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: clientIp(request),
        idempotency_key: crypto.randomUUID(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new PublicError("The security check is temporarily unavailable. Try again.", 503);
  }
  if (!response.ok) throw new PublicError("The security check is temporarily unavailable. Try again.", 503);

  const result = await response.json() as TurnstileResult;
  if (!result.success || result.action !== expectedAction || !allowedHostnames().has((result.hostname ?? "").toLowerCase())) {
    console.warn("[security:turnstile] rejected", {
      action: result.action,
      hostname: result.hostname,
      errors: result["error-codes"],
    });
    throw new PublicError("The security check expired or was rejected. Try again.", 403);
  }
}

function allowedHostnames() {
  const hosts = new Set<string>();
  for (const candidate of (process.env.APP_ORIGIN ?? "").split(",")) {
    try { hosts.add(new URL(candidate.trim()).hostname.toLowerCase()); } catch { /* ignore invalid values */ }
  }
  if (process.env.NODE_ENV !== "production") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }
  return hosts;
}

function clientIp(request: Request) {
  return request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",", 1)[0].trim()
    || undefined;
}
