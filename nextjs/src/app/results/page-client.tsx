"use client";

/**
 * 解析結果ブラウザーのクライアント側実装。
 * MySQL から解析メタデータを取得して Tanstack Table に流し込み、
 * ユーザー ID / 解析 ID のフィルタとモーダルによる画像プレビューを提供する。
 * プレビュー画像は download_link から導出した S3 プレフィックスを基にオンデマンド取得する。
 */

import type { ColumnDef, Row } from "@tanstack/react-table";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import TanstackTable from "@/components/tanstack-table/TanstackTable";
import type {
  CustomColumnMeta,
  FilterOption,
} from "@/components/tanstack-table/types";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import {
  type DerivedAnalysisIdentifiers,
  deriveAnalysisIdentifiersFromDownloadLink,
} from "@/lib/analysis-results/download-link";
import { logger } from "@/lib/logger/client";
import { isJudgeImageUser } from "@/lib/users/config";
import { css } from "@/styled-system/css";

interface AnalysisResultRow {
  analysisDataId: number;
  userId: string;
  imageAnalysisId: string | null;
  sentAt: string;
  sentStatus: number;
  analysisStatus: string | null;
  analysisType: string;
  completedCount: number;
  analyzerName: string | null;
  downloadLink: string | null;
  imageAnalysisTitle: string | null;
  aiModelName: string | null;
  aiModelCode: string | null;
  companyName: string | null;
  username: string | null;
  userEmail: string | null;
}

interface MysqlAnalysisResultsSuccessResponse {
  ok: true;
  rows: AnalysisResultRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
  filters: {
    users: string[];
    analysisIds: string[];
  };
}

interface MysqlAnalysisResultsErrorResponse {
  ok: false;
  error: string;
}

type MysqlAnalysisResultsResponse =
  | MysqlAnalysisResultsSuccessResponse
  | MysqlAnalysisResultsErrorResponse;

