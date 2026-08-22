import productionEnvironment from "@/config/production-env.json";

type Environment = Record<string, string | undefined>;

export function productionConfigurationIssues(environment: Environment = process.env) {
  const issues = productionEnvironment.required
    .filter((name) => !environment[name]?.trim())
    .map((name) => `${name} is missing`);

  for (const name of productionEnvironment.retired) {
    if (environment[name]?.trim()) issues.push(`${name} must be removed after setup`);
  }

  requireMinimum(environment, issues, "RATE_LIMIT_SECRET", 32);
  requireMinimum(environment, issues, "SECURITY_FINGERPRINT_SECRET", 32);
  requireMinimum(environment, issues, "TURNSTILE_SECRET_KEY", 20);
  requireMinimum(environment, issues, "TWILIO_AUTH_TOKEN", 20);

  if (!validMfaKey(environment.OPERATOR_MFA_ENCRYPTION_KEY)) {
    issues.push("OPERATOR_MFA_ENCRYPTION_KEY must encode exactly 32 bytes");
  }
  if (!validHttpsUrl(environment.SUPABASE_URL)) issues.push("SUPABASE_URL must be an HTTPS URL");
  if (!validEmail(environment.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL)) {
    issues.push("NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL must be a valid email address");
  }

  const origins = parseOrigins(environment.APP_ORIGIN);
  if (!origins.includes("https://haulway.ca") || !origins.includes("https://www.haulway.ca")) {
    issues.push("APP_ORIGIN must include the apex and www HTTPS origins");
  }
  if (environment.TWILIO_STATUS_CALLBACK_URL?.trim() !== "https://haulway.ca/api/webhooks/twilio/status") {
    issues.push("TWILIO_STATUS_CALLBACK_URL must use the canonical signed callback route");
  }

  const serviceSid = environment.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? "";
  const fromNumber = environment.TWILIO_FROM_NUMBER?.trim() ?? "";
  if (!serviceSid && !fromNumber) issues.push("TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER is required");
  if (serviceSid && !/^MG[a-fA-F0-9]{32}$/.test(serviceSid)) issues.push("TWILIO_MESSAGING_SERVICE_SID has an invalid format");
  if (!serviceSid && fromNumber && !/^\+[1-9]\d{7,14}$/.test(fromNumber)) issues.push("TWILIO_FROM_NUMBER must use E.164 format");

  const apiKey = environment.TWILIO_API_KEY?.trim() ?? "";
  const apiSecret = environment.TWILIO_API_KEY_SECRET?.trim() ?? "";
  if (Boolean(apiKey) !== Boolean(apiSecret)) issues.push("TWILIO_API_KEY and TWILIO_API_KEY_SECRET must be configured together");
  if (apiKey && !/^SK[a-fA-F0-9]{32}$/.test(apiKey)) issues.push("TWILIO_API_KEY has an invalid format");
  if (environment.TWILIO_ACCOUNT_SID && !/^AC[a-fA-F0-9]{32}$/.test(environment.TWILIO_ACCOUNT_SID.trim())) {
    issues.push("TWILIO_ACCOUNT_SID has an invalid format");
  }

  const interacEmail = environment.NEXT_PUBLIC_INTERAC_EMAIL?.trim();
  if (interacEmail && !validEmail(interacEmail)) issues.push("NEXT_PUBLIC_INTERAC_EMAIL must be a valid email address");

  const retention = environment.ABANDONED_DRAFT_RETENTION_HOURS?.trim();
  if (retention && (!/^\d+$/.test(retention) || Number(retention) < 24 || Number(retention) > 8760)) {
    issues.push("ABANDONED_DRAFT_RETENTION_HOURS must be a whole number from 24 to 8760");
  }

  return [...new Set(issues)];
}

export function optionalConfigurationWarnings(environment: Environment = process.env) {
  const warnings: string[] = [];
  if (!environment.NEXT_PUBLIC_INTERAC_EMAIL?.trim()) warnings.push("Interac is disabled until NEXT_PUBLIC_INTERAC_EMAIL is configured");
  if (!environment.ABANDONED_DRAFT_RETENTION_HOURS?.trim()) warnings.push("abandoned draft/media deletion is disabled pending an approved retention window");
  return warnings;
}

function requireMinimum(environment: Environment, issues: string[], name: string, minimum: number) {
  const value = environment[name]?.trim();
  if (value && value.length < minimum) issues.push(`${name} must contain at least ${minimum} characters`);
}

function parseOrigins(value: string | undefined) {
  const origins: string[] = [];
  for (const candidate of (value ?? "").split(",")) {
    try {
      const url = new URL(candidate.trim());
      if (url.protocol === "https:") origins.push(url.origin);
    } catch { /* invalid origin is reported by the required canonical check */ }
  }
  return origins;
}

function validHttpsUrl(value: string | undefined) {
  try { return new URL(value ?? "").protocol === "https:"; } catch { return false; }
}

function validEmail(value: string | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim() ?? "");
}

function validMfaKey(value: string | undefined) {
  const encoded = value?.trim() ?? "";
  if (/^[a-fA-F0-9]{64}$/.test(encoded)) return true;
  try { return Buffer.from(encoded, "base64url").length === 32; } catch { return false; }
}
