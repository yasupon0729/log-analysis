import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.ANNOTATION_TOKEN_SECRET ?? "dev-annotation-secret";

export const ANNOTATION_COOKIE_NAME = "annotation-token";
export const TOKEN_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

export function generateAnnotationToken(): string {
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", SECRET)
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

export function verifyAnnotationToken(
  token: string | null | undefined,
): boolean {
  if (!token) {
    return false;
  }

  const [timestamp, signature] = token.split(".");
  if (!timestamp || !signature) {
    return false;
  }

  const issuedAt = Number.parseInt(timestamp, 10);
  if (Number.isNaN(issuedAt)) {
    return false;
  }
  if (Date.now() - issuedAt > TOKEN_MAX_AGE_SECONDS * 1000) {
    return false;
  }

  const expectedSignature = createHmac("sha256", SECRET)
    .update(timestamp)
    .digest("hex");

  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  try {
    return timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
