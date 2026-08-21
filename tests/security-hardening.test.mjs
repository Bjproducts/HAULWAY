import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("TOTP verification matches the RFC 6238 SHA-1 test secret and encrypted secrets round-trip", async () => {
  process.env.OPERATOR_MFA_ENCRYPTION_KEY = Buffer.alloc(32, 0x5a).toString("base64url");
  const { decryptTotpSecret, encryptTotpSecret, verifyTotp } = await import("../lib/mfa.ts");
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(await verifyTotp(secret, "287082", 59_000), 1);
  assert.equal(await verifyTotp(secret, "000000", 59_000), null);
  const encrypted = await encryptTotpSecret(secret);
  assert.notEqual(encrypted.ciphertext, secret);
  assert.equal(await decryptTotpSecret(encrypted.ciphertext, encrypted.iv), secret);
});

test("stored media is identified by file signature instead of browser-declared MIME type", async () => {
  const { sniffMediaType } = await import("../lib/media-signatures.ts");
  assert.equal(sniffMediaType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffMediaType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffMediaType(new TextEncoder().encode("not an image")), null);
  const mp4 = new Uint8Array(16);
  mp4.set(new TextEncoder().encode("ftyp"), 4);
  mp4.set(new TextEncoder().encode("isom"), 8);
  assert.equal(sniffMediaType(mp4), "video/mp4");
});

test("launch-blocking security controls are fail-closed in source and schema", async () => {
  const [direct, page, auth, operatorLogin, security, uploads, actions, migration] = await Promise.all([
    readFile(new URL("app/api/auth/direct/route.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("app/api/operator/login/route.ts", root), "utf8"),
    readFile(new URL("lib/security.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/uploads/route.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260819000000_launch_security_hardening.sql", root), "utf8"),
  ]);
  assert.match(direct, /permanently removed/);
  assert.match(direct, /410/);
  assert.doesNotMatch(page, /api\/auth\/direct/);
  assert.doesNotMatch(auth, /CUSTOMER_PHONE_OTP/);
  assert.match(auth, /data\?\.auth_user_id/);
  assert.match(auth, /OPERATOR_IDLE_SECONDS/);
  /* Operator MFA was deliberately traded away for a single shared passphrase
     while Haulway is a one-person operation. These assertions now guard what is
     left: the passphrase is never hardcoded, the comparison is constant time,
     and guessing is still rate limited. Restore the two assertions above when
     named accounts come back. */
  assert.match(operatorLogin, /process\.env\.OPERATOR_PASSWORD/);
  assert.doesNotMatch(operatorLogin, /["'`]123456["'`]/);
  assert.match(operatorLogin, /constantTimeEqual/);
  assert.match(operatorLogin, /consumeRateLimit/);
  assert.match(security, /APP_ORIGIN/);
  assert.match(security, /readJsonBody/);
  assert.match(uploads, /verifyStoredMediaHeader/);
  assert.match(actions, /updateJobVersioned/);
  assert.match(actions, /recordAuditEvent/);
  assert.match(migration, /create table if not exists public\.audit_events/);
  assert.match(migration, /assigned_operator_id/);
  assert.match(migration, /totp_last_counter/);
  assert.match(migration, /drop column pin_hash/);
  assert.match(migration, /operators_single_owner/);
});

test("drivers apply with verified SMS and remain isolated until an admin approves current compliance", async () => {
  const [driverRequest, driverVerify, driverReview, driverSchema, auth, jobs, portal, application] = await Promise.all([
    readFile(new URL("app/api/driver/auth/request/route.ts", root), "utf8"),
    readFile(new URL("app/api/driver/auth/verify/route.ts", root), "utf8"),
    readFile(new URL("app/api/driver/applications/[id]/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260819100000_driver_onboarding.sql", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("app/api/jobs/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/driver/page.tsx", root), "utf8"),
    readFile(new URL("app/driver/apply/page.tsx", root), "utf8"),
  ]);
  assert.match(driverRequest, /purpose === "application"/);
  assert.match(driverRequest, /shouldCreateUser: purpose === "application"/);
  assert.match(driverRequest, /cannot enumerate approved/);
  assert.match(driverVerify, /verifyOtp/);
  assert.match(driverVerify, /validateDriverApplication/);
  assert.match(driverReview, /review_driver_application/);
  assert.match(driverReview, /complianceConfirmed/);
  assert.match(driverSchema, /create table public\.driver_applications/);
  assert.match(driverSchema, /create table public\.driver_compliance/);
  assert.match(driverSchema, /refresh_driver_compliance/);
  assert.match(driverSchema, /where role = 'driver'/);
  assert.match(auth, /compliance_expires_on/);
  assert.match(jobs, /body\.action === "assign_driver"/);
  assert.match(jobs, /accessRole !== "admin"/);
  assert.match(portal, /DriverSmsLogin/);
  assert.match(application, /independent contractor using your own vehicle/i);
  assert.doesNotMatch(application, /social insurance number/i);
});

test("only the owner can issue single-use named administrator invitations", async () => {
  const [invitations, acceptance, adminAction, schema, management] = await Promise.all([
    readFile(new URL("app/api/operator/invitations/route.ts", root), "utf8"),
    readFile(new URL("app/api/operator/invitations/accept/route.ts", root), "utf8"),
    readFile(new URL("app/api/operator/admins/[id]/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260819110000_admin_invitations.sql", root), "utf8"),
    readFile(new URL("app/driver/driver-management.tsx", root), "utf8"),
  ]);
  assert.match(invitations, /operator\?\.isOwner/);
  assert.match(invitations, /token_hash: await sha256\(token\)/);
  assert.doesNotMatch(invitations, /token_hash[^\n]*return/i);
  assert.match(acceptance, /accept_operator_invitation/);
  assert.match(acceptance, /verifyTotp/);
  assert.match(adminAction, /if \(!session\?\.operator\?\.isOwner\)/);
  assert.match(schema, /operator_invitations_pending_email/);
  assert.match(schema, /for update/);
  assert.match(schema, /consumed_at = clock_timestamp\(\)/);
  assert.match(management, /Create 24-hour invitation/);
});
