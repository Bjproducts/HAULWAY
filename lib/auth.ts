import { getSupabase, throwDatabaseError } from "@/db";

const CUSTOMER_COOKIE = "haulway_customer_session";
const OPERATOR_COOKIE = "haulway_operator_session";
const CUSTOMER_SESSION_SECONDS = 60 * 60 * 24 * 30;
const OPERATOR_SESSION_SECONDS = 60 * 60 * 12;
export const PIN_ITERATIONS = 600000;

export type AuthSession = {
  role: "customer" | "operator";
  subjectId: string;
  customer?: { id: string; name: string; phone: string };
};

/* SMS verification is the default. Setting CUSTOMER_PHONE_OTP=off opens the
   unverified sign-in route while a paid SMS provider is still pending — it is a
   deliberate, temporary downgrade and must be switched back on once SMS works. */
export function phoneOtpRequired() {
  return (process.env.CUSTOMER_PHONE_OTP ?? "on").trim().toLowerCase() !== "off";
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function createSession(role: "customer" | "operator", subjectId: string, request: Request) {
  const sessionSeconds = role === "operator" ? OPERATOR_SESSION_SECONDS : CUSTOMER_SESSION_SECONDS;
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  const db = getSupabase();
  /* Keep the session table bounded and invalidate older operator sessions when
     a new privileged login succeeds. */
  const { error: cleanupError } = await db.from("sessions").delete().lt("expires_at", new Date().toISOString());
  throwDatabaseError(cleanupError);
  if (role === "operator") {
    const { error: invalidateError } = await db.from("sessions").delete().eq("role", role).eq("subject_id", subjectId);
    throwDatabaseError(invalidateError);
  }
  const { error } = await db.from("sessions").insert({
    token_hash: tokenHash,
    role,
    subject_id: subjectId,
    expires_at: expires,
  });
  throwDatabaseError(error);
  const secure = process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName(role)}=${token}; HttpOnly; Path=/; SameSite=Strict; Priority=High; Max-Age=${sessionSeconds}${secure}`;
}

export async function destroySession(request: Request, role: "customer" | "operator") {
  const token = readCookie(request, cookieName(role));
  if (token) {
    const { error } = await getSupabase().from("sessions").delete().eq("token_hash", await sha256(token));
    throwDatabaseError(error);
  }
  const secure = process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName(role)}=; HttpOnly; Path=/; SameSite=Strict; Priority=High; Max-Age=0${secure}`;
}

export async function getSession(request: Request, expectedRole?: "customer" | "operator"): Promise<AuthSession | null> {
  const roles: Array<"customer" | "operator"> = expectedRole ? [expectedRole] : ["customer", "operator"];
  for (const role of roles) {
    const token = readCookie(request, cookieName(role));
    if (!token) continue;
    const { data: session, error } = await getSupabase()
      .from("sessions")
      .select("role, subject_id")
      .eq("token_hash", await sha256(token))
      .eq("role", role)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    throwDatabaseError(error);
    if (session) {
      let customer: AuthSession["customer"];
      if (session.role === "customer") {
        const { data, error: customerError } = await getSupabase()
          .from("customers")
          .select("id, name, phone, auth_user_id")
          .eq("id", session.subject_id)
          .maybeSingle();
        throwDatabaseError(customerError);
        /* While OTP is required, a session is only honoured once Supabase Auth has
           proven the phone number. With CUSTOMER_PHONE_OTP=off the deployment has
           explicitly accepted unverified sign-in, so the link is not demanded —
           turning OTP back on immediately invalidates every unverified session. */
        const proven = Boolean(data?.auth_user_id) || !phoneOtpRequired();
        if (data && proven) customer = { id: data.id, name: data.name, phone: data.phone };
      }
      if (session.role === "customer" && !customer) return null;
      return {
        role: session.role,
        subjectId: session.subject_id,
        customer,
      };
    }
  }
  return null;
}

export function getApiSession(request: Request) {
  const requestedRole = request.headers.get("x-haulway-role") === "operator" || new URL(request.url).searchParams.get("role") === "operator"
    ? "operator"
    : "customer";
  return getSession(request, requestedRole);
}

export async function hashPin(pin: string, salt: string, iterations = PIN_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" }, keyMaterial, 256);
  return bytesToHex(new Uint8Array(bits));
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(bytes);
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function cookieName(role: "customer" | "operator") {
  return role === "customer" ? CUSTOMER_COOKIE : OPERATOR_COOKIE;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
