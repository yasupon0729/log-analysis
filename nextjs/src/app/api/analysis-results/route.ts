/**
 * S3 上の解析結果フォルダを走査してテーブル用のデータを返す API ルート。
 * データ構造は product/user/[user-id]/analysis_result/main/[analysis-id]/... を想定する。
 */

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { S3Client } from "@/lib/s3/client";
import type { S3ObjectSummary } from "@/lib/s3/types";

import {
  ANALYSIS_BASE_PREFIX,
  ANALYSIS_BUCKET,
  ANALYSIS_REGION,
  ANALYSIS_ROOT_PREFIX,
  ANALYSIS_SEGMENTS,
  ensureTrailingSlash,
} from "./common";

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
};

const analysisCache = new Map<string, CacheEntry<AnalysisCacheValue>>();
const analysisInflight = new Map<string, Promise<AnalysisCacheValue>>();

interface AnalysisResultFileEntry {
  userId: string;
  analysisId: string;
  fileName: string;
  relativePath: string;
  key: string;
  analysisPrefix: string;
  size?: number;
  lastModified?: string;
}

interface AnalysisResultSummary {
  userId: string;
  analysisId: string;
  prefix: string;
  fileCount: number;
  totalSize: number;
  lastModified?: string;
}

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
  const limitParam = url.searchParams.get("limit") || undefined;
  const pageParam = url.searchParams.get("page") || undefined;
  const forceRefreshParam = url.searchParams.get("forceRefresh") || undefined;

  const pageSize = clampInteger(limitParam, 20, 1, 100);
  const page = clampInteger(pageParam, 1, 1, 500);
  const forceRefresh =
    forceRefreshParam === "1" || forceRefreshParam?.toLowerCase() === "true";

  const prefix = buildPrefix({
    userId: userIdParam,
    analysisId: analysisIdParam,
  });

  analysisLogger.info("Analysis results fetch requested", {
    userId: userIdParam,
    analysisId: analysisIdParam,
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

async function listAllObjects(prefix: string): Promise<S3ObjectSummary[]> {
  const accumulated: S3ObjectSummary[] = [];
  let continuationToken: string | undefined;

  do {
    const { objects, nextContinuationToken } = await s3Client.listObjects({
      prefix,
      continuationToken,
    });
    accumulated.push(...objects);
    continuationToken = nextContinuationToken;
  } while (continuationToken);

  return accumulated;
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
    page: number;
    pageSize: number;
  },
  forceRefresh: boolean,
): Promise<AnalysisCacheValue> {
  if (CACHE_TTL_MS <= 0) {
    return collectAnalysisData(params);
  }

  const cacheKey = buildAnalysisCacheKey(params);
  const now = Date.now();
  const cached = analysisCache.get(cacheKey);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    analysisLogger.debug("Serving cached analysis data", {
      cacheKey,
    });

    triggerBackgroundRefresh(cacheKey, params);
    return cached.value;
  }

  if (!forceRefresh) {
    const inflight = analysisInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }
  }

  const promise = collectAnalysisData(params)
    .then((value) => {
      cacheAnalysisValue(cacheKey, value);
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
  page: number;
  pageSize: number;
}): string {
  return JSON.stringify({
    userId: params.userId ?? null,
    analysisId: params.analysisId ?? null,
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
    page: number;
    pageSize: number;
  },
): void {
  if (analysisInflight.has(cacheKey)) {
    return;
  }

  const promise = collectAnalysisData(params).then((value) => {
    cacheAnalysisValue(cacheKey, value);
    return value;
  });

  promise.catch((error: unknown) => {
    analysisLogger.warn("Background refresh failed", {
      cacheKey,
      error,
    });
  });

  promise.finally(() => {
    analysisInflight.delete(cacheKey);
  });

  analysisInflight.set(cacheKey, promise);
}

async function collectAnalysisData({
  userId,
  analysisId,
  page,
  pageSize,
}: {
  userId?: string;
  analysisId?: string;
  page: number;
  pageSize: number;
}): Promise<{
  files: AnalysisResultFileEntry[];
  analyses: AnalysisResultSummary[];
  hasMore: boolean;
}> {
  // 単一ユーザーの解析 ID をページングし、表示対象分だけ詳細情報を収集する。
  if (!userId) {
    return { files: [], analyses: [], hasMore: false };
  }

  const availableUsers = await resolveUserIds(userId);
  if (!availableUsers.includes(userId)) {
    analysisLogger.warn("Requested user not found", { userId });
    return { files: [], analyses: [], hasMore: false };
  }

  const analysisBasePrefix = buildAnalysisBasePrefix(userId);
  const desiredCount = analysisId ? 1 : pageSize * page + 1;
  const rawAnalysisIds = analysisId
    ? [analysisId]
    : await discoverDirectChildren(analysisBasePrefix, desiredCount);

  const sortedAnalysisIds = sortAnalysisIdsDescending(rawAnalysisIds);

  let hasMore = false;
  let targetAnalysisIds = sortedAnalysisIds;

  if (!analysisId) {
    const startIndex = (page - 1) * pageSize;
    targetAnalysisIds = sortedAnalysisIds.slice(
      startIndex,
      startIndex + pageSize,
    );
    hasMore = sortedAnalysisIds.length > page * pageSize;
  }

  analysisLogger.info("Resolved target analysis IDs", {
    userId,
    analysisId,
    page,
    pageSize,
    candidateCount: sortedAnalysisIds.length,
    targetAnalysisIds,
    hasMore,
  });

  const analysisEntries = await Promise.all(
    targetAnalysisIds.map(async (currentAnalysisId) => {
      const analysisPrefix = buildPrefix({
        userId,
        analysisId: currentAnalysisId,
      });

      analysisLogger.info("Listing analysis objects", {
        userId,
        analysisId: currentAnalysisId,
        analysisPrefix,
      });

      const objects = await listAllObjects(analysisPrefix);
      analysisLogger.info("Fetched analysis objects", {
        userId,
        analysisId: currentAnalysisId,
        count: objects.length,
      });

      const filesForAnalysis: AnalysisResultFileEntry[] = [];

      for (const object of objects) {
        const parsed = parseAnalysisResultKey(object, {
          userId,
          analysisId: currentAnalysisId,
        });
        if (parsed) {
          filesForAnalysis.push(parsed);
        }
      }

      return filesForAnalysis;
    }),
  );

  const collectedFiles = analysisEntries.flat();

  collectedFiles.sort((a, b) =>
    compareByTimestampThenKey(a.lastModified, b.lastModified, a.key, b.key),
  );

  return {
    files: collectedFiles,
    analyses: buildSummaries(collectedFiles),
    hasMore,
  };
}

async function resolveUserIds(expected?: string): Promise<string[]> {
  if (expected) {
    const exists = await userExists(expected);
    return exists ? [expected] : [];
  }

  return discoverDirectChildren(ANALYSIS_ROOT_PREFIX);
}

async function userExists(userId: string): Promise<boolean> {
  const userPrefix = buildUserPrefix(userId);
  const { commonPrefixes, objects } = await s3Client.listObjects({
    prefix: userPrefix,
    delimiter: "/",
    maxKeys: 1,
  });

  if (objects.length > 0) {
    return true;
  }

  return commonPrefixes.length > 0;
}

async function listAllCommonPrefixes(
  prefix: string,
  desiredCount?: number,
): Promise<string[]> {
  const prefixes: string[] = [];
  let continuationToken: string | undefined;
  const maxKeys = desiredCount ? 1000 : undefined;

  do {
    const { commonPrefixes, nextContinuationToken } =
      await s3Client.listObjects({
        prefix,
        delimiter: "/",
        continuationToken,
        maxKeys,
      });

    for (const entry of commonPrefixes ?? []) {
      prefixes.push(entry.fullPrefix);
    }

    continuationToken = nextContinuationToken;
  } while (continuationToken);

  analysisLogger.info("Collected common prefixes", {
    prefix,
    count: prefixes.length,
    first: prefixes[0] ?? null,
    last: prefixes[prefixes.length - 1] ?? null,
  });

  return prefixes;
}

async function discoverDirectChildren(
  basePrefix: string,
  desiredCount?: number,
): Promise<string[]> {
  // CommonPrefixes が正しく得られるケースでは最もコストが低いのでまず試す。
  const normalizedBase = ensureTrailingSlash(basePrefix);
  const commonPrefixes = await listAllCommonPrefixes(
    normalizedBase,
    desiredCount,
  );

  const childCandidates = commonPrefixes
    .map((fullPrefix) => extractDirectChild(fullPrefix, normalizedBase))
    .filter((value): value is string => Boolean(value));

  if (childCandidates.length > 0) {
    // CommonPrefixes から取得できた場合は数値降順で上位だけを返す。
    return selectTopAnalysisIds(childCandidates, desiredCount);
  }

  const scanned = await scanChildrenFromObjects(normalizedBase);
  return selectTopAnalysisIds(scanned, desiredCount);
}

async function scanChildrenFromObjects(basePrefix: string): Promise<string[]> {
  // CommonPrefixes が空あるいは親プレフィックスしか返さない場合、実際のオブジェクトキーから直下ディレクトリを推定する。
  const normalizedBase = ensureTrailingSlash(basePrefix);
  const discovered = new Set<string>();
  const ordered: string[] = [];

  let continuationToken: string | undefined;
  let page = 0;
  do {
    const { objects, nextContinuationToken } = await s3Client.listObjects({
      prefix: normalizedBase,
      maxKeys: 1000,
      continuationToken,
    });

    for (const object of objects) {
      // 各オブジェクトのキーから親ディレクトリ直下のセグメントだけを抜き出す。
      const child = extractFirstPathSegment(object.fullKey, normalizedBase);
      if (child) {
        if (!discovered.has(child)) {
          discovered.add(child);
          ordered.push(child);
        }
      }
    }

    continuationToken = nextContinuationToken;
    page += 1;
  } while (continuationToken);

  analysisLogger.info("Common prefixes fallback engaged", {
    basePrefix: normalizedBase,
    discovered: ordered,
    pageCount: page,
    note: "CommonPrefixes returned only the parent prefix",
  });

  return ordered;
}

function parseAnalysisResultKey(
  object: S3ObjectSummary,
  filters: { userId?: string; analysisId?: string },
): AnalysisResultFileEntry | null {
  const normalizedKey = object.fullKey.replace(/^\/+/u, "");
  if (!normalizedKey.startsWith(ANALYSIS_ROOT_PREFIX)) {
    return null;
  }

  const relativeToRoot = normalizedKey.slice(ANALYSIS_ROOT_PREFIX.length);
  const segments = relativeToRoot
    .split("/")
    .filter((segment) => segment.length > 0);

  if (segments.length < 1 + ANALYSIS_SEGMENTS.length + 1) {
    return null;
  }

  const [userId, ...rest] = segments;
  if (filters.userId && filters.userId !== userId) {
    return null;
  }

  if (!matchesSegments(rest, ANALYSIS_SEGMENTS)) {
    return null;
  }

  const analysisId = rest[ANALYSIS_SEGMENTS.length];
  if (
    !analysisId ||
    (filters.analysisId && filters.analysisId !== analysisId)
  ) {
    return null;
  }

  const pathSegments = rest.slice(ANALYSIS_SEGMENTS.length + 1);
  if (pathSegments.length === 0) {
    return null;
  }

  const relativePath = pathSegments.join("/");
  const fileName = pathSegments[pathSegments.length - 1];
  const analysisPrefix = buildPrefix({ userId, analysisId });

  return {
    userId,
    analysisId,
    fileName,
    relativePath,
    key: object.fullKey,
    analysisPrefix,
    size: object.size,
    lastModified: object.lastModified,
  };
}

function buildSummaries(
  files: AnalysisResultFileEntry[],
): AnalysisResultSummary[] {
  const map = new Map<string, AnalysisResultSummary>();

  for (const file of files) {
    const key = `${file.userId}::${file.analysisId}`;
    const current = map.get(key);
    const size = file.size ?? 0;

    if (current) {
      current.fileCount += 1;
      current.totalSize += size;
      if (
        file.lastModified &&
        (!current.lastModified || file.lastModified > current.lastModified)
      ) {
        current.lastModified = file.lastModified;
      }
    } else {
      map.set(key, {
        userId: file.userId,
        analysisId: file.analysisId,
        prefix: file.analysisPrefix,
        fileCount: 1,
        totalSize: size,
        lastModified: file.lastModified,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    compareByTimestampThenKey(
      a.lastModified,
      b.lastModified,
      a.prefix,
      b.prefix,
    ),
  );
}

function matchesSegments(target: string[], segments: string[]): boolean {
  if (target.length < segments.length + 1) {
    return false;
  }
  for (let index = 0; index < segments.length; index += 1) {
    if (target[index] !== segments[index]) {
      return false;
    }
  }
  return true;
}

function buildPrefix({
  userId,
  analysisId,
}: {
  userId?: string;
  analysisId?: string;
}): string {
  if (!userId) {
    return ANALYSIS_ROOT_PREFIX;
  }

  const parts = [ANALYSIS_BASE_PREFIX, userId, ...ANALYSIS_SEGMENTS];
  if (analysisId) {
    parts.push(analysisId);
  }
  return ensureTrailingSlash(parts.join("/"));
}

function buildUserPrefix(userId: string): string {
  return ensureTrailingSlash(`${ANALYSIS_BASE_PREFIX}/${userId}`);
}

function buildAnalysisBasePrefix(userId: string): string {
  return ensureTrailingSlash(
    `${ANALYSIS_BASE_PREFIX}/${userId}/${ANALYSIS_SEGMENTS.join("/")}`,
  );
}

function extractDirectChild(
  fullPrefix: string,
  parentPrefix: string,
): string | null {
  const normalizedParent = parentPrefix.replace(/\/+$/u, "");
  if (!fullPrefix.startsWith(normalizedParent)) {
    return null;
  }

  let remainder = fullPrefix.slice(normalizedParent.length);
  remainder = remainder.replace(/^\/+/, "").replace(/\/+$/u, "");
  if (!remainder || remainder.includes("/")) {
    return null;
  }

  return remainder;
}

function extractFirstPathSegment(
  fullKey: string,
  parentPrefix: string,
): string | null {
  // listObjects で取得したフルキーから、親プレフィックス直下のセグメントを取り出す。
  if (!fullKey.startsWith(parentPrefix)) {
    return null;
  }

  const remainder = fullKey.slice(parentPrefix.length);
  if (!remainder) {
    return null;
  }

  const [firstSegment] = remainder.split("/");
  if (!firstSegment || firstSegment.length === 0) {
    return null;
  }

  return firstSegment;
}

function sortAnalysisIdsDescending(values: Iterable<string>): string[] {
  return Array.from(values)
    .filter((value) => value && value.length > 0)
    .sort((a, b) => {
      const numA = Number.parseInt(a, 10);
      const numB = Number.parseInt(b, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
        return numB - numA;
      }
      return b.localeCompare(a, "ja");
    });
}

function selectTopAnalysisIds(
  values: Iterable<string>,
  limit?: number,
): string[] {
  const unique = Array.from(new Set(values));
  const sorted = sortAnalysisIdsDescending(unique);
  if (limit && limit > 0) {
    return sorted.slice(0, limit);
  }
  return sorted;
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

function compareByTimestampThenKey(
  aTimestamp: string | undefined,
  bTimestamp: string | undefined,
  aKey: string,
  bKey: string,
): number {
  const aTime = aTimestamp ? Date.parse(aTimestamp) : Number.NaN;
  const bTime = bTimestamp ? Date.parse(bTimestamp) : Number.NaN;

  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);

  if (aValid && bValid && aTime !== bTime) {
    return bTime - aTime;
  }

  if (aValid && !bValid) {
    return -1;
  }

  if (!aValid && bValid) {
    return 1;
  }

  return aKey.localeCompare(bKey, "ja");
}
