import { promises as fs } from "node:fs";
import path from "node:path";

import {
  decryptAnnotationFile,
  ensureAnnotationKey,
} from "@/lib/annotation/decrypt";

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationBoundary {
  polygon: { vertices: AnnotationPoint[] };
  bbox: [number, number, number, number];
  score: number;
  iou: number;
}

export interface AnnotationDataset {
  boundaries: AnnotationBoundary[];
}

export async function loadAnnotationDataset(): Promise<AnnotationDataset> {
  const { path: sourcePath, buffer: encrypted } = await readEncryptedAnnotation();
  const key = ensureAnnotationKey(process.env.ANNOTATION_ENCRYPTION_KEY);

  let decryptedBuffer: Buffer;
  try {
    decryptedBuffer = decryptAnnotationFile(encrypted, key);
  } catch (error) {
    const reason =
      error instanceof Error && error.message
        ? error.message
        : "unknown decryption error";
    throw new Error(
      `Failed to decrypt annotation dataset (${sourcePath}): ${reason}. ` +
        "確認: ANNOTATION_ENCRYPTION_KEY が暗号化時に使用した32バイトキーと一致しているかを確認してください。",
    );
  }

  const annotation = JSON.parse(
    decryptedBuffer.toString("utf8"),
  ) as AnnotationDataset;

  if (!Array.isArray(annotation.boundaries)) {
    throw new Error("Annotation dataset is missing boundaries");
  }

  return annotation;
}

async function readEncryptedAnnotation(): Promise<{ path: string; buffer: Buffer }> {
  const candidates = [
    path.join(process.cwd(), "input", "annotation.json.enc"),
    path.join(process.cwd(), "nextjs", "input", "annotation.json.enc"),
  ];

  for (const candidate of candidates) {
    try {
      const buffer = await fs.readFile(candidate);
      // eslint-disable-next-line no-console
      console.info("[annotation] loaded encrypted dataset", { path: candidate });
      return { path: candidate, buffer };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error("Encrypted annotation file was not found in known locations");
}
