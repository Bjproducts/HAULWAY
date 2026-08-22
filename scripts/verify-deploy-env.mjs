import nextEnvironment from "@next/env";
import { readFile } from "node:fs/promises";

const { loadEnvConfig } = nextEnvironment;
loadEnvConfig(process.cwd());

if (process.env.NETLIFY !== "true" || process.env.CONTEXT !== "production") {
  console.log("[deploy:config] Production-only validation skipped outside a Netlify production build.");
  process.exit(0);
}

const policy = JSON.parse(await readFile(new URL("../config/production-env.json", import.meta.url), "utf8"));
const issues = policy.required.filter((name) => !process.env[name]?.trim()).map((name) => `${name} is missing`);
for (const name of policy.retired) if (process.env[name]?.trim()) issues.push(`${name} must be removed after setup`);

minimum("RATE_LIMIT_SECRET", 32);
minimum("SECURITY_FINGERPRINT_SECRET", 32);
minimum("TURNSTILE_SECRET_KEY", 20);
minimum("TWILIO_AUTH_TOKEN", 20);

const origins = (process.env.APP_ORIGIN ?? "").split(",").map((value) => value.trim());
if (!origins.includes("https://haulway.ca") || !origins.includes("https://www.haulway.ca")) issues.push("APP_ORIGIN must include the apex and www HTTPS origins");
if (process.env.TWILIO_STATUS_CALLBACK_URL?.trim() !== "https://haulway.ca/api/webhooks/twilio/status") issues.push("TWILIO_STATUS_CALLBACK_URL must use the canonical signed callback route");

const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? "";
const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim() ?? "";
if (!serviceSid && !fromNumber) issues.push("TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER is required");
if (serviceSid && !/^MG[a-fA-F0-9]{32}$/.test(serviceSid)) issues.push("TWILIO_MESSAGING_SERVICE_SID has an invalid format");
if (!serviceSid && fromNumber && !/^\+[1-9]\d{7,14}$/.test(fromNumber)) issues.push("TWILIO_FROM_NUMBER must use E.164 format");

const apiKey = process.env.TWILIO_API_KEY?.trim() ?? "";
const apiSecret = process.env.TWILIO_API_KEY_SECRET?.trim() ?? "";
if (Boolean(apiKey) !== Boolean(apiSecret)) issues.push("TWILIO_API_KEY and TWILIO_API_KEY_SECRET must be configured together");
if (apiKey && !/^SK[a-fA-F0-9]{32}$/.test(apiKey)) issues.push("TWILIO_API_KEY has an invalid format");
if (process.env.TWILIO_ACCOUNT_SID && !/^AC[a-fA-F0-9]{32}$/.test(process.env.TWILIO_ACCOUNT_SID.trim())) issues.push("TWILIO_ACCOUNT_SID has an invalid format");

if (!validMfaKey(process.env.OPERATOR_MFA_ENCRYPTION_KEY)) issues.push("OPERATOR_MFA_ENCRYPTION_KEY must encode exactly 32 bytes");
if (!validHttpsUrl(process.env.SUPABASE_URL)) issues.push("SUPABASE_URL must be an HTTPS URL");
if (!validEmail(process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL)) issues.push("NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL must be a valid email address");
if (process.env.NEXT_PUBLIC_INTERAC_EMAIL && !validEmail(process.env.NEXT_PUBLIC_INTERAC_EMAIL)) issues.push("NEXT_PUBLIC_INTERAC_EMAIL must be a valid email address");

const retention = process.env.ABANDONED_DRAFT_RETENTION_HOURS?.trim();
if (retention && (!/^\d+$/.test(retention) || Number(retention) < 24 || Number(retention) > 8760)) issues.push("ABANDONED_DRAFT_RETENTION_HOURS must be a whole number from 24 to 8760");

if (issues.length) {
  console.error(`[deploy:config] Refusing to replace the live deployment:\n- ${[...new Set(issues)].join("\n- ")}`);
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_INTERAC_EMAIL?.trim()) console.warn("[deploy:config] Interac remains hidden until NEXT_PUBLIC_INTERAC_EMAIL is configured.");
if (!retention) console.warn("[deploy:config] Abandoned draft/media deletion remains disabled until an approved retention window is configured.");
console.log("[deploy:config] Production environment is complete and internally consistent.");

function minimum(name, length) {
  const value = process.env[name]?.trim();
  if (value && value.length < length) issues.push(`${name} must contain at least ${length} characters`);
}

function validHttpsUrl(value) {
  try { return new URL(value ?? "").protocol === "https:"; } catch { return false; }
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim() ?? "");
}

function validMfaKey(value) {
  const encoded = value?.trim() ?? "";
  if (/^[a-fA-F0-9]{64}$/.test(encoded)) return true;
  try { return Buffer.from(encoded, "base64url").length === 32; } catch { return false; }
}
