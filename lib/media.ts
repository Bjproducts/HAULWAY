import { getStorage, throwDatabaseError } from "@/db";
import { sniffMediaType } from "@/lib/media-signatures";
import { PublicError } from "@/lib/responses";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

const ALLOWED_MEDIA = new Map<string, Set<string>>([
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
  ["image/webp", new Set([".webp"])],
  ["image/gif", new Set([".gif"])],
  ["image/heic", new Set([".heic"])],
  ["image/heif", new Set([".heif"])],
  ["video/mp4", new Set([".mp4", ".m4v"])],
  ["video/quicktime", new Set([".mov"])],
  ["video/webm", new Set([".webm"])],
]);

export class UnsafeMediaError extends PublicError {
  constructor(message = "An uploaded file does not match its declared photo or video format.") {
    super(message, 422);
    this.name = "UnsafeMediaError";
  }
}

export function mediaDeclarationAllowed(filename: string, contentType: string) {
  return ALLOWED_MEDIA.get(contentType)?.has(safeExtension(filename)) === true;
}

export function safeExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return match?.[0] ?? "";
}

export async function verifyStoredMediaHeader(objectKey: string, expectedType: string) {
  const { data, error } = await getStorage().createSignedUrl(objectKey, 60);
  throwDatabaseError(error);
  if (!data?.signedUrl) throw new UnsafeMediaError("An upload could not be verified.");

  const response = await fetch(data.signedUrl, {
    headers: { Range: "bytes=0-127" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok || !response.body) throw new UnsafeMediaError("An upload could not be read for verification.");

  const reader = response.body.getReader();
  const header = new Uint8Array(128);
  let written = 0;
  try {
    while (written < header.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, header.length - written);
      header.set(value.subarray(0, take), written);
      written += take;
      if (written >= header.length) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const detected = sniffMediaType(header.subarray(0, written), expectedType);
  if (detected !== expectedType) throw new UnsafeMediaError();
}
