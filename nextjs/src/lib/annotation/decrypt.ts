import { createDecipheriv } from "node:crypto";

const AES_ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const DEFAULT_KEY = "0123456789abcdef0123456789abcdef";

export function ensureAnnotationKey(rawKey?: string | Buffer): Buffer {
  if (rawKey instanceof Buffer) {
    return validateKey(rawKey);
  }

  if (typeof rawKey === "string" && rawKey.trim().length > 0) {
    return validateKey(parseKey(rawKey.trim()));
  }

  return validateKey(Buffer.from(DEFAULT_KEY, "utf8"));
}

export function decryptAnnotationFile(payload: Buffer, key: Buffer): Buffer {
  if (payload.byteLength <= IV_LENGTH) {
    throw new Error("Encrypted annotation payload is too short");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH);
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function validateKey(key: Buffer): Buffer {
  if (key.length !== KEY_LENGTH) {
    throw new Error("ANNOTATION_ENCRYPTION_KEY must be 32 bytes");
  }
  return key;
}

function parseKey(raw: string): Buffer {
  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === KEY_LENGTH) {
    return utf8;
  }

  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  try {
    const decoded = Buffer.from(normalized + padding, "base64");
    if (decoded.length === KEY_LENGTH) {
      return decoded;
    }
  } catch (_error) {
    // ignore and fall through
  }

  throw new Error("ANNOTATION_ENCRYPTION_KEY must resolve to 32 bytes");
}
