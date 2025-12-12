import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";

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

let cachedImage: CachedImage | null = null;

async function loadOriginImage(): Promise<CachedImage> {
  const stat = await fs.stat(originImagePath);

  if (cachedImage && cachedImage.mtimeMs === stat.mtimeMs) {
    return cachedImage;
  }

  const buffer = await fs.readFile(originImagePath);
  const etag = buildEtag(buffer, stat.mtimeMs);

  cachedImage = { buffer, etag, mtimeMs: stat.mtimeMs };
  return cachedImage;
}

function buildEtag(buffer: Buffer, mtimeMs: number): string {
  const hash = createHash("sha1").update(buffer).digest("hex");
  return `W/"${hash}-${mtimeMs}"`;
}

export async function GET(request: NextRequest) {
  try {
    const { buffer, etag } = await loadOriginImage();
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
    imageLogger.error("Failed to serve origin.png", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, message: "origin.png の取得に失敗しました" },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
