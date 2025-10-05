import { createDecipheriv } from "node:crypto";
import { gunzipSync } from "node:zlib";

const AES_ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

export interface DecodeLogOptions {
  key?: Buffer | string;
  decompress?: boolean;
  encoding?: BufferEncoding;
}

export interface DecodeLogResult {
  decryptedBuffer: Buffer;
  logBuffer: Buffer;
  logText: string;
  didDecompress: boolean;
}

export function decodeEncryptedLog(
  payload: Buffer,
  options: DecodeLogOptions = {},
): DecodeLogResult {
  const key = ensureLogEncryptionKey(options.key);
  const decryptedBuffer = decryptLogPayload(payload, key);
  const shouldDecompress = options.decompress ?? true;
  const { buffer: logBuffer, didDecompress } = decompressIfNeeded(
    decryptedBuffer,
    shouldDecompress,
  );
  const encoding = options.encoding ?? "utf8";

  return {
    decryptedBuffer,
    logBuffer,
    logText: logBuffer.toString(encoding),
    didDecompress,
  };
}

export function ensureLogEncryptionKey(input?: Buffer | string): Buffer {
  if (input instanceof Buffer) {
    return validateKey(input);
  }

  if (typeof input === "string" && input.trim().length > 0) {
    return validateKey(parseKeyFromString(input));
  }

  const envKey = process.env.LOG_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error("LOG_ENCRYPTION_KEY is not defined");
  }

  return validateKey(parseKeyFromString(envKey));
}

export function decryptLogPayload(payload: Buffer, key: Buffer): Buffer {
  if (payload.byteLength <= IV_LENGTH) {
    throw new Error("Encrypted payload is too short to contain an IV");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH);
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function decompressIfNeeded(
  buffer: Buffer,
  shouldDecompress: boolean,
): { buffer: Buffer; didDecompress: boolean } {
  if (!shouldDecompress) {
    return { buffer, didDecompress: false };
  }

  try {
    const decompressed = gunzipSync(buffer);
    return { buffer: decompressed, didDecompress: true };
  } catch (_error) {
    throw new Error("Failed to gunzip decrypted log data");
  }
}

function parseKeyFromString(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("LOG_ENCRYPTION_KEY is empty");
  }

  const utf8 = Buffer.from(trimmed, "utf8");
  if (utf8.length === KEY_LENGTH) {
    return utf8;
  }

  const normalised = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalised.length % 4 === 0 ? "" : "=".repeat(4 - (normalised.length % 4));

  try {
    const decoded = Buffer.from(normalised + padding, "base64");
    if (decoded.length === KEY_LENGTH) {
      return decoded;
    }
  } catch (_error) {
    // fall through to error below
  }

  throw new Error("LOG_ENCRYPTION_KEY must resolve to 32 bytes");
}

function validateKey(key: Buffer): Buffer {
  if (key.length !== KEY_LENGTH) {
    throw new Error("LOG_ENCRYPTION_KEY must be 32 bytes for AES-256-CBC");
  }
  return key;
}