interface AnalysisResultFileEntry {
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

interface AnalysisResultSummary {
  userId: string;
  analysisType: string;
  analysisId: string;
  prefix: string;
  fileCount: number;
  totalSize: number;
  lastModified?: string;
}

interface InlineImageSource {
  dataUrl: string;
  sourceName: string;
}

interface AnalysisImagePair {
  key: string;
  directory: string;
  origin?: AnalysisResultFileEntry;
  segmentation?: AnalysisResultFileEntry;
  originInline?: InlineImageSource;
  segmentationInline?: InlineImageSource;
  lastModified?: string;
}

interface AnalysisPreviewCell {
  key: string;
  label: string;
  file?: AnalysisResultFileEntry;
  inlineImage?: InlineImageSource;
}

interface AnalysisPreviewRow {
  key: string;
  cells: AnalysisPreviewCell[];
}

interface AnalysisPreviewSection {
  key: string;
  title: string;
  rows: AnalysisPreviewRow[];
  description?: string;
}

interface JudgeImageEvaluationState {
  originalImageUrl: string;
  maskImageUrl: string;
  point: number | null;
  isExcel: boolean;
  updatedAt: string;
}

interface JudgeImageTarget {
  id: string;
  analysisId: string;
  originalImageUrl: string;
  maskImageUrl: string;
  isExcel: boolean;
  sectionKey: string;
  rowKey: string;
  originalLabel: string;
  maskLabel?: string;
}

interface PreviewContext {
  analysisId: string;
  analysisType: string;
  userId: string;
}

interface S3AnalysisResultsSuccessResponse {
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

interface S3AnalysisResultsErrorResponse {
  ok: false;
  error: string;
}

type S3AnalysisResultsResponse =
  | S3AnalysisResultsSuccessResponse
  | S3AnalysisResultsErrorResponse;

interface FallbackPreviewPairResponse {
  key: string;
  workbookName: string;
  originDataUrl: string;
  segmentationDataUrl: string;
}

interface FallbackPreviewSuccessResponse {
  ok: true;
  pairs: FallbackPreviewPairResponse[];
}

interface FallbackPreviewErrorResponse {
  ok: false;
  error: string;
}

type FallbackPreviewResponse =
  | FallbackPreviewSuccessResponse
  | FallbackPreviewErrorResponse;

interface ArchivePreviewItemResponse {
  key: string;
  fileName: string;
  path: string;
  dataUrl: string;
}

interface ArchivePreviewSuccessResponse {
  ok: true;
  items: ArchivePreviewItemResponse[];
}

interface ArchivePreviewErrorResponse {
  ok: false;
  error: string;
}

type ArchivePreviewResponse =
  | ArchivePreviewSuccessResponse
  | ArchivePreviewErrorResponse;

const API_FETCH_PAGE_SIZE = 100;
const MAX_FETCH_PAGES = 1000;
const ROOT_USER_ID = "1";

const IMAGE_DIRECTORY_CANDIDATES = ["original_images", "oriinal_images"];
const IMAGE_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

export default function ResultsPageClient({
  currentUserId,
}: {
  currentUserId: string | null;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const defaultUserId = "";
  const userIdParam = searchParams.get("userId") ?? defaultUserId;
  const analysisIdParam = searchParams.get("analysisId") ?? "";
  // DB から取得した解析結果一覧と各種 UI ステートを管理する。
  const [rows, setRows] = useState<AnalysisResultRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>(userIdParam);
  const [selectedAnalysisId, setSelectedAnalysisId] =
    useState<string>(analysisIdParam);
  const [rowCount, setRowCount] = useState(0);
  const [showNonRootOnly, setShowNonRootOnly] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [shouldAutoOpenModal, setShouldAutoOpenModal] = useState(false);
  const [previewSections, setPreviewSections] = useState<
    AnalysisPreviewSection[]
  >([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeDownloads, setActiveDownloads] = useState<Set<string>>(
    () => new Set(),
  );
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [isHydrating, setIsHydrating] = useState(false);
  const [previewContext, setPreviewContext] = useState<PreviewContext | null>(
    null,
  );
  const [judgeEvaluations, setJudgeEvaluations] = useState<
    Map<string, JudgeImageEvaluationState>
  >(new Map());
  const [judgeMessage, setJudgeMessage] = useState<string | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [judgeLoadingKeys, setJudgeLoadingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [isEvaluating, startJudgeTransition] = useTransition();
  const initialFetchAbortRef = useRef<AbortController | null>(null);
  const hydrationAbortRef = useRef<AbortController | null>(null);
  const modalTitleId = useId();
  const previewCacheKeyRef = useRef<string | null>(null);
  const previousSearchParamsRef = useRef<string | null>(null);

  const updateUrl = useCallback(
    (
      nextUserId: string,
      nextAnalysisId: string,
      options: { rememberCurrent?: boolean } = {},
    ) => {
      if (options.rememberCurrent && typeof window !== "undefined") {
        previousSearchParamsRef.current = window.location.search.slice(1);
      }

      const params = new URLSearchParams();
      if (nextUserId) {
        params.set("userId", nextUserId);
      }
      if (nextAnalysisId) {
        params.set("analysisId", nextAnalysisId);
      }

      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  const setDownloadActive = useCallback((key: string, isActive: boolean) => {
    setActiveDownloads((previous) => {
      const next = new Set(previous);
      if (isActive) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const restoreUrl = useCallback(() => {
    const previous = previousSearchParamsRef.current;
    previousSearchParamsRef.current = null;
    if (previous === null) {
      router.replace(pathname, { scroll: false });
      return;
    }
    router.replace(`${pathname}${previous ? `?${previous}` : ""}`, {
      scroll: false,
    });
  }, [pathname, router]);

  const handleDownload = useCallback(
    async (row: AnalysisResultRow, variant: "images" | "all") => {
      const downloadKey = row.downloadLink;
      if (!downloadKey) {
        window.alert("ダウンロードリンクが存在しません。");
        return;
      }

      const stateKey = `${variant}-${row.analysisDataId}`;
      if (activeDownloads.has(stateKey)) {
        return;
      }

      setDownloadActive(stateKey, true);

      const params = new URLSearchParams();
      params.set("key", downloadKey);

      const endpoint =
        variant === "images"
          ? `/api/analysis-results/images?${params.toString()}`
          : `/api/analysis-results/all-download?${params.toString()}`;

      try {
        const response = await fetch(endpoint, { method: "GET" });
        const contentType = response.headers.get("Content-Type") ?? "";

        if (response.ok && contentType.includes("application/zip")) {
          const blob = await response.blob();
          const disposition = response.headers.get("Content-Disposition");
          const fallbackName = buildFallbackZipName(row, variant);
          const fileName =
            parseFilenameFromDisposition(disposition) ?? fallbackName;

          triggerBrowserDownload(blob, fileName);

          logger.info("Analysis download triggered", {
            component: "ResultsPageClient",
            variant,
            analysisDataId: row.analysisDataId,
            analysisId: row.imageAnalysisId ?? null,
            userId: row.userId,
            endpoint,
            fileName,
            status: response.status,
          });

          return;
        }

        let message =
          variant === "images"
            ? "画像フォルダのデータが見つかりません。"
            : "フォルダのデータが見つかりません。";

        if (contentType.includes("application/json")) {
          try {
            const data = (await response.json()) as {
              error?: string;
              message?: string;
            };
            message = data.message || data.error || message;
          } catch {
            // JSON の解析に失敗した場合は既定メッセージを使用
          }
        }

        window.alert(message);
        logger.warn("Analysis download returned non-zip response", {
          component: "ResultsPageClient",
          variant,
          analysisDataId: row.analysisDataId,
          analysisId: row.imageAnalysisId ?? null,
          userId: row.userId,
          endpoint,
          status: response.status,
          contentType,
        });
      } catch (downloadError) {
        const message =
          variant === "images"
            ? "画像のダウンロードに失敗しました。"
            : "フォルダのダウンロードに失敗しました。";
        window.alert(message);

        logger.error("Analysis download request threw", {
          component: "ResultsPageClient",
          variant,
          analysisDataId: row.analysisDataId,
          analysisId: row.imageAnalysisId ?? null,
          userId: row.userId,
          endpoint,
          error:
            downloadError instanceof Error
              ? downloadError.message
              : String(downloadError),
        });
      } finally {
        setDownloadActive(stateKey, false);
      }
    },
    [activeDownloads, setDownloadActive],
  );

  const hydrateRemaining = useCallback(
    async ({
      baseParamsString,
      startPage,
      initialRows,
      initialUsers,
      controller,
      expectedRowCount,
    }: {
      baseParamsString: string;
      startPage: number;
      initialRows: AnalysisResultRow[];
      initialUsers: Set<string>;
      controller: AbortController;
      expectedRowCount: number;
    }) => {
      const signal = controller.signal;
      let aggregatedRows = [...initialRows];
      const aggregatedUsers = new Set(initialUsers);
      let currentPage = startPage;
      let hasMore = true;

      while (hasMore && !signal.aborted) {
        try {
          const params = new URLSearchParams(baseParamsString);
          params.set("page", String(currentPage));
          params.set("pageSize", String(API_FETCH_PAGE_SIZE));
          const endpoint = `/api/mysql/analysis-results?${params.toString()}`;

          const response = await fetch(endpoint, {
            cache: "no-store",
            signal,
          });
          const data = (await response.json()) as MysqlAnalysisResultsResponse;

          if (!response.ok || !data.ok) {
            const message = data.ok
              ? `解析結果の取得に失敗しました (${response.status})`
              : data.error;
            logger.warn("Failed to load analysis results in background", {
              component: "ResultsPageClient",
              page: currentPage,
              status: response.status,
              error: message,
              userId: selectedUserId || null,
            });
            break;
          }

          if (data.filters?.users) {
            for (const user of data.filters.users) {
              aggregatedUsers.add(user);
            }
          }

          const pageRows = data.rows ?? [];
          aggregatedRows = aggregatedRows.concat(pageRows);

          const pagination = data.pagination;
          hasMore = pagination ? Boolean(pagination.hasMore) : false;

          logger.info("Fetched analysis page", {
            component: "ResultsPageClient",
            phase: "background",
            page: currentPage,
            received: pageRows.length,
            accumulated: aggregatedRows.length,
            userId: selectedUserId || null,
          });

          currentPage += 1;

          if (currentPage > MAX_FETCH_PAGES) {
            logger.warn("解析結果の取得が安全上限に達しました", {
              component: "ResultsPageClient",
              fetchedRows: aggregatedRows.length,
              maxFetchPages: MAX_FETCH_PAGES,
              pageSize: API_FETCH_PAGE_SIZE,
              userId: selectedUserId || null,
            });
            break;
          }
        } catch (backgroundError) {
          if (signal.aborted) {
            if (hydrationAbortRef.current === controller) {
              hydrationAbortRef.current = null;
            }
            return;
          }
          const message =
            backgroundError instanceof Error
              ? backgroundError.message
              : "解析結果の取得に失敗しました";
          logger.error("Analysis results background fetch threw", {
            component: "ResultsPageClient",
            error: message,
            page: currentPage,
            userId: selectedUserId || null,
          });
          break;
        }
      }

      if (signal.aborted) {
        if (hydrationAbortRef.current === controller) {
          hydrationAbortRef.current = null;
        }
        return;
      }

      const sortedUsers = Array.from(aggregatedUsers).sort((a, b) =>
        a.localeCompare(b, "ja"),
      );
      setRows(aggregatedRows);
      setRowCount(Math.max(expectedRowCount, aggregatedRows.length));
      setAvailableUsers(sortedUsers);

      if (selectedUserId && !aggregatedUsers.has(selectedUserId)) {
        setSelectedUserId("");
        setSelectedAnalysisId("");
        updateUrl("", "");
      }

      setIsHydrating(false);
      if (hydrationAbortRef.current === controller) {
        hydrationAbortRef.current = null;
      }
    },
    [selectedUserId, updateUrl],
  );

  const fetchData = useCallback(async () => {
    initialFetchAbortRef.current?.abort();
    hydrationAbortRef.current?.abort();
    hydrationAbortRef.current = null;
    setIsHydrating(false);

    const controller = new AbortController();
    initialFetchAbortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const baseParams = new URLSearchParams();
    if (selectedUserId) {
      baseParams.set("userId", selectedUserId);
    }
    const baseParamsString = baseParams.toString();

    const fetchPage = async (pageNumber: number, signal: AbortSignal) => {
      const params = new URLSearchParams(baseParamsString);
      params.set("page", String(pageNumber));
      params.set("pageSize", String(API_FETCH_PAGE_SIZE));
      const endpoint = `/api/mysql/analysis-results?${params.toString()}`;

      const response = await fetch(endpoint, { cache: "no-store", signal });
      const data = (await response.json()) as MysqlAnalysisResultsResponse;

      if (!response.ok || !data.ok) {
        const message = data.ok
          ? `解析結果の取得に失敗しました (${response.status})`
          : data.error;
        throw new Error(message);
      }

      const pageRows = data.rows ?? [];

      logger.info("Fetched analysis page", {
        component: "ResultsPageClient",
        phase: pageNumber === 1 ? "initial" : "foreground",
        page: pageNumber,
        received: pageRows.length,
        accumulated: pageRows.length,
        userId: selectedUserId || null,
      });

      return { data, pageRows };
    };

    try {
      const { data, pageRows } = await fetchPage(1, controller.signal);

      if (controller.signal.aborted) {
        return;
      }

      const usersFromFilters = (data.filters?.users ?? [])
        .map((user) => user.toString())
        .sort((a, b) => a.localeCompare(b, "ja"));
      setAvailableUsers(usersFromFilters);

      setRows(pageRows);
      setRowCount(data.pagination?.totalCount ?? pageRows.length);

      if (
        !hasLoadedOnce &&
        usersFromFilters.length > 0 &&
        selectedUserId &&
        !usersFromFilters.includes(selectedUserId)
      ) {
        const fallbackUser = usersFromFilters[0] ?? "";
        setSelectedUserId(fallbackUser);
        setSelectedAnalysisId("");
        updateUrl(fallbackUser, "");
      }

      const pagination = data.pagination;
      const hasMore = pagination ? Boolean(pagination.hasMore) : false;
      const expectedRowCount = data.pagination?.totalCount ?? pageRows.length;

      if (hasMore) {
        setIsHydrating(true);
        const backgroundController = new AbortController();
        hydrationAbortRef.current = backgroundController;
        void hydrateRemaining({
          baseParamsString,
          startPage: 2,
          initialRows: pageRows,
          initialUsers: new Set(usersFromFilters),
          controller: backgroundController,
          expectedRowCount,
        });
      } else {
        setIsHydrating(false);
      }

      setHasLoadedOnce(true);
    } catch (fetchError) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "解析結果の取得に失敗しました";
      setError(message);
      setRows([]);
      setRowCount(0);
      setIsHydrating(false);
      logger.error("Analysis results fetch threw", {
        component: "ResultsPageClient",
        error: message,
        userId: selectedUserId || null,
      });
      setHasLoadedOnce(true);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
      if (initialFetchAbortRef.current === controller) {
        initialFetchAbortRef.current = null;
      }
    }
  }, [hydrateRemaining, hasLoadedOnce, selectedUserId, updateUrl]);

  const filteredRows = useMemo(() => {
    if (!showNonRootOnly) {
      return rows;
    }
    return rows.filter((row) => row.userId !== ROOT_USER_ID);
  }, [rows, showNonRootOnly]);

  useEffect(() => {
    return () => {
      initialFetchAbortRef.current?.abort();
      hydrationAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    // 初回マウント／フィルタ条件変更時に最新状態を取得する。
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    // URL クエリの変化 (ブラウザ戻るなど) に追従してステートを同期する。
    setSelectedUserId((prev) => (prev === userIdParam ? prev : userIdParam));
    setSelectedAnalysisId((prev) =>
      prev === analysisIdParam ? prev : analysisIdParam,
    );
  }, [analysisIdParam, userIdParam]);

  useEffect(() => {
    if (selectedUserId === undefined) {
      return;
    }
    setShouldAutoOpenModal(false);
    setIsPreviewModalOpen(false);
  }, [selectedUserId]);

  useEffect(() => {
    if (!hasLoadedOnce) {
      return;
    }

    if (selectedUserId) {
      const hasUser = availableUsers.includes(selectedUserId);
      if (!hasUser && !isHydrating) {
        setSelectedUserId("");
        setSelectedAnalysisId("");
        return;
      }
    }

    if (selectedAnalysisId && !isHydrating) {
      const hasAnalysis = rows.some(
        (row) => row.imageAnalysisId === selectedAnalysisId,
      );
      if (!hasAnalysis) {
        setSelectedAnalysisId("");
      }
    }
  }, [
    availableUsers,
    hasLoadedOnce,
    isHydrating,
    rows,
    selectedAnalysisId,
    selectedUserId,
  ]);

  useEffect(() => {
    if (!showNonRootOnly) {
      return;
    }
    if (selectedUserId === ROOT_USER_ID) {
      setSelectedUserId("");
      setSelectedAnalysisId("");
      restoreUrl();
    }
  }, [restoreUrl, selectedUserId, showNonRootOnly]);

  const statusFilterOptions = useMemo<FilterOption[]>(() => {
    const source =
      filteredRows.length > 0 || !showNonRootOnly ? filteredRows : rows;
    const unique = new Set<string>();
    for (const row of source) {
      if (row.analysisStatus) {
        unique.add(row.analysisStatus);
      }
    }
    return Array.from(unique)
      .sort((a, b) => a.localeCompare(b, "ja"))
      .map((value) => ({ label: value, value }));
  }, [filteredRows, rows, showNonRootOnly]);

  const analysisTypeFilterOptions = useMemo<FilterOption[]>(() => {
    const source =
      filteredRows.length > 0 || !showNonRootOnly ? filteredRows : rows;
    const unique = new Set<string>();
    for (const row of source) {
      if (row.analysisType) {
        unique.add(row.analysisType);
      }
    }
    return Array.from(unique)
      .sort((a, b) => a.localeCompare(b, "ja"))
      .map((value) => ({ label: value, value }));
  }, [filteredRows, rows, showNonRootOnly]);

  const userOptions = useMemo<FilterOption[]>(() => {
    const source =
      filteredRows.length > 0 || !showNonRootOnly ? filteredRows : rows;
    const map = new Map<string, string | null>();
    for (const row of source) {
      if (!row.userId) {
        continue;
      }
      if (!map.has(row.userId)) {
        map.set(row.userId, row.companyName ?? null);
      }
    }
    return Array.from(map.entries())
      .map(([id, company]) => ({
        value: id,
        label: company ? `${id} (${company})` : id,
      }))
      .sort((a, b) => a.value.localeCompare(b.value, "ja"));
  }, [filteredRows, rows, showNonRootOnly]);

  const showEmptyState =
    hasLoadedOnce && !isLoading && !error && filteredRows.length === 0;

  const handleAnalysisRowClick = useCallback(
    (tableRow: Row<AnalysisResultRow>) => {
      const record = tableRow.original;
      if (!record || !record.imageAnalysisId) {
        logger.warn("解析IDが存在しないためプレビューを開けません", {
          component: "ResultsPageClient",
          analysisDataId: record?.analysisDataId ?? null,
        });
        return;
      }

      if (record.imageAnalysisId !== selectedAnalysisId) {
        setSelectedAnalysisId(record.imageAnalysisId);
      }

      updateUrl(selectedUserId, record.imageAnalysisId ?? "", {
        rememberCurrent: true,
      });
      setShouldAutoOpenModal(true);
    },
    [selectedAnalysisId, selectedUserId, updateUrl],
  );

  const selectedAnalysisRow = useMemo(() => {
    if (!selectedAnalysisId) {
      return null;
    }

    return (
      rows.find(
        (entry) =>
          entry.imageAnalysisId === selectedAnalysisId &&
          (!selectedUserId || entry.userId === selectedUserId),
      ) ?? null
    );
  }, [rows, selectedAnalysisId, selectedUserId]);

  const canJudge = useMemo(() => {
    if (!currentUserId) {
      return false;
    }
    if (!previewContext) {
      return false;
    }
    if (previewContext.analysisType !== "main") {
      return false;
    }
    return isJudgeImageUser(currentUserId);
  }, [currentUserId, previewContext]);

  useEffect(() => {
    const expectedKey = buildPreviewCacheKey({
      userId: selectedUserId,
      analysisId: selectedAnalysisId,
      analysisType: selectedAnalysisRow?.analysisType ?? null,
    });
    if (previewCacheKeyRef.current === expectedKey) {
      return;
    }
    previewCacheKeyRef.current = null;
    setPreviewSections([]);
    setPreviewError(null);
  }, [selectedAnalysisId, selectedAnalysisRow?.analysisType, selectedUserId]);

  const fetchFallbackSections = useCallback(
    async ({
      analysisId,
      downloadKey,
    }: {
      analysisId: string;
      downloadKey: string | null;
    }): Promise<{
      sections: AnalysisPreviewSection[] | null;
      error: string | null;
    }> => {
      if (!downloadKey) {
        return {
          sections: null,
          error: "プレビューに利用できるダウンロードリンクが見つかりません",
        };
      }

      try {
        const response = await fetch("/api/analysis-results/fallback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: downloadKey }),
        });
        const data = (await response.json()) as FallbackPreviewResponse;

        if (!response.ok || !data.ok) {
          const message = data.ok
            ? `プレビュー画像の取得に失敗しました (${response.status})`
            : data.error;
          logger.error("Failed to build fallback preview", {
            component: "ResultsPageClient",
            downloadKey,
            analysisId,
            status: response.status,
            error: message,
          });
          return { sections: null, error: message };
        }

        const derived = deriveAnalysisIdentifiersFromDownloadLink(downloadKey);
        const section = buildFallbackPreviewSection(analysisId, data.pairs, {
          workbookPrefix: derived?.prefix,
        });
        return { sections: [section], error: null };
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : "プレビュー画像の取得に失敗しました";
        logger.error("Fallback preview fetch threw", {
          component: "ResultsPageClient",
          downloadKey,
          analysisId,
          error: message,
        });
        return { sections: null, error: message };
      }
    },
    [],
  );

  const fetchArchivePreviewSection = useCallback(
    async ({
      analysisId,
      downloadKey,
    }: {
      analysisId: string;
      downloadKey: string | null;
    }): Promise<{
      section: AnalysisPreviewSection | null;
      error: string | null;
    }> => {
      if (!downloadKey) {
        return {
          section: null,
          error: "プレビューに利用できるダウンロードリンクが見つかりません",
        };
      }

      try {
        const response = await fetch("/api/analysis-results/archive-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: downloadKey }),
        });
        const data = (await response.json()) as ArchivePreviewResponse;

        if (!response.ok || !data.ok) {
          const message = data.ok
            ? `ZIP 内の画像取得に失敗しました (${response.status})`
            : data.error;
          logger.error("Failed to build archive preview", {
            component: "ResultsPageClient",
            downloadKey,
            analysisId,
            status: response.status,
            error: message,
          });
          return { section: null, error: message };
        }

        if (data.items.length === 0) {
          return { section: null, error: null };
        }

        const section = buildArchivePreviewSection(analysisId, data.items);
        return { section, error: null };
      } catch (archiveError) {
        const message =
          archiveError instanceof Error
            ? archiveError.message
            : "ZIP 内の画像取得に失敗しました";
        logger.error("Archive preview fetch threw", {
          component: "ResultsPageClient",
          downloadKey,
          analysisId,
          error: message,
        });
        return { section: null, error: message };
      }
    },
    [],
  );

  const currentPreviewAnalysisId = previewContext?.analysisId ?? null;
  const currentPreviewType = previewContext?.analysisType ?? null;
  const currentPreviewUserId = previewContext?.userId ?? null;

  const resetJudgeState = useCallback(() => {
    setJudgeMessage(null);
    setJudgeError(null);
    setJudgeEvaluations(new Map<string, JudgeImageEvaluationState>());
    setJudgeLoadingKeys(new Set<string>());
  }, []);

  useEffect(() => {
    if (!isPreviewModalOpen) {
      return;
    }
    if (!currentUserId) {
      return;
    }

    const selectedRow = selectedAnalysisRow ?? null;

    const run = async () => {
      if (!selectedRow) {
        setPreviewContext(null);
        resetJudgeState();
        setPreviewSections([]);
        setPreviewError(null);
        return;
      }

      const derived = deriveAnalysisIdentifiersFromDownloadLink(
        selectedRow.downloadLink,
      );
      const previewUserId = derived?.userId ?? selectedRow.userId;
      const previewAnalysisId =
        derived?.analysisId ?? selectedRow.imageAnalysisId ?? "";
      const fallbackAnalysisId =
        previewAnalysisId || String(selectedRow.analysisDataId ?? "");
      const analysisTypeSegment = resolvePreviewAnalysisTypeSegment(
        derived,
        selectedRow.analysisType,
      );

      if (!previewAnalysisId) {
        setPreviewContext(null);
        resetJudgeState();
        setPreviewSections([]);
        setPreviewError("プレビュー対象の解析IDを特定できませんでした。");
        return;
      }

      const contextChanged =
        currentPreviewAnalysisId !== previewAnalysisId ||
        currentPreviewUserId !== previewUserId ||
        currentPreviewType !== analysisTypeSegment;

      if (contextChanged) {
        resetJudgeState();
        setPreviewContext({
          analysisId: previewAnalysisId,
          analysisType: analysisTypeSegment,
          userId: previewUserId,
        });
      }

      const cacheKey = buildPreviewCacheKey({
        userId: previewUserId,
        analysisId: previewAnalysisId,
        analysisType: analysisTypeSegment,
      });
      if (
        previewCacheKeyRef.current === cacheKey &&
        previewSections.length > 0
      ) {
        return;
      }

      const params = new URLSearchParams();
      params.set("userId", previewUserId);
      params.set("analysisId", previewAnalysisId);
      params.set("limit", "500");
      if (analysisTypeSegment) {
        params.set("analysisType", analysisTypeSegment);
      }

      const endpoint = `/api/analysis-results?${params.toString()}`;

      setIsPreviewLoading(true);
      setPreviewError(null);
      previewCacheKeyRef.current = cacheKey;

      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const data = (await response.json()) as S3AnalysisResultsResponse;

        if (!response.ok || !data.ok) {
          const message = data.ok
            ? `プレビュー画像の取得に失敗しました (${response.status})`
            : data.error;
          setPreviewError(message);
          setPreviewSections([]);
          previewCacheKeyRef.current = null;
          logger.error("Failed to load analysis preview files", {
            component: "ResultsPageClient",
            endpoint,
            status: response.status,
            analysisId: previewAnalysisId,
            analysisType: analysisTypeSegment,
            userId: previewUserId,
            error: message,
          });
          return;
        }

        let sections: AnalysisPreviewSection[] = [];

        if (analysisTypeSegment === "recommend") {
          sections = buildRecommendPreviewSections(
            data.files,
            previewAnalysisId,
          );
        } else if (analysisTypeSegment === "screening") {
          sections = buildScreeningOriginalSections(
            data.files,
            previewAnalysisId,
          );
        } else {
          sections = buildMainPreviewSections(data.files, previewAnalysisId);
        }

        if (analysisTypeSegment === "screening") {
          const archiveResult = await fetchArchivePreviewSection({
            analysisId: previewAnalysisId,
            downloadKey: selectedRow.downloadLink ?? null,
          });
          if (archiveResult.error) {
            setPreviewError(archiveResult.error);
            setPreviewSections([]);
            previewCacheKeyRef.current = null;
            return;
          }
          if (archiveResult.section) {
            sections = sections.concat(archiveResult.section);
          }
        }

        if (sections.length === 0) {
          if (analysisTypeSegment === "main") {
            const fallbackResult = await fetchFallbackSections({
              analysisId: fallbackAnalysisId,
              downloadKey: selectedRow.downloadLink ?? null,
            });
            if (fallbackResult.error) {
              setPreviewError(fallbackResult.error);
              setPreviewSections([]);
              previewCacheKeyRef.current = null;
              return;
            }
            if (fallbackResult.sections) {
              setPreviewSections(fallbackResult.sections);
              setPreviewError(null);
              return;
            }
          }

          setPreviewSections([]);
          setPreviewError("プレビューに利用できる画像が見つかりませんでした。");
          previewCacheKeyRef.current = null;
          return;
        }

        setPreviewSections(sections);
        setPreviewError(null);
      } catch (previewFetchError) {
        const message =
          previewFetchError instanceof Error
            ? previewFetchError.message
            : "プレビュー画像の取得に失敗しました";
        setPreviewError(message);
        setPreviewSections([]);
        previewCacheKeyRef.current = null;
        logger.error("Analysis preview fetch threw", {
          component: "ResultsPageClient",
          endpoint,
          analysisId: previewAnalysisId,
          analysisType: analysisTypeSegment,
          userId: previewUserId,
          error: message,
        });
      } finally {
        setIsPreviewLoading(false);
      }
    };

    void run();
  }, [
    fetchArchivePreviewSection,
    fetchFallbackSections,
    isPreviewModalOpen,
    previewSections.length,
    resetJudgeState,
    selectedAnalysisRow,
    currentPreviewAnalysisId,
    currentPreviewType,
    currentPreviewUserId,
    currentUserId,
  ]);

  const previewImageCount = useMemo(() => {
    return previewSections.reduce((total, section) => {
      const sectionCount = section.rows.reduce(
        (accumulator, row) => accumulator + row.cells.length,
        0,
      );
      return total + sectionCount;
    }, 0);
  }, [previewSections]);

  const previewSectionSummaries = useMemo(() => {
    return previewSections.map((section) => {
      const count = section.rows.reduce(
        (accumulator, row) => accumulator + row.cells.length,
        0,
      );
      return `${section.title} (${count.toLocaleString("ja-JP")})`;
    });
  }, [previewSections]);

  const judgeTargets = useMemo(() => {
    if (!previewContext || previewContext.analysisType !== "main") {
      return [] as JudgeImageTarget[];
    }

    const targets: JudgeImageTarget[] = [];
    for (const section of previewSections) {
      for (const row of section.rows) {
        const target = buildJudgeImageTarget(
          previewContext.analysisId,
          section,
          row,
        );
        if (target) {
          targets.push(target);
        }
      }
    }
    return targets;
  }, [previewContext, previewSections]);

  const judgeTargetMap = useMemo(() => {
    const map = new Map<string, JudgeImageTarget>();
    for (const target of judgeTargets) {
      map.set(target.id, target);
    }
    return map;
  }, [judgeTargets]);

  useEffect(() => {
    logger.info("Judge capability updated", {
      canJudge,
      previewAnalysisId: previewContext?.analysisId ?? null,
      previewUserId: previewContext?.userId ?? null,
      currentUserId,
      targetCount: judgeTargets.length,
    });
  }, [
    canJudge,
    currentUserId,
    judgeTargets.length,
    previewContext?.analysisId,
    previewContext?.userId,
  ]);

  useEffect(() => {
    if (!isPreviewModalOpen) {
      resetJudgeState();
    }
  }, [isPreviewModalOpen, resetJudgeState]);

  useEffect(() => {
    if (!isPreviewModalOpen) {
      return;
    }
    if (!canJudge) {
      return;
    }
    if (!previewContext) {
      return;
    }
    if (!currentUserId) {
      return;
    }
    if (judgeTargets.length === 0) {
      setJudgeEvaluations(new Map<string, JudgeImageEvaluationState>());
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    void (async () => {
      try {
        const params = new URLSearchParams({
          userId: currentUserId,
          analysisId: previewContext.analysisId,
        });
        for (const target of judgeTargets) {
          params.append("imageUrl", target.originalImageUrl);
        }

        const response = await fetch(
          `/api/results/judge?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal,
          },
        );
        const data = (await response.json()) as {
          ok: boolean;
          evaluations?: JudgeImageEvaluationState[];
          message?: string;
        };

        if (signal.aborted) {
          return;
        }

        if (!response.ok || !data.ok) {
          setJudgeError(
            data.message ??
              "評価の取得に失敗しました。時間をおいて再度お試しください。",
          );
          return;
        }

        const map = new Map<string, JudgeImageEvaluationState>();
        for (const evaluation of data.evaluations ?? []) {
          map.set(evaluation.originalImageUrl, evaluation);
        }
        setJudgeEvaluations(map);
        setJudgeError(null);
      } catch (evaluationError) {
        if (signal.aborted) {
          return;
        }
        logger.error("JudgeImage evaluations fetch failed", {
          component: "ResultsPageClient",
          error: evaluationError,
        });
        setJudgeError(
          "評価の取得に失敗しました。時間をおいて再度お試しください。",
        );
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    canJudge,
    currentUserId,
    isPreviewModalOpen,
    judgeTargets,
    previewContext,
  ]);

  const handleJudgeEvaluation = useCallback(
    (target: JudgeImageTarget, point: 0 | 100) => {
      if (!canJudge || !previewContext || !currentUserId) {
        return;
      }

      logger.info("Judge evaluation requested", {
        target: target.id,
        point,
        previewAnalysisId: previewContext.analysisId,
        previewUserId: previewContext.userId,
        currentUserId,
      });

      setJudgeMessage(null);
      setJudgeError(null);
      setJudgeLoadingKeys((previous) => {
        const next = new Set(previous);
        next.add(target.originalImageUrl);
        return next;
      });

      startJudgeTransition(() => {
        void (async () => {
          try {
            const response = await fetch("/api/results/judge", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                userId: currentUserId,
                analysisId: previewContext.analysisId,
                analysisType: previewContext.analysisType,
                originalImageUrl: target.originalImageUrl,
                maskImageUrl: target.maskImageUrl,
                isExcel: target.isExcel,
                point,
              }),
            });

            const data = (await response.json()) as {
              ok: boolean;
              message?: string;
              evaluation?: JudgeImageEvaluationState;
            };

            logger.info("Judge evaluation response received", {
              status: response.status,
              ok: data.ok,
              hasEvaluation: Boolean(data.evaluation),
            });

            if (!response.ok || !data.ok || !data.evaluation) {
              setJudgeError(
                data.message ??
                  "評価の保存に失敗しました。時間をおいて再度お試しください。",
              );
              return;
            }

            const evaluation = data.evaluation;

            setJudgeEvaluations((previous) => {
              const next = new Map(previous);
              next.set(evaluation.originalImageUrl, evaluation);
              return next;
            });
            setJudgeMessage(
              point === 100
                ? "Good として評価しました。"
                : "Bad として評価しました。",
            );
          } catch (actionError) {
            logger.error("JudgeImage evaluation action failed", {
              component: "ResultsPageClient",
              target: target.id,
              error: actionError,
            });
            setJudgeError(
              "評価の保存に失敗しました。時間をおいて再度お試しください。",
            );
          } finally {
            setJudgeLoadingKeys((previous) => {
              const next = new Set(previous);
              next.delete(target.originalImageUrl);
              return next;
            });
          }
        })();
      });
    },
    [canJudge, currentUserId, previewContext],
  );

  const openPreviewModal = useCallback(() => {
    if (!selectedAnalysisRow) {
      return;
    }
    if (
      previousSearchParamsRef.current === null &&
      typeof window !== "undefined"
    ) {
      previousSearchParamsRef.current = window.location.search.slice(1);
    }
    setIsPreviewModalOpen(true);
  }, [selectedAnalysisRow]);

  const closePreviewModal = useCallback(() => {
    setIsPreviewModalOpen(false);
    setShouldAutoOpenModal(false);
    previewCacheKeyRef.current = null;
    setPreviewSections([]);
    setPreviewError(null);
    setPreviewContext(null);
    setSelectedAnalysisId("");
    restoreUrl();
  }, [restoreUrl]);

  useEffect(() => {
    if (!isPreviewModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreviewModal();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePreviewModal, isPreviewModalOpen]);

  useEffect(() => {
    if (!shouldAutoOpenModal) {
      return;
    }
    if (selectedAnalysisId && selectedAnalysisRow) {
      openPreviewModal();
    }
    if (!isLoading && hasLoadedOnce) {
      setShouldAutoOpenModal(false);
    }
  }, [
    hasLoadedOnce,
    isLoading,
    openPreviewModal,
    selectedAnalysisId,
    selectedAnalysisRow,
    shouldAutoOpenModal,
  ]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [],
  );

  const analysisTableColumns = useMemo<
    ColumnDef<AnalysisResultRow, unknown>[]
  >(() => {
    const userMeta: CustomColumnMeta = {
      cellType: "text",
      filterVariant: "select",
      filterOptions: userOptions,
      filterPlaceholder: "ユーザーIDまたは企業名で絞り込み",
    };

    const statusMeta: CustomColumnMeta = {
      cellType: "text",
      filterVariant: "select",
      filterOptions: statusFilterOptions,
      filterPlaceholder: "ステータスで絞り込み",
    };

    const analysisTypeMeta: CustomColumnMeta = {
      cellType: "text",
      filterVariant: "select",
      filterOptions: analysisTypeFilterOptions,
      filterPlaceholder: "解析タイプで絞り込み",
    };

    const columns: ColumnDef<AnalysisResultRow, unknown>[] = [
      {
        id: "userId",
        accessorFn: (row) =>
          [row.userId, row.companyName, row.username]
            .filter(
              (value) => typeof value === "string" && value.trim().length > 0,
            )
            .join(" "),
        header: "ユーザー / 企業",
        enableColumnFilter: true,
        enableGlobalFilter: true,
        filterFn: (row, _columnId, filterValue) => {
          if (typeof filterValue !== "string" || filterValue.length === 0) {
            return true;
          }
          // セレクト値と一致するユーザーIDだけを残す。
          return row.original.userId === filterValue;
        },
        meta: userMeta,
        cell: ({ row }) => {
          const userId = row.original.userId;
          const company = row.original.companyName;
          return company ? `${userId} (${company})` : userId;
        },
      },
      {
        accessorKey: "analysisDataId",
        header: "解析ID",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "解析IDで絞り込み",
        },
        cell: (context) => {
          const value = context.getValue<number | string | null>();
          return value === null || value === undefined ? "-" : String(value);
        },
      },
      {
        accessorKey: "analysisStatus",
        header: "ステータス",
        enableColumnFilter: true,
        meta: statusMeta,
      },
      {
        accessorKey: "analysisType",
        header: "解析タイプ",
        enableColumnFilter: true,
        meta: analysisTypeMeta,
        cell: (context) => {
          const value = context.getValue<string | null>();
          return value && value.trim().length > 0 ? value : "-";
        },
      },
      {
        accessorKey: "completedCount",
        header: "完了件数",
        enableColumnFilter: false,
        enableGlobalFilter: false,
        cell: (context) => {
          const value = context.getValue<number | null | undefined>();
          if (typeof value !== "number" || Number.isNaN(value)) {
            return "-";
          }
          return value.toLocaleString("ja-JP");
        },
        meta: {
          cellType: "text",
        },
      },
      {
        accessorKey: "sentAt",
        header: "送信日時",
        cell: (context) =>
          formatTimestamp(context.getValue<string>(), dateFormatter),
        enableColumnFilter: true,
        enableGlobalFilter: false,
        meta: {
          cellType: "date",
          filterVariant: "dateRange",
          filterPlaceholder: "YYYY-MM-DD",
        },
      },
      {
        accessorKey: "analyzerName",
        header: "解析担当",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "担当者名で絞り込み",
        },
      },
      {
        accessorKey: "aiModelName",
        header: "AIモデル名",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "モデル名で絞り込み",
        },
      },
      {
        accessorKey: "aiModelCode",
        header: "AIモデルコード",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "コードで絞り込み",
        },
      },
      {
        accessorKey: "userEmail",
        header: "メールアドレス",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "メールで絞り込み",
        },
        cell: (context) => context.getValue<string | null>() ?? "-",
      },
      {
        accessorKey: "downloadLink",
        header: "ダウンロードリンク",
        cell: (context) => {
          const value = context.getValue<string | null>();
          if (!value) {
            return "-";
          }
          const parts = value.split("/");
          const fileName = parts[parts.length - 1] ?? value;
          const href = `/api/analysis-results/object?key=${encodeURIComponent(value)}`;
          return (
            <a
              href={href}
              className={downloadLinkClass}
              target="_blank"
              rel="noopener noreferrer"
              download={fileName}
            >
              {fileName}
            </a>
          );
        },
        enableColumnFilter: false,
        enableGlobalFilter: true,
        meta: {
          cellType: "text",
        },
      },
      {
        id: "images",
        header: "images",
        enableColumnFilter: false,
        enableGlobalFilter: false,
        meta: {
          cellType: "actions",
        },
        cell: ({ row }) => {
          const record = row.original;
          if (!record.downloadLink) {
            return "—";
          }
          const stateKey = `images-${record.analysisDataId}`;
          const isBusy = activeDownloads.has(stateKey);
          return (
            <Button
              variant="ghost"
              size="sm"
              title="画像フォルダをZIPでダウンロード"
              onClick={() => {
                void handleDownload(record, "images");
              }}
              disabled={isBusy}
              isLoading={isBusy}
            >
              ZIP
            </Button>
          );
        },
      },
      {
        id: "allDownload",
        header: "all_DL",
        enableColumnFilter: false,
        enableGlobalFilter: false,
        meta: {
          cellType: "actions",
        },
        cell: ({ row }) => {
          const record = row.original;
          if (!record.downloadLink) {
            return "—";
          }
          const stateKey = `all-${record.analysisDataId}`;
          const isBusy = activeDownloads.has(stateKey);
          return (
            <Button
              variant="ghost"
              size="sm"
              title="解析フォルダ全体をZIPでダウンロード"
              onClick={() => {
                void handleDownload(record, "all");
              }}
              disabled={isBusy}
              isLoading={isBusy}
            >
              ZIP
            </Button>
          );
        },
      },
    ];

    return columns;
  }, [
    activeDownloads,
    dateFormatter,
    handleDownload,
    analysisTypeFilterOptions,
    statusFilterOptions,
    userOptions,
  ]);

  const isInitialLoading = !hasLoadedOnce && isLoading;
  const isRefreshing = hasLoadedOnce && isLoading;

  return (
    <div className={pageContainerClass}>
      <div className={headerContainerClass}>
        <div>
          <h1 className={pageTitleClass}>解析結果ブラウザー</h1>
          <p className={pageDescriptionClass}>
            MySQL に保存された解析メタデータを検索・絞り込みし、必要に応じて S3
            からプレビュー画像を参照します。
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            void fetchData();
          }}
          disabled={isLoading}
        >
          {isRefreshing
            ? "更新中..."
            : isInitialLoading
              ? "読み込み中..."
              : "最新の情報に更新"}
        </Button>
      </div>

      <section className={filtersContainerClass}>
        <div className={summaryActionClass}>
          <Button
            type="button"
            variant={showNonRootOnly ? "solid" : "outline"}
            onClick={() => {
              setShowNonRootOnly((prev) => !prev);
            }}
            aria-pressed={showNonRootOnly}
          >
            ルート以外
          </Button>
        </div>

        <div className={summaryCardClass}>
          <span className={summaryLabelClass}>表示件数</span>
          <span className={summaryValueClass}>
            {filteredRows.length.toLocaleString("ja-JP")}
          </span>
        </div>
        <div className={summaryCardClass}>
          <span className={summaryLabelClass}>総件数</span>
          <span className={summaryValueClass}>
            {rowCount.toLocaleString("ja-JP")}
          </span>
        </div>
      </section>

      {isHydrating ? (
        <AlertBanner
          variant="info"
          description="全データを読み込み中です…"
          className={bannerMarginClass}
        />
      ) : null}

      {error ? (
        <AlertBanner
          variant="error"
          title="エラー"
          description={error}
          className={bannerMarginClass}
        />
      ) : null}

      {showEmptyState ? (
        <div className={emptyStateClass}>
          指定された条件に一致する解析結果が見つかりませんでした。
        </div>
      ) : (
        <>
          <section className={sectionContainerClass}>
            <div className={sectionHeaderClass}>
              <h2 className={sectionTitleClass}>解析概要</h2>
              <span className={sectionCountBadgeClass}>
                {rowCount.toLocaleString("ja-JP")} 件
              </span>
            </div>
            <TanstackTable
              data={filteredRows}
              columns={analysisTableColumns}
              isLoading={isLoading}
              onRowClick={handleAnalysisRowClick}
              rowSelectionMode="single"
              getRowId={(row) => {
                const primary =
                  row.analysisDataId ?? row.imageAnalysisId ?? row.userId;
                return String(primary ?? row.userId);
              }}
              globalFilterPlaceholder="全列で検索"
              pageSize={50}
            />
          </section>

          <section className={sectionContainerClass}>
            <div className={sectionHeaderClass}>
              <h2 className={sectionTitleClass}>解析ファイルプレビュー</h2>
              {selectedAnalysisRow ? (
                <span className={sectionCountBadgeClass}>
                  {selectedAnalysisRow.analysisDataId ?? "-"}
                </span>
              ) : null}
            </div>
            {selectedAnalysisId ? (
              previewError ? (
                <AlertBanner
                  variant="error"
                  title="エラー"
                  description={previewError}
                  className={bannerMarginClass}
                />
              ) : previewSections.length > 0 ? (
                <div className={previewLaunchContainerClass}>
                  <p className={previewLaunchMessageClass}>
                    {`${previewImageCount.toLocaleString("ja-JP")} 件のプレビュー画像が見つかりました。`}
                    {previewSectionSummaries.length > 0 ? (
                      <span className={previewLaunchHintClass}>
                        {previewSectionSummaries.join(" / ")}
                      </span>
                    ) : null}
                    <span className={previewLaunchHintClass}>
                      下のボタンからモーダル表示を開き、スクロールしながら確認できます。
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openPreviewModal}
                    disabled={isPreviewLoading}
                  >
                    画像プレビューをモーダルで開く
                  </Button>
                </div>
              ) : (
                <div className={infoMessageClass}>
                  プレビューに利用できる画像が見つかりません。
                </div>
              )
            ) : (
              <div className={infoMessageClass}>
                解析概要の行をクリックすると対応するプレビュー画像が表示されます。
              </div>
            )}
          </section>
        </>
      )}
      {isPreviewModalOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: <>
        <div
          className={modalOverlayClass}
          role="button"
          tabIndex={0}
          aria-label="モーダルを閉じる"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePreviewModal();
            }
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }
            if (
              event.key === "Enter" ||
              event.key === " " ||
              event.key === "Space" ||
              event.key === "Spacebar"
            ) {
              event.preventDefault();
              closePreviewModal();
            }
          }}
        >
          <div
            className={modalContentClass}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
          >
            <button
              type="button"
              className={modalCloseButtonClass}
              onClick={closePreviewModal}
              aria-label="プレビューを閉じる"
            >
              ×
            </button>
            <h3 id={modalTitleId} className={modalTitleClass}>
              解析ファイルプレビュー
            </h3>
            {selectedAnalysisRow ? (
              <p className={modalSubtitleClass}>
                {`ユーザー ${selectedAnalysisRow.userId} / 解析ID ${
                  selectedAnalysisRow.analysisDataId ?? "-"
                }`}
              </p>
            ) : null}
            {isPreviewLoading ? (
              <div className={modalInfoMessageClass}>
                プレビューを読み込み中です…
              </div>
            ) : previewError ? (
              <div className={modalInfoMessageClass}>{previewError}</div>
            ) : previewSections.length > 0 ? (
              <>
                {judgeError ? (
                  <AlertBanner
                    variant="error"
                    description={judgeError}
                    className={bannerMarginClass}
                    onDismiss={() => setJudgeError(null)}
                  />
                ) : null}
                {judgeMessage ? (
                  <AlertBanner
                    variant="success"
                    description={judgeMessage}
                    className={bannerMarginClass}
                    onDismiss={() => setJudgeMessage(null)}
                  />
                ) : null}
                <div className={modalSectionsContainerClass}>
                  {previewSections.map((section) => (
                    <div key={section.key} className={modalSectionClass}>
                      <h4 className={modalSectionTitleClass}>
                        {section.title}
                      </h4>
                      {section.description ? (
                        <p className={modalSectionDescriptionClass}>
                          {section.description}
                        </p>
                      ) : null}
                      <div className={modalPairsContainerClass}>
                        {section.rows.map((row) => {
                          const targetId = previewContext
                            ? `${previewContext.analysisId}::${row.key}`
                            : row.key;
                          const judgeTargetCandidate =
                            previewContext?.analysisType === "main"
                              ? (judgeTargetMap.get(targetId) ??
                                buildJudgeImageTarget(
                                  previewContext.analysisId,
                                  section,
                                  row,
                                ))
                              : undefined;
                          const judgeTarget = judgeTargetCandidate ?? undefined;
                          const evaluation = judgeTarget
                            ? judgeEvaluations.get(judgeTarget.originalImageUrl)
                            : undefined;
                          const isBusy =
                            !!judgeTarget &&
                            (judgeLoadingKeys.has(
                              judgeTarget.originalImageUrl,
                            ) ||
                              isEvaluating);

                          return (
                            <div key={row.key} className={modalPairRowClass}>
                              {row.cells.map((cell) => (
                                <AnalysisImageCell
                                  key={cell.key}
                                  file={cell.file}
                                  inlineImage={cell.inlineImage}
                                  label={cell.label}
                                  dateFormatter={dateFormatter}
                                  size="modal"
                                />
                              ))}
                              {judgeTarget ? (
                                <JudgeEvaluationControls
                                  target={judgeTarget}
                                  evaluation={evaluation}
                                  onEvaluate={handleJudgeEvaluation}
                                  dateFormatter={dateFormatter}
                                  isBusy={isBusy}
                                  disabled={!canJudge}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={modalInfoMessageClass}>
                プレビューに利用できる画像が見つかりません。
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnalysisImageCell({
  file,
  inlineImage,
  label,
  dateFormatter,
  size = "default",
}: {
  file?: AnalysisResultFileEntry;
  inlineImage?: InlineImageSource;
  label: string;
  dateFormatter: Intl.DateTimeFormat;
  size?: "default" | "modal";
}) {
  if (!file && !inlineImage) {
    return (
      <div className={imageCardClass}>
        <span className={imageTitleClass}>{label}</span>
        <div className={imagePlaceholderClass}>
          対応するファイルが見つかりません
        </div>
      </div>
    );
  }

  const formattedSize = file?.size ? formatBytes(file.size) : null;
  const formattedTimestamp = file?.lastModified
    ? formatTimestamp(file.lastModified, dateFormatter)
    : null;

  const imageSrc = file
    ? `/api/analysis-results/object?key=${encodeURIComponent(file.key)}`
    : (inlineImage?.dataUrl ?? "");

  const containerClass =
    size === "modal"
      ? previewImageModalContainerClass
      : previewImageContainerClass;
  const imageClass =
    size === "modal" ? previewImageModalClass : previewImageClass;

  return (
    <div className={imageCardClass}>
      <span className={imageTitleClass}>{label}</span>
      <div className={containerClass}>
        <Image
          src={imageSrc}
          alt={file?.relativePath || inlineImage?.sourceName || label}
          fill
          sizes="(min-width: 1280px) 40vw, (min-width: 768px) 45vw, 90vw"
          className={imageClass}
          unoptimized
        />
      </div>
      <div className={previewMetaClass}>
        {file?.relativePath ? <span>{file.relativePath}</span> : null}
        {inlineImage?.sourceName ? <span>{inlineImage.sourceName}</span> : null}
        {formattedSize ? <span>{formattedSize}</span> : null}
        {formattedTimestamp ? <span>{formattedTimestamp}</span> : null}
      </div>
    </div>
  );
}

function JudgeEvaluationControls({
  target,
  evaluation,
  onEvaluate,
  dateFormatter,
  isBusy,
  disabled,
}: {
  target: JudgeImageTarget;
  evaluation?: JudgeImageEvaluationState;
  onEvaluate: (target: JudgeImageTarget, point: 0 | 100) => void;
  dateFormatter: Intl.DateTimeFormat;
  isBusy: boolean;
  disabled: boolean;
}) {
  const statusText =
    evaluation?.point === 100
      ? "👍 Good"
      : evaluation?.point === 0
        ? "👎 Bad"
        : "未評価";
  const updatedText = evaluation?.updatedAt
    ? dateFormatter.format(new Date(evaluation.updatedAt))
    : null;

  const handleEvaluate = (point: 0 | 100) => {
    if (disabled || isBusy) {
      return;
    }
    onEvaluate(target, point);
  };

  return (
    <div className={judgeControlsClass}>
      <div className={judgeStatusClass}>
        <span>
          {`${target.originalLabel}${
            target.maskLabel ? ` / ${target.maskLabel}` : ""
          }`}
        </span>
        <span>{`評価: ${statusText}`}</span>
        {target.isExcel ? (
          <span className={judgeExcelBadgeClass}>Excel由来</span>
        ) : null}
        {updatedText ? (
          <span
            className={judgeUpdatedAtClass}
          >{`最終更新: ${updatedText}`}</span>
        ) : null}
      </div>
      <div className={judgeButtonsWrapperClass}>
        <Button
          type="button"
          size="sm"
          variant={evaluation?.point === 100 ? "solid" : "outline"}
          disabled={disabled || isBusy}
          isLoading={isBusy}
          onClick={() => handleEvaluate(100)}
        >
          👍 Good
        </Button>
        <Button
          type="button"
          size="sm"
          variant={evaluation?.point === 0 ? "solid" : "outline"}
          disabled={disabled || isBusy}
          isLoading={isBusy}
          onClick={() => handleEvaluate(0)}
        >
          👎 Bad
        </Button>
      </div>
    </div>
  );
}

function formatBytes(value?: number): string {
  if (!value || Number.isNaN(value)) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const formatted =
    size >= 100 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

function formatTimestamp(
  value: string | undefined,
  formatter: Intl.DateTimeFormat,
): string {
  if (!value) {
    return "—";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return formatter.format(new Date(timestamp));
}

function buildFallbackZipName(
  row: AnalysisResultRow,
  variant: "images" | "all",
): string {
  const derived = deriveAnalysisIdentifiersFromDownloadLink(row.downloadLink);
  const base =
    derived?.analysisId ??
    row.imageAnalysisId ??
    String(row.analysisDataId ?? "analysis");
  const suffix = variant === "images" ? "images" : "all";
  return `${base}_${suffix}.zip`;
}

function parseFilenameFromDisposition(
  disposition: string | null,
): string | null {
  if (!disposition) {
    return null;
  }

  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // UTF-8 文字列の解釈に失敗した場合は後続処理へフォールバック
    }
  }

  const asciiMatch =
    disposition.match(/filename\s*=\s*"?(?<name>[^";]+)"?/i) ?? undefined;
  const fallbackName = asciiMatch?.groups?.name ?? asciiMatch?.[1];
  return fallbackName ?? null;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

function buildPreviewPairsFromFiles(
  files: AnalysisResultFileEntry[],
  targetAnalysisId: string,
): AnalysisImagePair[] {
  const directoryPairs = new Map<string, AnalysisImagePair>();

  for (const file of files) {
    if (file.analysisId !== targetAnalysisId) {
      continue;
    }

    const lowerName = file.fileName.toLowerCase();
    if (lowerName !== "origin.png" && lowerName !== "segmentation.png") {
      continue;
    }

    const directory = file.relativePath
      ? file.relativePath.split("/").slice(0, -1).join("/") || "."
      : ".";
    const key = `${file.analysisId}::${directory}`;
    const existing = directoryPairs.get(key) ?? {
      key,
      directory,
      origin: undefined,
      segmentation: undefined,
      lastModified: file.lastModified,
    };

    if (
      file.lastModified &&
      (!existing.lastModified || file.lastModified > existing.lastModified)
    ) {
      existing.lastModified = file.lastModified;
    }

    if (lowerName === "origin.png") {
      existing.origin = file;
    } else {
      existing.segmentation = file;
    }

    directoryPairs.set(key, existing);
  }

  return Array.from(directoryPairs.values()).sort((a, b) =>
    compareByTimestampThenKey(
      a.lastModified,
      b.lastModified,
      a.directory,
      b.directory,
    ),
  );
}

function buildMainPreviewSections(
  files: AnalysisResultFileEntry[],
  targetAnalysisId: string,
): AnalysisPreviewSection[] {
  const pairs = buildPreviewPairsFromFiles(files, targetAnalysisId);
  if (pairs.length === 0) {
    return [];
  }

  const rows: AnalysisPreviewRow[] = pairs.map((pair) => ({
    key: pair.key,
    cells: [
      {
        key: `${pair.key}-origin`,
        label: "origin.png",
        file: pair.origin,
        inlineImage: pair.originInline,
      },
      {
        key: `${pair.key}-segmentation`,
        label: "segmentation.png",
        file: pair.segmentation,
        inlineImage: pair.segmentationInline,
      },
    ],
  }));

  return [
    {
      key: `main-${targetAnalysisId}`,
      title: "origin.png / segmentation.png",
      rows,
    },
  ];
}

function buildRecommendPreviewSections(
  files: AnalysisResultFileEntry[],
  targetAnalysisId: string,
): AnalysisPreviewSection[] {
  const sections: AnalysisPreviewSection[] = [];
  const directoryPrefixes = IMAGE_DIRECTORY_CANDIDATES.map(
    (directory) => `${directory.toLowerCase()}/`,
  );

  const originalImages = collectImageFiles(
    files,
    targetAnalysisId,
    (_file, lowerPath) =>
      directoryPrefixes.some((prefix) => lowerPath.startsWith(prefix)),
  );

  if (originalImages.length > 0) {
    sections.push(
      buildImageListSection(
        "original_images 配下",
        `recommend-${targetAnalysisId}-original`,
        originalImages,
        {
          description:
            "original_images ディレクトリ内の PNG/JPG を表示しています。",
          itemsPerRow: 2,
        },
      ),
    );
  }

  const rootImages = collectImageFiles(
    files,
    targetAnalysisId,
    (_file, lowerPath) => !lowerPath.includes("/"),
  );

  if (rootImages.length > 0) {
    sections.push(
      buildImageListSection(
        "解析フォルダー直下",
        `recommend-${targetAnalysisId}-root`,
        rootImages,
        {
          description: "原画像直下に配置された PNG/JPG を表示しています。",
          itemsPerRow: 2,
        },
      ),
    );
  }

  return sections;
}

function buildScreeningOriginalSections(
  files: AnalysisResultFileEntry[],
  targetAnalysisId: string,
): AnalysisPreviewSection[] {
  const sections: AnalysisPreviewSection[] = [];
  const directoryPrefixes = IMAGE_DIRECTORY_CANDIDATES.map(
    (directory) => `${directory.toLowerCase()}/`,
  );

  const originalImages = collectImageFiles(
    files,
    targetAnalysisId,
    (_file, lowerPath) =>
      directoryPrefixes.some((prefix) => lowerPath.startsWith(prefix)),
  );

  if (originalImages.length > 0) {
    sections.push(
      buildImageListSection(
        "original_images 配下",
        `screening-${targetAnalysisId}-original`,
        originalImages,
        {
          description:
            "original_images ディレクトリ内の PNG/JPG を表示しています。",
          itemsPerRow: 2,
        },
      ),
    );
  }

  return sections;
}

function buildImageListSection(
  title: string,
  keyPrefix: string,
  files: AnalysisResultFileEntry[],
  options: {
    description?: string;
    itemsPerRow?: number;
  } = {},
): AnalysisPreviewSection {
  const { description, itemsPerRow = 1 } = options;

  const rows: AnalysisPreviewRow[] = [];
  for (let index = 0; index < files.length; index += itemsPerRow) {
    const slice = files.slice(index, index + itemsPerRow);
    rows.push({
      key: `${keyPrefix}-row-${index}`,
      cells: slice.map((file, sliceIndex) => ({
        key: `${keyPrefix}-cell-${index + sliceIndex}`,
        label: file.fileName,
        file,
      })),
    });
  }

  return {
    key: keyPrefix,
    title,
    description,
    rows,
  };
}

function buildArchivePreviewSection(
  analysisId: string,
  items: ArchivePreviewItemResponse[],
): AnalysisPreviewSection {
  const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path, "ja"));

  const rows: AnalysisPreviewRow[] = [];
  const itemsPerRow = 2;
  for (let index = 0; index < sorted.length; index += itemsPerRow) {
    const slice = sorted.slice(index, index + itemsPerRow);
    rows.push({
      key: `archive-${analysisId}-row-${index}`,
      cells: slice.map((item, sliceIndex) => ({
        key: `archive-${analysisId}-item-${index + sliceIndex}`,
        label: item.fileName,
        inlineImage: {
          dataUrl: item.dataUrl,
          sourceName: item.path,
        },
      })),
    });
  }

  return {
    key: `archive-${analysisId}`,
    title: "ZIP 内の画像",
    description:
      "ZIP アーカイブに格納されている PNG/JPG ファイルを展開しています。",
    rows,
  };
}

function buildFallbackPreviewSection(
  analysisId: string,
  pairs: FallbackPreviewPairResponse[],
  options: { workbookPrefix?: string } = {},
): AnalysisPreviewSection {
  const { workbookPrefix } = options;

  return {
    key: `fallback-${analysisId}`,
    title: "フォールバック画像",
    description: "Excel ワークブックから抽出した画像を表示しています。",
    rows: pairs.map((pair, index) => {
      const normalizedWorkbookName = pair.workbookName.replace(/^\/+/, "");
      const workbookPath = workbookPrefix
        ? `${workbookPrefix}${normalizedWorkbookName}`
        : normalizedWorkbookName;

      return {
        key: `fallback-${analysisId}-${index}`,
        cells: [
          {
            key: `fallback-${analysisId}-${index}-origin`,
            label: "origin",
            inlineImage: {
              dataUrl: pair.originDataUrl,
              sourceName: workbookPath,
            },
          },
          {
            key: `fallback-${analysisId}-${index}-segmentation`,
            label: "segmentation",
            inlineImage: {
              dataUrl: pair.segmentationDataUrl,
              sourceName: workbookPath,
            },
          },
        ],
      };
    }),
  };
}

function determineIsExcelSection(section: AnalysisPreviewSection): boolean {
  const key = section.key.toLowerCase();
  const titleLower = section.title.toLowerCase();
  const description = section.description ?? "";
  return (
    key.startsWith("fallback-") ||
    titleLower.includes("excel") ||
    section.title.includes("フォールバック") ||
    description.includes("Excel")
  );
}

function buildJudgeImageSourceKey(
  analysisId: string,
  sectionKey: string,
  rowKey: string,
  cell: AnalysisPreviewCell,
): string {
  if (cell.file?.key) {
    return cell.file.key;
  }
  if (cell.file?.relativePath) {
    return `${analysisId}::${cell.file.relativePath}`;
  }
  if (cell.inlineImage?.sourceName) {
    const sourceName = cell.inlineImage.sourceName;
    if (sourceName.startsWith("product/")) {
      return sourceName;
    }
    return `${analysisId}::${sourceName}`;
  }
  const sanitized = cell.label.replace(/\s+/g, "_");
  return `${analysisId}::${sectionKey}::${rowKey}::${sanitized}`;
}

function buildJudgeImageTarget(
  analysisId: string,
  section: AnalysisPreviewSection,
  row: AnalysisPreviewRow,
): JudgeImageTarget | null {
  if (row.cells.length === 0) {
    return null;
  }

  const originCell =
    row.cells.find((cell) => cell.label.toLowerCase().includes("origin")) ??
    row.cells[0];
  if (!originCell) {
    return null;
  }

  const maskCell =
    row.cells.find((cell) =>
      cell.label.toLowerCase().includes("segmentation"),
    ) ?? row.cells[1];

  const originalImageUrl = buildJudgeImageSourceKey(
    analysisId,
    section.key,
    row.key,
    originCell,
  );
  const maskImageUrl = maskCell
    ? buildJudgeImageSourceKey(analysisId, section.key, row.key, maskCell)
    : `${originalImageUrl}::mask`;

  return {
    id: `${analysisId}::${row.key}`,
    analysisId,
    originalImageUrl,
    maskImageUrl,
    isExcel: determineIsExcelSection(section),
    sectionKey: section.key,
    rowKey: row.key,
    originalLabel: originCell.label,
    maskLabel: maskCell?.label,
  };
}

function collectImageFiles(
  files: AnalysisResultFileEntry[],
  targetAnalysisId: string,
  predicate: (
    file: AnalysisResultFileEntry,
    lowerRelativePath: string,
  ) => boolean,
): AnalysisResultFileEntry[] {
  return files
    .filter((file) => file.analysisId === targetAnalysisId)
    .filter((file) => {
      if (!isSupportedImageFile(file.fileName)) {
        return false;
      }
      const lowerPath = file.relativePath.toLowerCase();
      return predicate(file, lowerPath);
    })
    .sort((a, b) =>
      compareByTimestampThenKey(
        a.lastModified,
        b.lastModified,
        a.relativePath,
        b.relativePath,
      ),
    );
}

function isSupportedImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return IMAGE_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function buildPreviewCacheKey({
  userId,
  analysisId,
  analysisType,
}: {
  userId?: string | null;
  analysisId?: string | null;
  analysisType?: string | null;
}): string {
  return [userId ?? "", analysisId ?? "", analysisType ?? ""].join("::");
}

function resolvePreviewAnalysisTypeSegment(
  derived: DerivedAnalysisIdentifiers | null,
  analysisTypeLabel: string | null,
): string {
  if (derived?.analysisType) {
    return derived.analysisType;
  }

  const normalizedLabel = (analysisTypeLabel ?? "").toLowerCase();

  if (
    normalizedLabel.includes("recommend") ||
    normalizedLabel.includes("新版") ||
    normalizedLabel.includes("推奨") ||
    normalizedLabel.includes("リコメンド")
  ) {
    return "recommend";
  }

  if (
    normalizedLabel.includes("screen") ||
    normalizedLabel.includes("スクリーン") ||
    normalizedLabel.includes("スクリーニング")
  ) {
    if (normalizedLabel.includes("旧")) {
      return "screening";
    }
    if (normalizedLabel.includes("新") || normalizedLabel.includes("推奨")) {
      return "recommend";
    }
    return "screening";
  }

  if (
    normalizedLabel.includes("main") ||
    normalizedLabel.includes("本解析") ||
    normalizedLabel.includes("標準")
  ) {
    return "main";
  }

  return "main";
}

const pageContainerClass = css({
  paddingX: { base: 4, md: 8 },
  paddingY: 6,
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const headerContainerClass = css({
  display: "flex",
  flexDirection: { base: "column", md: "row" },
  justifyContent: "space-between",
  alignItems: { base: "flex-start", md: "center" },
  gap: 4,
});

const pageTitleClass = css({
  fontSize: { base: "2xl", md: "3xl" },
  fontWeight: "bold",
});

const pageDescriptionClass = css({
  marginTop: 2,
  color: "text.secondary",
  maxWidth: "60ch",
});

const filtersContainerClass = css({
  display: "grid",
  gap: 4,
  gridTemplateColumns: {
    base: "1fr",
    md: "repeat(auto-fit, minmax(220px, 1fr))",
  },
  alignItems: "stretch",
});

const summaryCardClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 1,
  borderRadius: "md",
  border: "thin",
  borderColor: "border.default",
  backgroundColor: "dark.surface",
  padding: 4,
});

const summaryLabelClass = css({
  color: "text.secondary",
  fontSize: "xs",
  letterSpacing: "wider",
  textTransform: "uppercase",
});

const summaryValueClass = css({
  fontSize: "xl",
  fontWeight: "semibold",
});

const summaryActionClass = css({
  display: "flex",
  alignItems: "center",
  justifyContent: { base: "flex-start", md: "flex-start" },
});

const bannerMarginClass = css({
  marginBottom: 4,
});

const emptyStateClass = css({
  borderRadius: "lg",
  border: "thin",
  borderColor: "border.default",
  backgroundColor: "dark.surface",
  padding: 8,
  textAlign: "center",
  color: "text.secondary",
  fontSize: "sm",
});

const infoMessageClass = css({
  color: "text.secondary",
  fontSize: "sm",
  backgroundColor: "dark.surfaceActive",
  borderRadius: "md",
  border: "thin",
  borderColor: "border.subtle",
  padding: 4,
});

const modalSectionsContainerClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const modalSectionClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

const modalSectionTitleClass = css({
  fontSize: "lg",
  fontWeight: "semibold",
  color: "text.primary",
});

const modalSectionDescriptionClass = css({
  fontSize: "sm",
  color: "text.secondary",
});

const modalPairsContainerClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

const modalPairRowClass = css({
  display: "grid",
  gap: 4,
  gridTemplateColumns: { base: "1fr", md: "repeat(2, minmax(0, 1fr))" },
});

const judgeControlsClass = css({
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: { base: "column", md: "row" },
  gap: 3,
  alignItems: { base: "flex-start", md: "center" },
  justifyContent: "space-between",
  padding: 3,
  backgroundColor: "dark.surfaceActive",
  border: "thin",
  borderColor: "border.subtle",
  borderRadius: "md",
});

const judgeStatusClass = css({
  display: "flex",
  flexDirection: { base: "column", md: "row" },
  gap: { base: 2, md: 3 },
  fontSize: "sm",
  color: "text.secondary",
});

const judgeButtonsWrapperClass = css({
  display: "flex",
  gap: 2,
});

const judgeUpdatedAtClass = css({
  fontSize: "xs",
  color: "text.muted",
});

const judgeExcelBadgeClass = css({
  fontSize: "xs",
  paddingX: 2,
  paddingY: 1,
  borderRadius: "sm",
  border: "thin",
  borderColor: "yellow.500",
  color: "yellow.200",
  backgroundColor: "rgba(234, 179, 8, 0.12)",
});

const modalInfoMessageClass = css({
  color: "text.secondary",
  fontSize: "sm",
  backgroundColor: "dark.surfaceActive",
  borderRadius: "md",
  border: "thin",
  borderColor: "border.subtle",
  padding: { base: 4, md: 6 },
  textAlign: "center",
});

const imageCardClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 3,
});

const imageTitleClass = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "text.secondary",
});

const imagePlaceholderClass = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "18rem",
  borderRadius: "md",
  border: "thin",
  borderColor: "border.subtle",
  backgroundColor: "dark.surfaceActive",
  color: "text.secondary",
  fontSize: "sm",
  textAlign: "center",
  padding: 4,
});

const previewImageContainerClass = css({
  // next/image の fill オプションを利用するため position: relative を付与。
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 4,
  backgroundColor: "dark.surfaceActive",
  borderRadius: "md",
  border: "thin",
  borderColor: "border.subtle",
  position: "relative",
  minHeight: "18rem",
  overflow: "hidden",
});

const previewImageClass = css({
  objectFit: "contain",
  borderRadius: "md",
  boxShadow: "md",
});

const previewImageModalContainerClass = css({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: { base: 4, md: 6 },
  backgroundColor: "dark.surfaceActive",
  borderRadius: "lg",
  border: "thin",
  borderColor: "border.default",
  position: "relative",
  minHeight: { base: "20rem", md: "28rem" },
  overflow: "hidden",
});

const previewImageModalClass = css({
  objectFit: "contain",
  borderRadius: "lg",
  boxShadow: "lg",
});

const previewMetaClass = css({
  marginTop: 4,
  display: "flex",
  flexDirection: { base: "column", md: "row" },
  gap: 3,
  alignItems: { base: "flex-start", md: "center" },
  color: "text.secondary",
  fontSize: "xs",
});

const previewLaunchContainerClass = css({
  display: "flex",
  flexDirection: { base: "column", md: "row" },
  alignItems: { base: "flex-start", md: "center" },
  justifyContent: "space-between",
  gap: 4,
  padding: 4,
  backgroundColor: "dark.surfaceActive",
  borderRadius: "md",
  border: "thin",
  borderColor: "border.subtle",
});

const previewLaunchMessageClass = css({
  color: "text.secondary",
  fontSize: "sm",
  lineHeight: "tall",
});

const previewLaunchHintClass = css({
  display: "block",
  marginTop: 1,
});

const downloadLinkClass = css({
  color: "primary.400",
  textDecoration: "underline",
  _hover: {
    color: "primary.300",
  },
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "primary.400",
    borderRadius: "sm",
  },
});

const modalOverlayClass = css({
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  backgroundColor: "rgba(8, 15, 27, 0.78)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  padding: { base: 4, md: 10 },
  overflowY: "auto",
});

const modalContentClass = css({
  position: "relative",
  width: "100%",
  maxWidth: "min(1200px, 100%)",
  backgroundColor: "dark.surface",
  borderRadius: "2xl",
  border: "thin",
  borderColor: "border.default",
  boxShadow: "xl",
  padding: { base: 6, md: 8 },
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: "calc(100vh - 4rem)",
  overflowY: "auto",
  cursor: "default",
});

const modalCloseButtonClass = css({
  position: "absolute",
  top: 4,
  right: 4,
  border: "none",
  background: "transparent",
  color: "text.secondary",
  fontSize: "2xl",
  fontWeight: "bold",
  cursor: "pointer",
  lineHeight: 1,
  padding: 2,
  _hover: {
    color: "text.primary",
  },
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "primary.500",
    borderRadius: "full",
  },
});

const modalTitleClass = css({
  fontSize: { base: "xl", md: "2xl" },
  fontWeight: "semibold",
});

const modalSubtitleClass = css({
  color: "text.secondary",
  fontSize: "sm",
});

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

const sectionContainerClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 3,
  borderRadius: "lg",
  border: "thin",
  borderColor: "border.default",
  padding: 4,
  backgroundColor: "dark.surface",
});

const sectionHeaderClass = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 3,
});

const sectionTitleClass = css({
  fontSize: "lg",
  fontWeight: "semibold",
});

const sectionCountBadgeClass = css({
  paddingX: 3,
  paddingY: 1,
  borderRadius: "full",
  backgroundColor: "dark.surfaceActive",
  color: "text.secondary",
  fontSize: "sm",
});
