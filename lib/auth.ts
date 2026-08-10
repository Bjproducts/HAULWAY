import { ensureSchema, getD1 } from "@/db";

const CUSTOMER_COOKIE = "haulway_customer_session";
const OPERATOR_COOKIE = "haulway_operator_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export type AuthSession = {
  role: "customer" | "operator";
  subjectId: string;
  customer?: { id: string; name: string; phone: string };
};

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function createSession(role: "customer" | "operator", subjectId: string, request: Request) {
  await ensureSchema();
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await getD1().prepare("INSERT INTO sessions (token_hash, role, subject_id, expires_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, role, subjectId, expires).run();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName(role)}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export async function destroySession(request: Request, role: "customer" | "operator") {
  await ensureSchema();
  const token = readCookie(request, cookieName(role));
  if (token) await getD1().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return `${cookieName(role)}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export async function getSession(request: Request, expectedRole?: "customer" | "operator"): Promise<AuthSession | null> {
  await ensureSchema();
  const roles: Array<"customer" | "operator"> = expectedRole ? [expectedRole] : ["customer", "operator"];
  for (const role of roles) {
    const token = readCookie(request, cookieName(role));
    if (!token) continue;
    const row = await getD1().prepare(`SELECT s.role, s.subject_id, c.name, c.phone
      FROM sessions s LEFT JOIN customers c ON s.role = 'customer' AND c.id = s.subject_id
      WHERE s.token_hash = ? AND s.role = ? AND s.expires_at > CURRENT_TIMESTAMP`)
      .bind(await sha256(token), role).first<{ role: "customer" | "operator"; subject_id: string; name: string | null; phone: string | null }>();
    if (row) {
      return {
        role: row.role,
        subjectId: row.subject_id,
        customer: row.role === "customer" && row.name && row.phone ? { id: row.subject_id, name: row.name, phone: row.phone } : undefined,
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

export async function hashPin(pin: string, salt: string) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 120000, hash: "SHA-256" }, keyMaterial, 256);
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
