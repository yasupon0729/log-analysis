import JSZip from "jszip";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { S3Client } from "@/lib/s3/client";

import { ANALYSIS_BUCKET, ANALYSIS_REGION } from "../common";
import { resolveDownloadTarget } from "../utils";

const archivePreviewLogger = logger.child({
  component: "analysis-results-archive-preview",
});

const s3Client = new S3Client({
  bucket: ANALYSIS_BUCKET,
  region: ANALYSIS_REGION,
});

interface ArchivePreviewItem {
  key: string;
  fileName: string;
  path: string;
  dataUrl: string;
}

interface ArchivePreviewSuccessResponse {
  ok: true;
  items: ArchivePreviewItem[];
}

interface ArchivePreviewErrorResponse {
  ok: false;
  error: string;
}

type ArchivePreviewResponse =
  | ArchivePreviewSuccessResponse
  | ArchivePreviewErrorResponse;

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    archivePreviewLogger.warn("Failed to parse JSON body", { error });
    return NextResponse.json<ArchivePreviewResponse>(
      { ok: false, error: "リクエストボディを解析できませんでした" },
      { status: 400 },
    );
  }

  const keyParam =
    payload && typeof payload === "object" && "key" in payload
      ? (payload as { key?: unknown }).key
      : undefined;

  if (typeof keyParam !== "string" || !keyParam.trim()) {
    return NextResponse.json<ArchivePreviewResponse>(
      { ok: false, error: "key パラメーターが指定されていません" },
      { status: 400 },
    );
  }

  const target = resolveDownloadTarget(keyParam);
  if (!target) {
    return NextResponse.json<ArchivePreviewResponse>(
      { ok: false, error: "取得対象のキーが不正です" },
      { status: 400 },
    );
  }

  const { normalizedKey } = target;

  archivePreviewLogger.info("Archive preview requested", {
    key: normalizedKey,
  });

  try {
    const { body } = await s3Client.getObject({ key: normalizedKey });
    const zip = await JSZip.loadAsync(body);

    const entries = Object.keys(zip.files).sort((a, b) =>
      a.localeCompare(b, "ja"),
    );

    const items: ArchivePreviewItem[] = [];

    for (const entryName of entries) {
      const entry = zip.file(entryName);
      if (!entry || entry.dir) {
        continue;
      }

      const lowerName = entryName.toLowerCase();
      if (
        !(
          lowerName.endsWith(".png") ||
          lowerName.endsWith(".jpg") ||
          lowerName.endsWith(".jpeg")
        )
      ) {
        continue;
      }

      const base64 = await entry.async("base64");
      const mime = lowerName.endsWith(".png") ? "image/png" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${base64}`;
      const fileName = entryName.split("/").pop() ?? entryName;

      items.push({
        key: entryName,
        fileName,
        path: entryName,
        dataUrl,
      });
    }

    archivePreviewLogger.info("Archive preview extracted", {
      key: normalizedKey,
      imageCount: items.length,
    });

    return NextResponse.json<ArchivePreviewResponse>(
      { ok: true, items },
      { status: 200 },
    );
  } catch (error) {
    archivePreviewLogger.error("Failed to build archive preview", {
      key: normalizedKey,
      error,
    });
    return NextResponse.json<ArchivePreviewResponse>(
      {
        ok: false,
        error: "ZIP 内の画像を取得できませんでした。ログを確認してください。",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
