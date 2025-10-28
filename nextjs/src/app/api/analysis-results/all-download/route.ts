import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { S3Client } from "@/lib/s3/client";

import {
  ANALYSIS_BUCKET,
  ANALYSIS_REGION,
  ensureTrailingSlash,
} from "../common";
import {
  bufferToArrayBuffer,
  buildContentDisposition,
  buildZipFromObjects,
  extractLastSegment,
  listAllObjects,
  resolveDownloadTarget,
} from "../utils";

const allDownloadLogger = logger.child({
  component: "analysis-results-all-download",
});

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

  const target = resolveDownloadTarget(keyParam);
  if (!target) {
    return NextResponse.json(
      { ok: false, error: "取得対象のキーが不正です" },
      { status: 400 },
    );
  }

  const { normalizedKey, parentPrefix, identifiers } = target;
  const analysisPrefix =
    identifiers?.prefix !== undefined
      ? ensureTrailingSlash(identifiers.prefix)
      : parentPrefix;

  allDownloadLogger.info("All download zip requested", {
    key: normalizedKey,
    parentPrefix,
    analysisPrefix,
  });

  const objects = await listAllObjects(s3Client, analysisPrefix);
  if (objects.length === 0) {
    allDownloadLogger.info("No objects found for all-download target", {
      key: normalizedKey,
      parentPrefix,
      analysisPrefix,
    });

    return NextResponse.json(
      { ok: false, message: "データがありません。" },
      { status: 200 },
    );
  }

  const { buffer, fileCount } = await buildZipFromObjects(
    s3Client,
    objects,
    parentPrefix,
  );

  if (!buffer || fileCount === 0) {
    allDownloadLogger.info("All-download prefix contained no files", {
      key: normalizedKey,
      parentPrefix,
      analysisPrefix,
    });

    return NextResponse.json(
      { ok: false, message: "データがありません。" },
      { status: 200 },
    );
  }

  const baseName =
    identifiers?.analysisId ??
    extractLastSegment(analysisPrefix) ??
    extractLastSegment(parentPrefix) ??
    "analysis";
  const fileName = `${baseName}_all.zip`;
  const disposition = buildContentDisposition(fileName);

  allDownloadLogger.info("All-download zip created", {
    key: normalizedKey,
    parentPrefix,
    analysisPrefix,
    fileCount,
    fileName,
  });

  const arrayBuffer = bufferToArrayBuffer(buffer);

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=60",
      "Content-Length": buffer.byteLength.toString(),
    },
  });
}

export const runtime = "nodejs";
