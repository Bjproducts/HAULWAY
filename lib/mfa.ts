const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const MFA_AAD = new TextEncoder().encode("haulway-operator-totp-v1");

export async function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const keyBytes = decodeBase32(secret);
  if (keyBytes.length < 16 || keyBytes.length > 64) return null;
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS);

  // Prefer the current period, then tolerate one period of clock skew in either
  // direction. The database separately rejects reuse of an accepted counter.
  for (const offset of [0, -1, 1]) {
    const candidateCounter = counter + offset;
    const candidate = await hotp(keyBytes, candidateCounter);
    if (constantTimeCodeEqual(candidate, code)) return candidateCounter;
  }
  return null;
}

export async function encryptTotpSecret(secret: string) {
  const normalized = normalizeBase32(secret);
  if (decodeBase32(normalized).length < 16) throw new Error("The authenticator secret is too short.");
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: MFA_AAD, tagLength: 128 },
    key,
    new TextEncoder().encode(normalized),
  );
  return { ciphertext: toBase64Url(new Uint8Array(ciphertext)), iv: toBase64Url(iv) };
}

export async function decryptTotpSecret(ciphertext: string, iv: string) {
  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv), additionalData: MFA_AAD, tagLength: 128 },
    key,
    fromBase64Url(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export function normalizeBase32(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

async function hotp(secret: Uint8Array, counter: number) {
  const message = new Uint8Array(8);
  // A 30-second TOTP counter remains below uint32 for centuries; the high four
  // bytes of the RFC 4226 64-bit counter therefore stay zero.
  new DataView(message.buffer).setUint32(4, counter, false);
  const key = await crypto.subtle.importKey("raw", arrayBuffer(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, arrayBuffer(message)));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, "0");
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = normalizeBase32(value);
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) return new Uint8Array();
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function encryptionKey() {
  const encoded = process.env.OPERATOR_MFA_ENCRYPTION_KEY?.trim() ?? "";
  let bytes: Uint8Array;
  if (/^[a-f0-9]{64}$/i.test(encoded)) {
    bytes = new Uint8Array(encoded.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
  } else {
    try { bytes = fromBase64Url(encoded); } catch { bytes = new Uint8Array(); }
  }
  if (bytes.length !== 32) {
    throw new Error("OPERATOR_MFA_ENCRYPTION_KEY must be a base64url or hex encoded 32-byte key.");
  }
  return crypto.subtle.importKey("raw", arrayBuffer(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function constantTimeCodeEqual(left: string, right: string) {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function arrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
