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
import type { S3ObjectSummary } from "@/lib/s3/types";

const s3Logger = logger.child({ component: "s3-log-route" });

const S3_BUCKET =
  process.env.S3_BUCKET || process.env.S3_LOG_BUCKET || "gexel-secure-storage";
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION;

type S3Environment = "staging" | "production";

const DEFAULT_ENVIRONMENT: S3Environment = "staging";

const ENVIRONMENT_PREFIXES: Record<S3Environment, string> = {
  staging: process.env.S3_STAGING_PREFIX || "staging/backup/logs",
  production: process.env.S3_PRODUCTION_PREFIX || "product/backup/logs",
};

const s3Client = new S3Client({
  bucket: S3_BUCKET,
  region: S3_REGION,
});

const LOG_ENCRYPTION_KEY = process.env.LOG_ENCRYPTION_KEY;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface S3LogSuccessResponse {
  ok: true;
  startDate: string;
  endDate: string;
  requestedDates: string[];
  fetchedDates: string[];
  missingDates: string[];
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
    const startDateParam = url.searchParams.get("startDate") || undefined;
    const endDateParam = url.searchParams.get("endDate") || undefined;
    const environmentParam = url.searchParams.get("environment") || undefined;

    const startDateValue = startDateParam || dateParam || undefined;

    if (!startDateValue) {
      return NextResponse.json<S3LogResponse>(
        { ok: false, error: "日付パラメーターが指定されていません" },
        { status: 400 },
      );
    }

    const endDateValue = endDateParam || startDateValue;

    if (
      !isValidDateString(startDateValue) ||
      !isValidDateString(endDateValue)
    ) {
      return NextResponse.json<S3LogResponse>(
        { ok: false, error: "日付の形式が不正です (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const requestedDates = enumerateDateRange(startDateValue, endDateValue);
    if (requestedDates.length === 0) {
      return NextResponse.json<S3LogResponse>(
        { ok: false, error: "日付範囲が不正です" },
        { status: 400 },
      );
    }

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
    const aggregatedObjects: Array<{ summary: S3ObjectSummary; date: string }> =
      [];
    const fetchedDates = new Set<string>();
    const missingDates: string[] = [];

    for (const date of requestedDates) {
      const objectPrefix = buildObjectPrefix({ environment, date });

      s3Logger.info("S3 log fetch requested", {
        environment,
        date,
        objectPrefix,
      });

      const { objects } = await s3Client.listObjects({ prefix: objectPrefix });

      if (objects.length === 0) {
        missingDates.push(date);
        s3Logger.warn("No S3 logs found for date", { environment, date });
        continue;
      }

      fetchedDates.add(date);
      const sorted = objects
        .slice()
        .sort((a, b) => a.fullKey.localeCompare(b.fullKey));
      for (const summary of sorted) {
        aggregatedObjects.push({ summary, date });
      }
    }

    if (aggregatedObjects.length === 0) {
      return NextResponse.json<S3LogResponse>(
        {
          ok: false,
          error: `${environment} 環境の指定期間のログが見つかりませんでした`,
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

    for (const { summary: object } of aggregatedObjects) {
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

      for (const entry of decoded.entries) {
        sources.push({
          name: entry.name,
          fileType: entry.fileType,
          originalSize: entry.originalSize,
          processedSize: entry.processedSize,
          logSize: entry.logSize,
          didDecompress: entry.didDecompress,
        });
      }
    }

    if (parts.length === 0) {
      return NextResponse.json<S3LogResponse>(
        { ok: false, error: "サポート対象のファイルが見つかりませんでした" },
        { status: 404 },
      );
    }

    const logText = parts.join("\n\n");

    const startDate = requestedDates[0];
    const endDate = requestedDates[requestedDates.length - 1];

    return NextResponse.json<S3LogResponse>({
      ok: true,
      startDate,
      endDate,
      requestedDates,
      fetchedDates: Array.from(fetchedDates).sort(),
      missingDates,
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
  date,
}: {
  environment: S3Environment;
  date: string;
}): string {
  const [year, month, day] = date.split("-");
  const basePrefix = normalizePrefix(ENVIRONMENT_PREFIXES[environment]);
  const monthSegment = `${year}-${month}`;
  const filePrefix = `app_${year}${month}${day}`;
  return `${basePrefix}/${monthSegment}/${filePrefix}`;
}

function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function enumerateDateRange(startDate: string, endDate: string): string[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start || !end) {
    return [];
  }

  if (start.getTime() > end.getTime()) {
    return [];
  }

  const dates: string[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatUtcDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function parseDate(value: string): Date | null {
  if (!isValidDateString(value)) {
    return null;
  }

  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
