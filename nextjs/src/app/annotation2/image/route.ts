import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { resolveDataset } from "../_lib/dataset-service";

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const view = new Uint8Array(arrayBuffer);
  view.set(buffer);
  return arrayBuffer;
}

const originImagePath = path.join(
  process.cwd(),
  "src/app/annotation2/input/origin.png",
);
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

const imageLogger = logger.child({
  component: "annotation2-origin-image-route",
});

interface CachedImage {
  buffer: Buffer;
  etag: string;
  mtimeMs: number;
}

function buildEtag(buffer: Buffer, mtimeMs: number): string {
  const hash = createHash("sha1").update(buffer).digest("hex");
  return `W/"${hash}-${mtimeMs}"`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const imageCache = new Map<string, CachedImage>();

async function loadImage(imagePath: string): Promise<CachedImage> {
  const stat = await fs.stat(imagePath);
  const cached = imageCache.get(imagePath);

  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached;
  }

  const buffer = await fs.readFile(imagePath);
  const etag = buildEtag(buffer, stat.mtimeMs);

  const payload = { buffer, etag, mtimeMs: stat.mtimeMs };
  imageCache.set(imagePath, payload);
  return payload;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const datasetParam = url.searchParams.get("dataset") ?? undefined;

    const resolved = await resolveDataset(datasetParam);
    const imagePath = (await exists(resolved.imagePath))
      ? resolved.imagePath
      : originImagePath;

    const { buffer, etag } = await loadImage(imagePath);
    const ifNoneMatch = request.headers.get("if-none-match");

    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": CACHE_CONTROL,
        },
      });
    }

    const arrayBuffer = bufferToArrayBuffer(buffer);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": CACHE_CONTROL,
        ETag: etag,
      },
    });
  } catch (error) {
    imageLogger.error("Failed to serve dataset image", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, message: "画像の取得に失敗しました" },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
