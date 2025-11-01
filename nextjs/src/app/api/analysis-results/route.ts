/**
 * S3 上の解析結果フォルダを走査してテーブル用のデータを返す API ルート。
 * データ構造は product/user/[user-id]/analysis_result/main/[analysis-id]/... を想定する。
 */

import { NextResponse } from "next/server";
import {
  type AnalysisResultFileEntry,
  type AnalysisResultSummary,
  buildAnalysisPrefix,
  type CollectAnalysisDependencies,
  collectAnalysisData,
  compareByTimestampThenKey,
  normalizeAnalysisTypeParam,
} from "@/lib/analysis-results/service";
import { logger } from "@/lib/logger/server";
import { S3Client } from "@/lib/s3/client";
import { ANALYSIS_BUCKET, ANALYSIS_REGION } from "./common";
import {
  resolveAnalysisIdsFromDatabase,
  resolveUserIdsFromDatabase,
} from "./db";

// 全体を通じて利用するロガー。component を明示しておくとログ検索が楽。
const analysisLogger = logger.child({ component: "analysis-results-route" });

const s3Client = new S3Client({
  bucket: ANALYSIS_BUCKET,
  region: ANALYSIS_REGION,
});

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_TTL_MS = (() => {
  const raw = process.env.ANALYSIS_RESULTS_CACHE_TTL_MS;
  if (!raw) {
    return DEFAULT_CACHE_TTL_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_TTL_MS;
  }

  return parsed;
})();

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const usersCache = new Map<string, CacheEntry<string[]>>();
const usersInflight = new Map<string, Promise<string[]>>();

type AnalysisCacheValue = {
  files: AnalysisResultFileEntry[];
  analyses: AnalysisResultSummary[];
  hasMore: boolean;
  totalAnalyses: number;
};

const analysisCache = new Map<string, CacheEntry<AnalysisCacheValue>>();
const analysisInflight = new Map<string, Promise<AnalysisCacheValue>>();

const analysisDependencies: CollectAnalysisDependencies = {
  resolveUserIds: resolveUserIdsFromDatabase,
  resolveAnalysisIdsFromDatabase,
};

interface AnalysisResultsSuccessResponse {
  ok: true;
  files: AnalysisResultFileEntry[];
  analyses: AnalysisResultSummary[];
  users: string[];
  pagination: {
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

interface AnalysisResultsErrorResponse {
  ok: false;
  error: string;
}

type AnalysisResultsResponse =
  | AnalysisResultsSuccessResponse
  | AnalysisResultsErrorResponse;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userIdParam = url.searchParams.get("userId") || undefined;
  const analysisIdParam = url.searchParams.get("analysisId") || undefined;
  const analysisTypeParam = normalizeAnalysisTypeParam(
    url.searchParams.get("analysisType") || undefined,
  );
  const limitParam = url.searchParams.get("limit") || undefined;
  const pageParam = url.searchParams.get("page") || undefined;
  const forceRefreshParam = url.searchParams.get("forceRefresh") || undefined;

  const pageSize = clampInteger(limitParam, 20, 1, 100);
  const page = clampInteger(pageParam, 1, 1, 500);
  const forceRefresh =
    forceRefreshParam === "1" || forceRefreshParam?.toLowerCase() === "true";

  const prefix = buildAnalysisPrefix({
    userId: userIdParam,
    analysisType: analysisTypeParam,
    analysisId: analysisIdParam,
  });

  analysisLogger.info("Analysis results fetch requested", {
    userId: userIdParam,
    analysisId: analysisIdParam,
    analysisType: analysisTypeParam,
    prefix,
  });

  try {
    const users = await getCachedUsers(forceRefresh);

    if (!userIdParam) {
      if (users.length === 0) {
        return NextResponse.json<AnalysisResultsResponse>({
          ok: true,
          files: [],
          analyses: [],
          users,
          pagination: {
            page: 1,
            pageSize,
            hasMore: false,
          },
        });
      }

      const aggregatedPageSize = page * pageSize;
      const perUserResults = await Promise.all(
        users.map((userId) =>
          getCachedAnalysisData(
            {
              userId,
              analysisId: undefined,
              analysisType: analysisTypeParam,
              page: 1,
              pageSize: aggregatedPageSize,
            },
            forceRefresh,
          ),
        ),
      );

      const mergedAnalyses = perUserResults
        .flatMap((result) => result.analyses)
        .sort((a, b) =>
          compareByTimestampThenKey(
            a.lastModified,
            b.lastModified,
            a.prefix,
            b.prefix,
          ),
        );

      const startIndex = (page - 1) * pageSize;
      const pagedAnalyses = mergedAnalyses.slice(
        startIndex,
        startIndex + pageSize,
      );
      const hasMoreAggregated = mergedAnalyses.length > startIndex + pageSize;

      const selectedKeys = new Set(
        pagedAnalyses.map(
          (analysis) => `${analysis.userId}::${analysis.analysisId}`,
        ),
      );

      const mergedFiles = perUserResults
        .flatMap((result) => result.files)
        .filter((file) =>
          selectedKeys.has(`${file.userId}::${file.analysisId}`),
        );

      return NextResponse.json<AnalysisResultsResponse>({
        ok: true,
        files: mergedFiles,
        analyses: pagedAnalyses,
        users,
        pagination: {
          page,
          pageSize,
          hasMore: hasMoreAggregated,
        },
      });
    }

    if (!users.includes(userIdParam)) {
      return NextResponse.json<AnalysisResultsResponse>({
        ok: true,
        files: [],
        analyses: [],
        users,
        pagination: {
          page: 1,
          pageSize,
          hasMore: false,
        },
      });
    }

    const { files, analyses, hasMore } = await getCachedAnalysisData(
      {
        userId: userIdParam,
        analysisId: analysisIdParam,
        analysisType: analysisTypeParam,
        page,
        pageSize,
      },
      forceRefresh,
    );

    analysisLogger.info("Analysis results fetch completed", {
      userId: userIdParam,
      analysisId: analysisIdParam,
      prefix,
      fileCount: files.length,
      analysisCount: analyses.length,
    });

    return NextResponse.json<AnalysisResultsResponse>({
      ok: true,
      files,
      analyses,
      users,
      pagination: {
        page,
        pageSize,
        hasMore,
      },
    });
  } catch (error) {
    analysisLogger.error("Analysis results fetch failed", {
      userId: userIdParam,
      analysisId: analysisIdParam,
      prefix,
      error,
    });

    return NextResponse.json<AnalysisResultsResponse>(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "解析結果の取得中に不明なエラーが発生しました",
      },
      { status: 500 },
    );
  }
}

