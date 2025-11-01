import JSZip from "jszip";

import { deriveAnalysisIdentifiersFromDownloadLink } from "@/lib/analysis-results/download-link";
import { listAllObjects as listAllAnalysisObjects } from "@/lib/analysis-results/service";
import type { S3Client } from "@/lib/s3/client";
import type { S3ObjectSummary } from "@/lib/s3/types";
import { ANALYSIS_ROOT_PREFIX, ensureTrailingSlash } from "./common";

export interface DownloadTargetInfo {
  normalizedKey: string;
  parentPrefix: string;
  identifiers: ReturnType<typeof deriveAnalysisIdentifiersFromDownloadLink>;
}

export function normalizeAnalysisKey(rawKey: string): string | null {
  if (!rawKey) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawKey.trim());
  } catch {
    return null;
  }

  if (!decoded) {
    return null;
  }

  if (decoded.includes("..")) {
    return null;
  }

  const sanitized = decoded.replace(/^\/+/, "");
  if (!sanitized.startsWith(ANALYSIS_ROOT_PREFIX)) {
    return null;
  }

  return sanitized;
}

export function resolveDownloadTarget(
  rawKey: string,
): DownloadTargetInfo | null {
  const normalizedKey = normalizeAnalysisKey(rawKey);
  if (!normalizedKey) {
    return null;
  }

  const trimmed = normalizedKey.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  const parentPrefix =
    lastSlash === -1
      ? ensureTrailingSlash(ANALYSIS_ROOT_PREFIX)
      : ensureTrailingSlash(trimmed.slice(0, lastSlash + 1));

  return {
    normalizedKey,
    parentPrefix,
    identifiers: deriveAnalysisIdentifiersFromDownloadLink(normalizedKey),
  };
}

export const listAllObjects = listAllAnalysisObjects;

export async function buildZipFromObjects(
  client: S3Client,
  objects: S3ObjectSummary[],
  basePrefix: string,
): Promise<{ buffer: Buffer | null; fileCount: number }> {
  const normalizedBase = ensureTrailingSlash(basePrefix);
  const zip = new JSZip();
  let count = 0;

  for (const object of objects) {
    const relativePath = deriveRelativePath(object.fullKey, normalizedBase);
    if (!relativePath) {
      continue;
    }

    const { body } = await client.getObject({ key: object.key });
    zip.file(relativePath, body);
    count += 1;
  }

  if (count === 0) {
    return { buffer: null, fileCount: 0 };
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    streamFiles: true,
  });

  return { buffer, fileCount: count };
}

function deriveRelativePath(
  fullKey: string,
  basePrefix: string,
): string | null {
  if (!fullKey.startsWith(basePrefix)) {
    return fullKey.replace(/^\/+/, "");
  }

  const sliced = fullKey.slice(basePrefix.length);
  const normalized = sliced.replace(/^\/+/, "");
  return normalized.length > 0 ? normalized : null;
}

export function extractLastSegment(prefix: string): string | null {
  const trimmed = prefix.replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split("/");
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

export function buildContentDisposition(fileName: string): string {
  const sanitized = fileName.replace(/[/\\"]/g, "_");
  const encoded = encodeURIComponent(sanitized);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const view = new Uint8Array(arrayBuffer);
  view.set(buffer);
  return arrayBuffer;
}
