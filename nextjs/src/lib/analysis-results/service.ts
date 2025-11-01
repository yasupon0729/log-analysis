import {
  ANALYSIS_BASE_PREFIX,
  ANALYSIS_DEFAULT_TYPE_SEGMENT,
  ANALYSIS_PATH_BASE_SEGMENTS,
  ANALYSIS_ROOT_PREFIX,
  ensureTrailingSlash,
  normalizePrefix,
} from "@/app/api/analysis-results/common";
import { logger } from "@/lib/logger/server";
import type { S3Client } from "@/lib/s3/client";
import type { S3ObjectSummary } from "@/lib/s3/types";

const analysisLogger = logger.child({ component: "analysis-result-service" });

export interface AnalysisResultFileEntry {
  userId: string;
  analysisType: string;
  analysisId: string;
  fileName: string;
  relativePath: string;
  key: string;
  analysisPrefix: string;
  size?: number;
  lastModified?: string;
}

export interface AnalysisResultSummary {
  userId: string;
  analysisType: string;
  analysisId: string;
  prefix: string;
  fileCount: number;
  totalSize: number;
  lastModified?: string;
}

export interface AnalysisCollectionParams {
  userId?: string;
  analysisId?: string;
  analysisType?: string;
  page: number;
  pageSize: number;
}

export interface AnalysisCollectionResult {
  files: AnalysisResultFileEntry[];
  analyses: AnalysisResultSummary[];
  hasMore: boolean;
  totalAnalyses: number;
}

export interface AnalysisTimelinePoint {
  date: string;
  analysisCount: number;
  fileCount: number;
  totalSize: number;
}

export interface ModelUsageEntry {
  model: string;
  count: number;
}

export interface CollectAnalysisDependencies {
  resolveUserIds(expected?: string): Promise<string[]>;
  resolveAnalysisIdsFromDatabase(
    userId: string,
    desiredCount?: number,
  ): Promise<string[]>;
}

const METADATA_FILENAME_PRIORITY = [
  "metadata.json",
  "analysis.json",
  "manifest.json",
  "model.json",
  "summary.json",
];

const METADATA_FILENAME_KEYWORDS = ["meta", "analysis", "model", "info"];

const MODEL_NAME_KEYS = new Set([
  "model",
  "modelname",
  "model_name",
  "modeltype",
  "model_type",
  "engine",
  "engine_name",
  "ai_model",
  "aiModel",
  "modelVersion",
  "model_version",
  "llm",
  "provider_model",
  "providerModel",
]);

const MODEL_COLLECTION_LIMIT = 20;

