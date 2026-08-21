import { getSupabase, throwDatabaseError } from "@/db";
import { requestFingerprint } from "@/lib/security";

const CUSTOMER_COOKIE = "haulway_customer_session";
const OPERATOR_COOKIE = "haulway_operator_session";
const CUSTOMER_SESSION_SECONDS = 60 * 60 * 24 * 7;
const OPERATOR_SESSION_SECONDS = 60 * 60 * 8;
const OPERATOR_IDLE_SECONDS = 60 * 30;
const SESSION_TOUCH_SECONDS = 60 * 5;
export const PASSWORD_ITERATIONS = 600000;

export type AuthSession = {
  role: "customer" | "operator";
  subjectId: string;
  customer?: { id: string; name: string; phone: string };
  operator?: {
    id: string;
    displayName: string;
    email: string;
    phone: string | null;
    accessRole: "admin" | "driver";
    isOwner: boolean;
  };
};

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function validOperatorPassword(value: string, email = "") {
  if (value.length < 14 || value.length > 128) return false;
  const lowered = value.toLowerCase();
  const emailName = email.split("@", 1)[0];
  if (emailName.length >= 3 && lowered.includes(emailName)) return false;
  if (["password", "haulway", "letmein", "qwerty", "123456"].some((term) => lowered.includes(term))) return false;
  return /[a-z]/i.test(value) && /[^a-z]/i.test(value);
}

export async function createSession(role: "customer" | "operator", subjectId: string, request: Request) {
  const sessionSeconds = role === "operator" ? OPERATOR_SESSION_SECONDS : CUSTOMER_SESSION_SECONDS;
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  const fingerprint = await requestFingerprint(request);
  const db = getSupabase();

  const { error: cleanupError } = await db.from("sessions").delete().lt("expires_at", new Date().toISOString());
  throwDatabaseError(cleanupError);
  if (role === "operator") {
    // A successful privileged login rotates every prior operator session.
    const { error: invalidateError } = await db.from("sessions").delete().eq("role", role).eq("subject_id", subjectId);
    throwDatabaseError(invalidateError);
  }
  const { error } = await db.from("sessions").insert({
    token_hash: tokenHash,
    role,
    subject_id: subjectId,
    expires_at: expires,
    last_seen_at: new Date().toISOString(),
    ip_hash: fingerprint.ipHash,
    user_agent_hash: fingerprint.userAgentHash,
  });
  throwDatabaseError(error);
  return serializeSessionCookie(request, role, token, sessionSeconds);
}

export async function destroySession(request: Request, role: "customer" | "operator") {
  const name = cookieName(role, request);
  const token = readCookie(request, name);
  if (token) {
    const { error } = await getSupabase().from("sessions").delete().eq("token_hash", await sha256(token));
    throwDatabaseError(error);
  }
  return serializeSessionCookie(request, role, "", 0);
}