async function getCachedUsers(forceRefresh: boolean): Promise<string[]> {
  if (CACHE_TTL_MS <= 0) {
    return resolveUserIds();
  }

  const cacheKey = "users:all";
  const now = Date.now();
  const cached = usersCache.get(cacheKey);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    analysisLogger.debug("Serving cached users list");
    return cached.value;
  }

  if (!forceRefresh) {
    const inflight = usersInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }
  }

  const promise = resolveUserIds()
    .then((value) => {
      usersCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      analysisLogger.debug("Users list cached", {
        size: value.length,
        ttlMs: CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      usersInflight.delete(cacheKey);
    });

  usersInflight.set(cacheKey, promise);
  return promise;
}

async function getCachedAnalysisData(
  params: {
    userId?: string;
    analysisId?: string;
    analysisType?: string;
    page: number;
    pageSize: number;
  },
  forceRefresh: boolean,
): Promise<AnalysisCacheValue> {
  if (CACHE_TTL_MS <= 0) {
    return collectAnalysisData(s3Client, params, analysisDependencies);
  }

  const cacheKey = buildAnalysisCacheKey(params);
  const now = Date.now();
  const cached = analysisCache.get(cacheKey);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    analysisLogger.debug("Serving cached analysis data", {
      cacheKey,
      source: "cache",
      expiresInMs: cached.expiresAt - now,
    });

    triggerBackgroundRefresh(cacheKey, params);
    return cached.value;
  }

  if (!forceRefresh) {
    const inflight = analysisInflight.get(cacheKey);
    if (inflight) {
      analysisLogger.debug("Awaiting inflight analysis data", {
        cacheKey,
        source: "inflight",
      });
      return inflight;
    }
  }

  analysisLogger.debug("Cache miss for analysis data", {
    cacheKey,
    forceRefresh,
  });

  const fetchStartedAt = Date.now();
  const promise = collectAnalysisData(s3Client, params, analysisDependencies)
    .then((value) => {
      cacheAnalysisValue(cacheKey, value);
      analysisLogger.debug("Fresh analysis data collected", {
        cacheKey,
        durationMs: Date.now() - fetchStartedAt,
        fileCount: value.files.length,
        analysisCount: value.analyses.length,
      });
      return value;
    })
    .finally(() => {
      analysisInflight.delete(cacheKey);
    });

  analysisInflight.set(cacheKey, promise);
  return promise;
}

function buildAnalysisCacheKey(params: {
  userId?: string;
  analysisId?: string;
  analysisType?: string;
  page: number;
  pageSize: number;
}): string {
  return JSON.stringify({
    userId: params.userId ?? null,
    analysisId: params.analysisId ?? null,
    analysisType: params.analysisType ?? null,
    page: params.page,
    pageSize: params.pageSize,
  });
}

function cacheAnalysisValue(cacheKey: string, value: AnalysisCacheValue): void {
  if (value.files.length === 0 && value.analyses.length === 0) {
    analysisLogger.debug("Skipping cache store for empty analysis result", {
      cacheKey,
    });
    return;
  }

  analysisCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  analysisLogger.debug("Analysis data cached", {
    cacheKey,
    fileCount: value.files.length,
    analysisCount: value.analyses.length,
    ttlMs: CACHE_TTL_MS,
  });
}

function triggerBackgroundRefresh(
  cacheKey: string,
  params: {
    userId?: string;
    analysisId?: string;
    analysisType?: string;
    page: number;
    pageSize: number;
  },
): void {
  if (analysisInflight.has(cacheKey)) {
    return;
  }

  analysisLogger.debug("Starting background refresh", {
    cacheKey,
  });

  const startedAt = Date.now();
  const promise = collectAnalysisData(s3Client, params, analysisDependencies)
    .then((value) => {
      cacheAnalysisValue(cacheKey, value);
      analysisLogger.debug("Background refresh completed", {
        cacheKey,
        durationMs: Date.now() - startedAt,
        fileCount: value.files.length,
        analysisCount: value.analyses.length,
      });
      return value;
    })
    .catch((error: unknown) => {
      analysisLogger.warn("Background refresh failed", {
        cacheKey,
        error,
      });
      throw error;
    })
    .finally(() => {
      analysisInflight.delete(cacheKey);
    });

  analysisInflight.set(cacheKey, promise);
}

async function resolveUserIds(expected?: string): Promise<string[]> {
  return resolveUserIdsFromDatabase(expected);
}

function clampInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}
