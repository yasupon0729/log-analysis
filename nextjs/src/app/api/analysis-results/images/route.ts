import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { S3Client } from "@/lib/s3/client";
import type { S3ObjectSummary } from "@/lib/s3/types";

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

const imagesLogger = logger.child({
  component: "analysis-results-images-download",
});

const s3Client = new S3Client({
  bucket: ANALYSIS_BUCKET,
  region: ANALYSIS_REGION,
});

const IMAGE_DIRECTORY_CANDIDATES = ["original_images", "oriinal_images"];

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

  imagesLogger.info("Images zip requested", {
    key: normalizedKey,
    parentPrefix,
    analysisPrefix,
  });

  let objects: S3ObjectSummary[] = [];
  let resolvedImagesPrefix = "";

  for (const directory of IMAGE_DIRECTORY_CANDIDATES) {
    const candidatePrefix = ensureTrailingSlash(
      `${analysisPrefix}${directory}`,
    );
    const listed = await listAllObjects(s3Client, candidatePrefix);

    if (listed.length > 0) {
      objects = listed;
      resolvedImagesPrefix = candidatePrefix;
      break;
    }

    if (!resolvedImagesPrefix) {
      resolvedImagesPrefix = candidatePrefix;
    }
  }

  if (objects.length === 0) {
    imagesLogger.info("No images found for download target", {
      key: normalizedKey,
      parentPrefix,
      analysisPrefix,
      resolvedImagesPrefix,
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
    imagesLogger.info("Image prefix contained no downloadable objects", {
      key: normalizedKey,
      parentPrefix,
      analysisPrefix,
      resolvedImagesPrefix,
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
  const fileName = `${baseName}_images.zip`;
  const disposition = buildContentDisposition(fileName);

  imagesLogger.info("Images zip created", {
    key: normalizedKey,
    parentPrefix,
    analysisPrefix,
    resolvedImagesPrefix,
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