export async function getSession(request: Request, expectedRole?: "customer" | "operator"): Promise<AuthSession | null> {
  const roles: Array<"customer" | "operator"> = expectedRole ? [expectedRole] : ["customer", "operator"];
  for (const role of roles) {
    const token = readCookie(request, cookieName(role, request));
    if (!token) continue;
    const tokenHash = await sha256(token);
    const { data: session, error } = await getSupabase()
      .from("sessions")
      .select("role, subject_id, created_at, expires_at, last_seen_at, user_agent_hash")
      .eq("token_hash", tokenHash)
      .eq("role", role)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    throwDatabaseError(error);
    if (!session) continue;

    const fingerprint = await requestFingerprint(request);
    const lastSeen = Date.parse(session.last_seen_at);
    const idleExpired = role === "operator" && (!Number.isFinite(lastSeen) || lastSeen < Date.now() - OPERATOR_IDLE_SECONDS * 1000);
    const deviceChanged = role === "operator" && Boolean(session.user_agent_hash) && session.user_agent_hash !== fingerprint.userAgentHash;
    if (idleExpired || deviceChanged) {
      await getSupabase().from("sessions").delete().eq("token_hash", tokenHash);
      return null;
    }

    let result: AuthSession | null = null;
    if (session.role === "customer") {
      const { data, error: customerError } = await getSupabase()
        .from("customers")
        .select("id, name, phone, auth_user_id")
        .eq("id", session.subject_id)
        .maybeSingle();
      throwDatabaseError(customerError);
      // A customer session is valid only when Supabase Auth has proven phone
      // ownership. There is no configuration switch that can bypass this.
      if (data?.auth_user_id) {
        result = {
          role: "customer",
          subjectId: data.id,
          customer: { id: data.id, name: data.name, phone: data.phone },
        };
      }
    } else {
      const { data, error: operatorError } = await getSupabase()
        .from("operators")
        .select("id, display_name, email, phone, role, is_owner, active, password_hash, totp_ciphertext, auth_user_id, compliance_expires_on, suspended_at")
        .eq("id", session.subject_id)
        .maybeSingle();
      throwDatabaseError(operatorError);
      /* Shared-passphrase mode: sign-in proves nothing about the row itself, so
         per-account credentials cannot be required to hydrate the session. The
         strict checks stay in force whenever OPERATOR_PASSWORD is absent, which
         is the named-account configuration. */
      const sharedPassphrase = (process.env.OPERATOR_PASSWORD ?? "").length > 0;
      const administratorReady = data?.role === "admin"
        && (sharedPassphrase || Boolean(data.password_hash && data.totp_ciphertext));
      const driverReady = data?.role === "driver" && data.auth_user_id && data.phone && !data.suspended_at
        && data.compliance_expires_on && data.compliance_expires_on >= new Date().toISOString().slice(0, 10);
      const identified = sharedPassphrase || Boolean(data?.display_name && data?.email);
      if (data?.active && identified && (administratorReady || driverReady)) {
        result = {
          role: "operator",
          subjectId: data.id,
          operator: {
            id: data.id,
            displayName: data.display_name ?? "Haulway",
            email: data.email ?? "",
            phone: data.phone ?? null,
            accessRole: data.role,
            isOwner: Boolean(data.is_owner),
          },
        };
      }
    }

    if (!result) {
      await getSupabase().from("sessions").delete().eq("token_hash", tokenHash);
      return null;
    }

    if (!Number.isFinite(lastSeen) || lastSeen < Date.now() - SESSION_TOUCH_SECONDS * 1000) {
      const { error: touchError } = await getSupabase().from("sessions")
        .update({ last_seen_at: new Date().toISOString(), ip_hash: fingerprint.ipHash })
        .eq("token_hash", tokenHash);
      throwDatabaseError(touchError);
    }
    return result;
  }
  return null;
}

export function getApiSession(request: Request) {
  const requestedRole = request.headers.get("x-haulway-role") === "operator" || new URL(request.url).searchParams.get("role") === "operator"
    ? "operator"
    : "customer";
  return getSession(request, requestedRole);
}

export async function hashPassword(password: string, salt: string, iterations = PASSWORD_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" }, keyMaterial, 256);
  return bytesToHex(new Uint8Array(bits));
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bytesToHex(bytes);
}

function serializeSessionCookie(request: Request, role: "customer" | "operator", value: string, maxAge: number) {
  const secure = isSecureRequest(request);
  return `${cookieName(role, request)}=${value}; HttpOnly; Path=/; SameSite=Strict; Priority=High; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function cookieName(role: "customer" | "operator", request: Request) {
  const base = role === "customer" ? CUSTOMER_COOKIE : OPERATOR_COOKIE;
  return isSecureRequest(request) ? `__Host-${base}` : base;
}

function isSecureRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",", 1)[0].trim();
  return process.env.NODE_ENV === "production" || forwarded === "https" || new URL(request.url).protocol === "https:";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