export async function collectAnalysisData(
  s3Client: S3Client,
  params: AnalysisCollectionParams,
  dependencies: CollectAnalysisDependencies,
): Promise<AnalysisCollectionResult> {
  const { userId } = params;
  if (!userId) {
    return {
      files: [],
      analyses: [],
      hasMore: false,
      totalAnalyses: 0,
    };
  }

  const normalizedAnalysisType = normalizeAnalysisTypeParam(
    params.analysisType,
  );
  const resolvedAnalysisType =
    normalizedAnalysisType ?? ANALYSIS_DEFAULT_TYPE_SEGMENT;

  const availableUsers = await dependencies.resolveUserIds(userId);
  if (!availableUsers.includes(userId)) {
    analysisLogger.warn("Requested user not found", { userId });
    return {
      files: [],
      analyses: [],
      hasMore: false,
      totalAnalyses: 0,
    };
  }

  const desiredCount = params.analysisId
    ? 1
    : params.pageSize * params.page + 1;
  const rawAnalysisIds = params.analysisId
    ? [params.analysisId]
    : await dependencies.resolveAnalysisIdsFromDatabase(userId, desiredCount);

  const sortedAnalysisIds = sortAnalysisIdsDescending(rawAnalysisIds);

  let hasMore = false;
  let targetAnalysisIds = sortedAnalysisIds;

  if (!params.analysisId) {
    const startIndex = (params.page - 1) * params.pageSize;
    targetAnalysisIds = sortedAnalysisIds.slice(
      startIndex,
      startIndex + params.pageSize,
    );
    hasMore = sortedAnalysisIds.length > params.page * params.pageSize;
  }

  analysisLogger.info("Resolved target analysis IDs", {
    userId,
    analysisId: params.analysisId,
    analysisTypeFilter: normalizedAnalysisType ?? null,
    resolvedAnalysisType,
    page: params.page,
    pageSize: params.pageSize,
    candidateCount: sortedAnalysisIds.length,
    targetAnalysisIds,
    hasMore,
  });

  const analysisEntries = await Promise.all(
    targetAnalysisIds.map(async (currentAnalysisId) => {
      const analysisStartedAt = Date.now();
      const analysisPrefix = buildAnalysisPrefix({
        userId,
        analysisType: resolvedAnalysisType,
        analysisId: currentAnalysisId,
      });

      analysisLogger.info("Listing analysis objects", {
        userId,
        analysisId: currentAnalysisId,
        analysisType: resolvedAnalysisType,
        analysisPrefix,
      });

      const objects = await listAllObjects(s3Client, analysisPrefix);
      analysisLogger.info("Fetched analysis objects", {
        userId,
        analysisId: currentAnalysisId,
        analysisType: resolvedAnalysisType,
        count: objects.length,
        durationMs: Date.now() - analysisStartedAt,
      });

      const filesForAnalysis: AnalysisResultFileEntry[] = [];

      for (const object of objects) {
        const parsed = parseAnalysisResultKey(object, {
          userId,
          analysisId: currentAnalysisId,
          analysisType: normalizedAnalysisType,
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

  analysisLogger.debug("Collect analysis data summary", {
    userId,
    analysisId: params.analysisId,
    analysisType: resolvedAnalysisType,
    totalFiles: collectedFiles.length,
    analysisCount: targetAnalysisIds.length,
  });

  return {
    files: collectedFiles,
    analyses: buildSummaries(collectedFiles),
    hasMore,
    totalAnalyses: sortedAnalysisIds.length,
  };
}

export function buildAnalysisPrefix({
  userId,
  analysisType,
  analysisId,
}: {
  userId?: string;
  analysisType?: string;
  analysisId?: string;
}): string {
  if (!userId) {
    return ANALYSIS_ROOT_PREFIX;
  }

  const resolvedType = resolveAnalysisTypeSegment(analysisType);
  const parts = [
    ANALYSIS_BASE_PREFIX,
    userId,
    ...ANALYSIS_PATH_BASE_SEGMENTS,
    resolvedType,
  ];
  if (analysisId) {
    parts.push(analysisId);
  }
  return ensureTrailingSlash(parts.join("/"));
}

export function normalizeAnalysisTypeParam(
  value?: string | null,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveAnalysisTypeSegment(value?: string | null): string {
  return normalizeAnalysisTypeParam(value) ?? ANALYSIS_DEFAULT_TYPE_SEGMENT;
}

export function sortAnalysisIdsDescending(values: Iterable<string>): string[] {
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

export function compareByTimestampThenKey(
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

export function buildSummaries(
  files: AnalysisResultFileEntry[],
): AnalysisResultSummary[] {
  const map = new Map<string, AnalysisResultSummary>();

  for (const file of files) {
    const key = `${file.userId}::${file.analysisType}::${file.analysisId}`;
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
        analysisType: file.analysisType,
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

export async function listAllObjects(
  s3Client: S3Client,
  prefix: string,
): Promise<S3ObjectSummary[]> {
  const results: S3ObjectSummary[] = [];
  let continuationToken: string | undefined;
  const normalizedPrefix = normalizePrefix(prefix) ?? "";
  const resolvedPrefix = normalizedPrefix
    ? ensureTrailingSlash(normalizedPrefix)
    : undefined;

  do {
    const { objects, nextContinuationToken } = await s3Client.listObjects({
      prefix: resolvedPrefix,
      continuationToken,
    });

    for (const object of objects) {
      if (!object.fullKey || object.fullKey.endsWith("/")) {
        continue;
      }
      results.push(object);
    }

    continuationToken = nextContinuationToken;
  } while (continuationToken);

  return results;
}

export function buildTimeline(
  summaries: AnalysisResultSummary[],
): AnalysisTimelinePoint[] {
  const timeline = new Map<string, AnalysisTimelinePoint>();

  for (const summary of summaries) {
    if (!summary.lastModified) {
      continue;
    }

    const timestamp = Date.parse(summary.lastModified);
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const dateKey = new Date(timestamp).toISOString().slice(0, 10);
    const current = timeline.get(dateKey);
    if (current) {
      current.analysisCount += 1;
      current.fileCount += summary.fileCount;
      current.totalSize += summary.totalSize;
    } else {
      timeline.set(dateKey, {
        date: dateKey,
        analysisCount: 1,
        fileCount: summary.fileCount,
        totalSize: summary.totalSize,
      });
    }
  }

  return Array.from(timeline.values()).sort((a, b) =>
    a.date.localeCompare(b.date, "ja"),
  );
}

export async function collectModelUsage(
  s3Client: S3Client,
  summaries: AnalysisResultSummary[],
  files: AnalysisResultFileEntry[],
  options: { maxAnalyses?: number } = {},
): Promise<ModelUsageEntry[]> {
  const maxAnalyses = options.maxAnalyses ?? MODEL_COLLECTION_LIMIT;
  if (!summaries.length) {
    return [];
  }

  const filesByAnalysis = groupFilesByAnalysis(files);
  const sortedSummaries = [...summaries].sort((a, b) =>
    compareByTimestampThenKey(
      a.lastModified,
      b.lastModified,
      a.prefix,
      b.prefix,
    ),
  );

  const targetSummaries = sortedSummaries.slice(0, maxAnalyses);
  const modelMap = new Map<string, Set<string>>();

  for (const summary of targetSummaries) {
    const entries = filesByAnalysis.get(summary.analysisId) ?? [];
    const metadataFile = pickMetadataFile(entries);
    if (!metadataFile) {
      registerModel(modelMap, "unknown", summary.analysisId);
      continue;
    }

    try {
      const { body } = await s3Client.getObject({ key: metadataFile.key });
      const text = body.toString("utf8");
      const parsed = JSON.parse(text) as unknown;
      const models = extractModelNames(parsed);
      if (models.length === 0) {
        registerModel(modelMap, "unknown", summary.analysisId);
      } else {
        for (const model of models) {
          registerModel(modelMap, model, summary.analysisId);
        }
      }
    } catch (error) {
      analysisLogger.error("Failed to collect model info", {
        analysisId: summary.analysisId,
        userId: summary.userId,
        error,
      });
      registerModel(modelMap, "unknown", summary.analysisId);
    }
  }

  return Array.from(modelMap.entries())
    .map(([model, analysisIds]) => ({ model, count: analysisIds.size }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model, "ja"));
}

function groupFilesByAnalysis(
  files: AnalysisResultFileEntry[],
): Map<string, AnalysisResultFileEntry[]> {
  const map = new Map<string, AnalysisResultFileEntry[]>();
  for (const file of files) {
    const existing = map.get(file.analysisId);
    if (existing) {
      existing.push(file);
    } else {
      map.set(file.analysisId, [file]);
    }
  }
  return map;
}

function pickMetadataFile(
  files: AnalysisResultFileEntry[],
): AnalysisResultFileEntry | null {
  if (!files.length) {
    return null;
  }

  const jsonFiles = files.filter((file) => file.fileName.endsWith(".json"));
  if (!jsonFiles.length) {
    return null;
  }

  jsonFiles.sort((a, b) => {
    const aIndex = METADATA_FILENAME_PRIORITY.indexOf(a.fileName.toLowerCase());
    const bIndex = METADATA_FILENAME_PRIORITY.indexOf(b.fileName.toLowerCase());
    if (aIndex !== -1 || bIndex !== -1) {
      return rankValue(aIndex) - rankValue(bIndex);
    }

    const aKeyword = containsKeyword(a.fileName);
    const bKeyword = containsKeyword(b.fileName);
    if (aKeyword || bKeyword) {
      if (aKeyword && !bKeyword) {
        return -1;
      }
      if (!aKeyword && bKeyword) {
        return 1;
      }
    }

    return compareByTimestampThenKey(
      a.lastModified,
      b.lastModified,
      a.key,
      b.key,
    );
  });

  return jsonFiles[0] ?? null;
}

function rankValue(index: number): number {
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function containsKeyword(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return METADATA_FILENAME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function extractModelNames(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const results = new Set<string>();
  const visited = new Set<unknown>();
  const queue: unknown[] = [payload];

  while (queue.length > 0 && results.size < 25) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    for (const [key, value] of Object.entries(
      current as Record<string, unknown>,
    )) {
      const normalisedKey = key.toLowerCase();
      if (MODEL_NAME_KEYS.has(normalisedKey) && typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          results.add(trimmed);
        }
      } else if (MODEL_NAME_KEYS.has(normalisedKey) && Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === "string" && entry.trim()) {
            results.add(entry.trim());
          }
        }
      }

      if (typeof value === "object" && value) {
        queue.push(value);
      }
    }
  }

  return Array.from(results);
}

function registerModel(
  modelMap: Map<string, Set<string>>,
  model: string,
  analysisId: string,
): void {
  const key = model || "unknown";
  const existing = modelMap.get(key);
  if (existing) {
    existing.add(analysisId);
  } else {
    modelMap.set(key, new Set([analysisId]));
  }
}

function parseAnalysisResultKey(
  object: S3ObjectSummary,
  filters: { userId?: string; analysisId?: string; analysisType?: string },
): AnalysisResultFileEntry | null {
  const normalizedKey = object.fullKey.replace(/^\/+/u, "");
  if (!normalizedKey.startsWith(ANALYSIS_ROOT_PREFIX)) {
    return null;
  }

  const relativeToRoot = normalizedKey.slice(ANALYSIS_ROOT_PREFIX.length);
  const segments = relativeToRoot
    .split("/")
    .filter((segment) => segment.length > 0);

  const minimumSegments =
    1 + ANALYSIS_PATH_BASE_SEGMENTS.length + 2; /* analysisType + analysisId */

  if (segments.length < minimumSegments) {
    return null;
  }

  const [userId, ...rest] = segments;
  if (filters.userId && filters.userId !== userId) {
    return null;
  }

  if (!matchesSegments(rest, ANALYSIS_PATH_BASE_SEGMENTS)) {
    return null;
  }

  const typeIndex = ANALYSIS_PATH_BASE_SEGMENTS.length;
  const analysisType = rest[typeIndex]?.toLowerCase();
  if (!analysisType) {
    return null;
  }

  if (filters.analysisType && filters.analysisType !== analysisType) {
    return null;
  }

  const analysisId = rest[typeIndex + 1];
  if (
    !analysisId ||
    (filters.analysisId && filters.analysisId !== analysisId)
  ) {
    return null;
  }

  const pathSegments = rest.slice(typeIndex + 2);
  if (pathSegments.length === 0) {
    return null;
  }

  const relativePath = pathSegments.join("/");
  const fileName = pathSegments[pathSegments.length - 1];
  const analysisPrefix = buildAnalysisPrefix({
    userId,
    analysisType,
    analysisId,
  });

  return {
    userId,
    analysisType,
    analysisId,
    fileName,
    relativePath,
    key: object.fullKey,
    analysisPrefix,
    size: object.size,
    lastModified: object.lastModified,
  };
}

function matchesSegments(target: string[], segments: string[]): boolean {
  if (target.length < segments.length) {
    return false;
  }
  for (let index = 0; index < segments.length; index += 1) {
    if (target[index] !== segments[index]) {
      return false;
    }
  }
  return true;
}
