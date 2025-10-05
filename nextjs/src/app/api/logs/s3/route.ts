import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { decodeLogBuffer } from "@/lib/logs/decode";
import { ensureLogEncryptionKey } from "@/lib/logs/decoder";
import {
  detectFileTypeFromName,
  type SupportedFileType,
} from "@/lib/logs/file-types";
import { S3Client } from "@/lib/s3/client";

const s3Logger = logger.child({ component: "s3-log-route" });

const S3_BUCKET =
  process.env.S3_BUCKET || process.env.S3_LOG_BUCKET || "gexel-secure-storage";
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION;

type S3Environment = "staging" | "production";

const DEFAULT_ENVIRONMENT: S3Environment = "staging";

const ENVIRONMENT_PREFIXES: Record<S3Environment, string> = {
  staging: process.env.S3_STAGING_PREFIX || "staging/backup/logs",
  production: process.env.S3_PRODUCTION_PREFIX || "backup/logs",
};

const s3Client = new S3Client({
  bucket: S3_BUCKET,
  region: S3_REGION,
});

const LOG_ENCRYPTION_KEY = process.env.LOG_ENCRYPTION_KEY;

interface S3LogSuccessResponse {
  ok: true;
  date: string;
  logText: string;
  encryptedSize: number;
  decryptedSize: number;
  logSize: number;
  didDecompress: boolean;
  sources: Array<{
    name: string;
    fileType: SupportedFileType;
    originalSize: number;
    processedSize: number;
    logSize: number;
    didDecompress: boolean;
  }>;
}

interface S3LogErrorResponse {
  ok: false;
  error: string;
}

type S3LogResponse = S3LogSuccessResponse | S3LogErrorResponse;

export async function GET(request: NextRequest) {
  let environment: S3Environment | null = null;
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");
    const environmentParam = url.searchParams.get("environment") || undefined;

    if (!dateParam) {
      return NextResponse.json<S3LogResponse>(
        { ok: false, error: "date パラメーターは必須です" },
        { status: 400 },
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json<S3LogResponse>(
        { ok: false, error: "日付の形式が不正です (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const [year, month, day] = dateParam.split("-");
    environment = resolveEnvironment(environmentParam);
    if (!environment) {
      return NextResponse.json<S3LogResponse>(
        {
          ok: false,
          error: "environment パラメーターが不正です (staging|production)",
        },
        { status: 400 },
      );
    }
    const objectPrefix = buildObjectPrefix({ environment, year, month, day });

    s3Logger.info("S3 log fetch requested", {
      environment,
      objectPrefix,
    });

    const { objects } = await s3Client.listObjects({ prefix: objectPrefix });

    if (objects.length === 0) {
      return NextResponse.json<S3LogResponse>(
        {
          ok: false,
          error: `${environment} 環境の指定日のログが見つかりませんでした`,
        },
        { status: 404 },
      );
    }

    const encryptionKey = LOG_ENCRYPTION_KEY
      ? ensureLogEncryptionKey(LOG_ENCRYPTION_KEY)
      : undefined;

    const parts: string[] = [];
    const sources: S3LogSuccessResponse["sources"] = [];
    let totalEncryptedSize = 0;
    let totalDecryptedSize = 0;
    let totalLogSize = 0;
    let anyDecompress = false;

    for (const object of objects) {
      const fileType = detectFileTypeFromName(object.key);
      if (!fileType) {
        s3Logger.warn("Unsupported S3 log file skipped", { key: object.key });
        continue;
      }

      const { body } = await s3Client.getObject({ key: object.key });
      const decoded = await decodeLogBuffer({
        buffer: body,
        fileType,
        encoding: "utf8",
        encryptionKey,
        filename: object.key,
      });

      parts.push(`===== ${object.key} =====\n${decoded.logText}`);
      totalEncryptedSize += decoded.encryptedSize;
      totalDecryptedSize += decoded.decryptedSize;
      totalLogSize += decoded.logSize;
      anyDecompress ||= decoded.didDecompress;

      decoded.entries.forEach((entry) => {
        sources.push({
          name: entry.name,
          fileType: entry.fileType,
          originalSize: entry.originalSize,
          processedSize: entry.processedSize,
          logSize: entry.logSize,
          didDecompress: entry.didDecompress,
        });
      });
    }

    if (parts.length === 0) {
      return NextResponse.json<S3LogResponse>(
        { ok: false, error: "サポート対象のファイルが見つかりませんでした" },
        { status: 404 },
      );
    }

    const logText = parts.join("\n\n");

    return NextResponse.json<S3LogResponse>({
      ok: true,
      date: dateParam,
      logText,
      encryptedSize: totalEncryptedSize,
      decryptedSize: totalDecryptedSize,
      logSize: totalLogSize,
      didDecompress: anyDecompress,
      sources,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    s3Logger.error("S3 log fetch failed", {
      error: message,
      environment: environment ?? "unknown",
    });

    return NextResponse.json<S3LogResponse>(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

function resolveEnvironment(value: string | undefined): S3Environment | null {
  if (!value) {
    return DEFAULT_ENVIRONMENT;
  }

  const normalized = value.toLowerCase();
  if (normalized === "production" || normalized === "staging") {
    return normalized;
  }

  return null;
}

function normalizePrefix(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function buildObjectPrefix({
  environment,
  year,
  month,
  day,
}: {
  environment: S3Environment;
  year: string;
  month: string;
  day: string;
}): string {
  const basePrefix = normalizePrefix(ENVIRONMENT_PREFIXES[environment]);
  const monthSegment = `${year}-${month}`;
  const filePrefix = `app_${year}${month}${day}`;
  return `${basePrefix}/${monthSegment}/${filePrefix}`;
}
