import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { S3Client } from "@/lib/s3/client";

import {
  ANALYSIS_BUCKET,
  ANALYSIS_REGION,
  ANALYSIS_ROOT_PREFIX,
} from "../common";

const objectLogger = logger.child({ component: "analysis-result-object" });

const s3Client = new S3Client({
  bucket: ANALYSIS_BUCKET,
  region: ANALYSIS_REGION,
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const keyParam = url.searchParams.get("key");

  if (!keyParam) {
    return NextResponse.json(
      { ok: false, error: "key パラメーターが指定されていません" },
      { status: 400 },
    );
  }

  const normalizedKey = normalizeKey(keyParam);
  if (!normalizedKey) {
    return NextResponse.json(
      { ok: false, error: "取得対象のキーが不正です" },
      { status: 400 },
    );
  }

  objectLogger.info("Analysis object fetch requested", { key: normalizedKey });

  try {
    const { body, contentType } = await s3Client.getObject({
      key: normalizedKey,
    });

    const arrayBuffer = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    objectLogger.error("Analysis object fetch failed", {
      key: normalizedKey,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "S3 からオブジェクトを取得できませんでした" },
      { status: 500 },
    );
  }
}

function normalizeKey(key: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(key.trim());
  } catch {
    return null;
  }

  if (!decoded) {
    return null;
  }

  const sanitised = decoded.replace(/^\/+/, "");

  if (!sanitised.startsWith(ANALYSIS_ROOT_PREFIX)) {
    return null;
  }

  return sanitised;
}
