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
} from "react";

import TanstackTable from "@/components/tanstack-table/TanstackTable";
import type {
  CustomColumnMeta,
  FilterOption,
} from "@/components/tanstack-table/types";
import { Button } from "@/components/ui/Button";
import { deriveAnalysisIdentifiersFromDownloadLink } from "@/lib/analysis-results/download-link";
import { logger } from "@/lib/logger/client";
import { css } from "@/styled-system/css";

interface AnalysisResultRow {
  analysisDataId: number;
  userId: string;
  imageAnalysisId: string | null;
  sentAt: string;
  sentStatus: number;
  analysisStatus: string | null;
  analysisType: string;
  analyzerName: string | null;
  downloadLink: string | null;
  imageAnalysisTitle: string | null;
  companyName: string | null;
  username: string | null;
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

interface AnalysisImagePair {
  key: string;
  directory: string;
  origin?: AnalysisResultFileEntry;
  segmentation?: AnalysisResultFileEntry;
  lastModified?: string;
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

const PAGE_SIZE = 20;

export default function ResultsPageClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParamsString = searchParams.toString();
  const defaultUserId = "";
  const userIdParam = searchParams.get("userId") ?? defaultUserId;
  const analysisIdParam = searchParams.get("analysisId") ?? "";
  const pageParamFromQuery = Number.parseInt(
    searchParams.get("page") ?? "1",
    10,
  );
  const initialPage =
    Number.isNaN(pageParamFromQuery) || pageParamFromQuery < 1
      ? 1
      : pageParamFromQuery;

  // DB から取得した解析結果一覧と各種 UI ステートを管理する。
  const [rows, setRows] = useState<AnalysisResultRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>(userIdParam);
  const [selectedAnalysisId, setSelectedAnalysisId] =
    useState<string>(analysisIdParam);
  const [page, setPage] = useState(analysisIdParam ? 1 : initialPage);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [availableAnalysisIds, setAvailableAnalysisIds] = useState<string[]>(
    [],
  );
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [shouldAutoOpenModal, setShouldAutoOpenModal] = useState(false);
  const [previewPairs, setPreviewPairs] = useState<AnalysisImagePair[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const modalTitleId = useId();
  const previousPageRef = useRef<number>(initialPage);
  const userChangeSourceRef = useRef<"manual" | "row" | null>(null);
  const previewCacheKeyRef = useRef<string | null>(null);

  const updateUrl = useCallback(
    (nextUserId: string, nextAnalysisId: string, nextPage?: number) => {
      // クエリ文字列を更新して選択状態を URL に反映する。
      const params = new URLSearchParams(searchParamsString);

      if (nextUserId) {
        params.set("userId", nextUserId);
      } else {
        params.delete("userId");
      }

      if (nextUserId && nextAnalysisId) {
        params.set("analysisId", nextAnalysisId);
      } else {
        params.delete("analysisId");
      }

      if (!nextAnalysisId && nextUserId) {
        if (nextPage && nextPage > 1) {
          params.set("page", String(nextPage));
        } else {
          params.delete("page");
        }
      } else {
        params.delete("page");
      }

      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const effectivePage = selectedAnalysisId ? 1 : page;
    const params = new URLSearchParams();
    params.set("page", String(effectivePage));
    params.set("pageSize", String(PAGE_SIZE));
    if (selectedUserId) {
      params.set("userId", selectedUserId);
    }
    if (selectedAnalysisId) {
      params.set("analysisId", selectedAnalysisId);
    }

    const endpoint = `/api/mysql/analysis-results?${params.toString()}`;

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = (await response.json()) as MysqlAnalysisResultsResponse;

      if (!response.ok || !data.ok) {
        const message = data.ok
          ? `解析結果の取得に失敗しました (${response.status})`
          : data.error;
        setError(message);
        logger.error("Failed to load analysis results from MySQL", {
          component: "ResultsPageClient",
          status: response.status,
          error: message,
          endpoint,
        });
        return;
      }

      setRows(data.rows);
      setAvailableUsers(data.filters?.users ?? []);
      setAvailableAnalysisIds(data.filters?.analysisIds ?? []);

      if (
        !hasLoadedOnce &&
        data.filters?.users?.length &&
        selectedUserId &&
        !data.filters.users.includes(selectedUserId)
      ) {
        const fallbackUser = data.filters.users[0] ?? "";
        setSelectedUserId(fallbackUser);
        setSelectedAnalysisId("");
        setPage(1);
        updateUrl(fallbackUser, "", 1);
      }

      if (
        selectedAnalysisId &&
        data.filters?.analysisIds &&
        !data.filters.analysisIds.includes(selectedAnalysisId)
      ) {
        setSelectedAnalysisId("");
        setPage(1);
        updateUrl(selectedUserId, "", 1);
      }

      const apiPage = data.pagination?.page ?? effectivePage;
      if (apiPage !== page) {
        setPage(apiPage);
      }

      setHasMore(Boolean(data.pagination?.hasMore));
      setTotalCount(data.pagination?.totalCount ?? 0);

      logger.info("Analysis results fetched from MySQL", {
        component: "ResultsPageClient",
        rowCount: data.rows.length,
        userId: selectedUserId || null,
        analysisId: selectedAnalysisId || null,
        page: apiPage,
        endpoint,
      });
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "解析結果の取得に失敗しました";
      setError(message);
      logger.error("Analysis results fetch threw", {
        component: "ResultsPageClient",
        error: message,
        endpoint,
      });
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [hasLoadedOnce, page, selectedAnalysisId, selectedUserId, updateUrl]);

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
    if (!analysisIdParam) {
      const parsed = Number.parseInt(
        new URLSearchParams(searchParamsString).get("page") ?? "1",
        10,
      );
      if (!Number.isNaN(parsed) && parsed > 0) {
        setPage(parsed);
      }
    }
  }, [analysisIdParam, searchParamsString, userIdParam]);

  useEffect(() => {
    // ユーザーを変更したら解析 ID のキャッシュとページ情報をリセット。
    if (selectedUserId === undefined) {
      return;
    }
    const changeSource = userChangeSourceRef.current;
    userChangeSourceRef.current = null;

    if (changeSource === "row") {
      return;
    }
    setAvailableAnalysisIds([]);
    setPage(1);
    setShouldAutoOpenModal(false);
    setIsPreviewModalOpen(false);
    previousPageRef.current = 1;
  }, [selectedUserId]);

  useEffect(() => {
    if (selectedAnalysisId) {
      setPage(1);
    }
  }, [selectedAnalysisId]);

  useEffect(() => {
    if (!selectedAnalysisId) {
      previousPageRef.current = page;
    }
  }, [page, selectedAnalysisId]);

  useEffect(() => {
    if (!hasLoadedOnce) {
      return;
    }

    if (selectedUserId && !availableUsers.includes(selectedUserId)) {
      setSelectedUserId("");
      setSelectedAnalysisId("");
      return;
    }

    if (
      selectedAnalysisId &&
      !availableAnalysisIds.includes(selectedAnalysisId)
    ) {
      setSelectedAnalysisId("");
    }
  }, [
    availableAnalysisIds,
    availableUsers,
    hasLoadedOnce,
    selectedAnalysisId,
    selectedUserId,
  ]);

  const userOptions = useMemo<FilterOption[]>(() => {
    return availableUsers.map((value) => ({ label: value, value }));
  }, [availableUsers]);

  const analysisOptions = useMemo<FilterOption[]>(() => {
    return sortAnalysisIdsDesc([
      ...availableAnalysisIds,
      ...(selectedAnalysisId ? [selectedAnalysisId] : []),
    ]).map((value) => ({ label: value, value }));
  }, [availableAnalysisIds, selectedAnalysisId]);

  const statusFilterOptions = useMemo<FilterOption[]>(() => {
    const unique = new Set<string>();
    for (const row of rows) {
      if (row.analysisStatus) {
        unique.add(row.analysisStatus);
      }
    }
    return Array.from(unique)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ label: value, value }));
  }, [rows]);

  const showEmptyState =
    hasLoadedOnce && !isLoading && !error && rows.length === 0;

  const handlePrevPage = useCallback(() => {
    if (isLoading || selectedAnalysisId || page <= 1) {
      return;
    }
    const nextPage = page - 1;
    setPage(nextPage);
    updateUrl(selectedUserId, selectedAnalysisId, nextPage);
  }, [isLoading, page, selectedAnalysisId, selectedUserId, updateUrl]);

  const handleNextPage = useCallback(() => {
    if (isLoading || selectedAnalysisId || !hasMore) {
      return;
    }
    const nextPage = page + 1;
    setPage(nextPage);
    updateUrl(selectedUserId, selectedAnalysisId, nextPage);
  }, [hasMore, isLoading, page, selectedAnalysisId, selectedUserId, updateUrl]);

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

      if (record.userId !== selectedUserId) {
        userChangeSourceRef.current = "row";
        setSelectedUserId(record.userId);
      }

      if (record.imageAnalysisId !== selectedAnalysisId) {
        setSelectedAnalysisId(record.imageAnalysisId);
      }

      previousPageRef.current = page;
      setPage(1);
      updateUrl(record.userId, record.imageAnalysisId, 1);
      setShouldAutoOpenModal(true);
    },
    [page, selectedAnalysisId, selectedUserId, updateUrl],
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

  useEffect(() => {
    const expectedKey = `${selectedUserId ?? ""}::${selectedAnalysisId ?? ""}`;
    if (previewCacheKeyRef.current === expectedKey) {
      return;
    }
    previewCacheKeyRef.current = null;
    setPreviewPairs([]);
    setPreviewError(null);
  }, [selectedAnalysisId, selectedUserId]);

  const loadPreviewPairs = useCallback(async () => {
    if (!selectedAnalysisRow) {
      setPreviewPairs([]);
      setPreviewError(null);
      return;
    }

    const derived = deriveAnalysisIdentifiersFromDownloadLink(
      selectedAnalysisRow.downloadLink,
    );
    const previewUserId = derived?.userId ?? selectedAnalysisRow.userId;
    const previewAnalysisId =
      derived?.analysisId ?? selectedAnalysisRow.imageAnalysisId ?? "";

    if (!previewAnalysisId) {
      setPreviewPairs([]);
      setPreviewError("プレビュー対象の解析IDを特定できませんでした。");
      return;
    }

    const cacheKey = `${previewUserId}::${previewAnalysisId}`;
    if (previewCacheKeyRef.current === cacheKey && previewPairs.length > 0) {
      return;
    }

    const params = new URLSearchParams();
    params.set("userId", previewUserId);
    params.set("analysisId", previewAnalysisId);
    params.set("limit", "500");

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
        setPreviewPairs([]);
        logger.error("Failed to load analysis preview files", {
          component: "ResultsPageClient",
          endpoint,
          status: response.status,
          analysisId: previewAnalysisId,
          userId: previewUserId,
          error: message,
        });
        return;
      }

      const pairs = buildPreviewPairsFromFiles(data.files, previewAnalysisId);
      setPreviewPairs(pairs);
    } catch (previewFetchError) {
      const message =
        previewFetchError instanceof Error
          ? previewFetchError.message
          : "プレビュー画像の取得に失敗しました";
      setPreviewError(message);
      setPreviewPairs([]);
      logger.error("Analysis preview fetch threw", {
        component: "ResultsPageClient",
        endpoint,
        analysisId: previewAnalysisId,
        userId: previewUserId,
        error: message,
      });
    } finally {
      setIsPreviewLoading(false);
    }
  }, [previewPairs.length, selectedAnalysisRow]);

  useEffect(() => {
    if (!isPreviewModalOpen) {
      return;
    }
    void loadPreviewPairs();
  }, [isPreviewModalOpen, loadPreviewPairs]);

  const openPreviewModal = useCallback(() => {
    if (!selectedAnalysisRow) {
      return;
    }
    setIsPreviewModalOpen(true);
  }, [selectedAnalysisRow]);

  const closePreviewModal = useCallback(() => {
    setIsPreviewModalOpen(false);
    setShouldAutoOpenModal(false);
    previewCacheKeyRef.current = null;
    setPreviewPairs([]);
    setPreviewError(null);
    const previousPage = previousPageRef.current ?? 1;
    setSelectedAnalysisId("");
    setPage(previousPage);
    previousPageRef.current = previousPage;
    updateUrl(selectedUserId, "", previousPage);
  }, [selectedUserId, updateUrl]);

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
      filterPlaceholder: "ユーザーIDで絞り込み",
    };

    const statusMeta: CustomColumnMeta = {
      cellType: "text",
      filterVariant: "select",
      filterOptions: statusFilterOptions,
      filterPlaceholder: "ステータスで絞り込み",
    };

    const columns: ColumnDef<AnalysisResultRow, unknown>[] = [
      {
        accessorKey: "userId",
        header: "ユーザーID",
        enableColumnFilter: true,
        meta: userMeta,
      },
      {
        accessorKey: "imageAnalysisId",
        header: "解析ID",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "解析IDで絞り込み",
        },
      },
      {
        accessorKey: "analysisDataId",
        header: "AnalysisData ID",
        enableColumnFilter: false,
        meta: {
          cellType: "text",
        },
      },
      {
        accessorKey: "analysisType",
        header: "解析タイプ",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "解析タイプで絞り込み",
        },
      },
      {
        accessorKey: "analysisStatus",
        header: "ステータス",
        enableColumnFilter: true,
        meta: statusMeta,
      },
      {
        accessorKey: "sentAt",
        header: "送信日時",
        cell: (context) =>
          formatTimestamp(context.getValue<string>(), dateFormatter),
        enableColumnFilter: true,
        meta: {
          cellType: "date",
          filterVariant: "dateRange",
          filterPlaceholder: "YYYY-MM-DD",
          enableGlobalFilter: false,
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
        accessorKey: "imageAnalysisTitle",
        header: "解析タイトル",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "タイトルで絞り込み",
        },
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
          return parts[parts.length - 1] ?? value;
        },
        enableColumnFilter: false,
        meta: {
          cellType: "text",
          enableGlobalFilter: true,
        },
      },
    ];

    return columns;
  }, [dateFormatter, statusFilterOptions, userOptions]);

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
        <label className={filterLabelClass}>
          ユーザー
          <select
            className={filterSelectClass}
            value={selectedUserId}
            onChange={(event) => {
              const nextUserId = event.target.value;
              userChangeSourceRef.current = "manual";
              setSelectedUserId(nextUserId);
              setSelectedAnalysisId("");
              setPage(1);
              setAvailableAnalysisIds([]);
              setShouldAutoOpenModal(false);
              setIsPreviewModalOpen(false);
              previousPageRef.current = 1;
              updateUrl(nextUserId, "", 1);
            }}
          >
            <option value="">すべて</option>
            {userOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={filterLabelClass}>
          解析ID
          <select
            className={filterSelectClass}
            value={selectedAnalysisId}
            onChange={(event) => {
              const nextAnalysisId = event.target.value;
              setSelectedAnalysisId(nextAnalysisId);
              setPage(1);
              updateUrl(selectedUserId, nextAnalysisId, 1);
            }}
            disabled={analysisOptions.length === 0}
          >
            <option value="">すべて</option>
            {analysisOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className={summaryCardClass}>
          <span className={summaryLabelClass}>表示件数</span>
          <span className={summaryValueClass}>
            {rows.length.toLocaleString("ja-JP")}
          </span>
        </div>
        <div className={summaryCardClass}>
          <span className={summaryLabelClass}>総件数</span>
          <span className={summaryValueClass}>
            {totalCount.toLocaleString("ja-JP")}
          </span>
        </div>
      </section>

      {error ? <div className={errorAlertClass}>エラー: {error}</div> : null}

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
                {totalCount.toLocaleString("ja-JP")} 件
              </span>
            </div>
            <TanstackTable
              data={rows}
              columns={analysisTableColumns}
              isLoading={isLoading}
              onRowClick={handleAnalysisRowClick}
              rowSelectionMode="single"
              getRowId={(row) =>
                `${row.userId}::${row.imageAnalysisId ?? row.analysisDataId}`
              }
              globalFilterPlaceholder="全列で検索"
            />
            {!selectedAnalysisId ? (
              <div className={paginationControlsClass}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevPage}
                  disabled={isLoading || page <= 1}
                >
                  前の{PAGE_SIZE}件
                </Button>
                <span className={pageIndicatorClass}>ページ {page}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleNextPage}
                  disabled={isLoading || !hasMore}
                >
                  次の{PAGE_SIZE}件
                </Button>
              </div>
            ) : null}
          </section>

          <section className={sectionContainerClass}>
            <div className={sectionHeaderClass}>
              <h2 className={sectionTitleClass}>解析ファイルプレビュー</h2>
              {selectedAnalysisRow ? (
                <span className={sectionCountBadgeClass}>
                  {selectedAnalysisRow.imageAnalysisId ?? "-"}
                </span>
              ) : null}
            </div>
            {selectedAnalysisId ? (
              previewError ? (
                <div className={errorAlertClass}>エラー: {previewError}</div>
              ) : previewPairs.length > 0 ? (
                <div className={previewLaunchContainerClass}>
                  <p className={previewLaunchMessageClass}>
                    {`${previewPairs.length.toLocaleString("ja-JP")} 件のディレクトリで origin.png と segmentation.png の組み合わせが見つかりました。`}
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
                  origin.png / segmentation.png の組み合わせが見つかりません。
                </div>
              )
            ) : (
              <div className={infoMessageClass}>
                {"解析概要の行をクリックすると対応する origin.png / "}
                {"segmentation.png が表示されます。"}
              </div>
            )}
          </section>
        </>
      )}
      {isPreviewModalOpen ? (
        <div className={modalOverlayClass}>
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
                  selectedAnalysisRow.imageAnalysisId ?? "-"
                }`}
              </p>
            ) : null}
            {isPreviewLoading ? (
              <div className={modalInfoMessageClass}>
                プレビューを読み込み中です…
              </div>
            ) : previewError ? (
              <div className={modalInfoMessageClass}>{previewError}</div>
            ) : previewPairs.length > 0 ? (
              <div className={modalPairsContainerClass}>
                {previewPairs.map((pair) => (
                  <div key={pair.key} className={modalPairRowClass}>
                    <AnalysisImageCell
                      file={pair.origin}
                      label="origin.png"
                      dateFormatter={dateFormatter}
                      size="modal"
                    />
                    <AnalysisImageCell
                      file={pair.segmentation}
                      label="segmentation.png"
                      dateFormatter={dateFormatter}
                      size="modal"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className={modalInfoMessageClass}>
                origin.png / segmentation.png の組み合わせが見つかりません。
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
  label,
  dateFormatter,
  size = "default",
}: {
  file?: AnalysisResultFileEntry;
  label: string;
  dateFormatter: Intl.DateTimeFormat;
  size?: "default" | "modal";
}) {
  if (!file) {
    return (
      <div className={imageCardClass}>
        <span className={imageTitleClass}>{label}</span>
        <div className={imagePlaceholderClass}>
          対応するファイルが見つかりません
        </div>
      </div>
    );
  }

  const formattedSize = file.size ? formatBytes(file.size) : null;
  const formattedTimestamp = file.lastModified
    ? formatTimestamp(file.lastModified, dateFormatter)
    : null;

  const imageSrc = `/api/analysis-results/object?key=${encodeURIComponent(file.key)}`;

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
          alt={`${label} (${file.relativePath})`}
          fill
          sizes="(min-width: 1280px) 40vw, (min-width: 768px) 45vw, 90vw"
          className={imageClass}
          unoptimized
        />
      </div>
      <div className={previewMetaClass}>
        <span>{file.relativePath}</span>
        {formattedSize ? <span>{formattedSize}</span> : null}
        {formattedTimestamp ? <span>{formattedTimestamp}</span> : null}
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

const filterLabelClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: "text.secondary",
  fontSize: "sm",
});

const filterSelectClass = css({
  paddingX: 3,
  paddingY: 2,
  borderRadius: "md",
  border: "thin",
  borderColor: "border.default",
  backgroundColor: "dark.surfaceActive",
  color: "text.primary",
  fontSize: "sm",
  _focus: {
    outline: "none",
    borderColor: "primary.500",
    boxShadow: "0 0 0 2px rgba(33, 134, 235, 0.35)",
  },
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

const errorAlertClass = css({
  borderRadius: "md",
  border: "thin",
  borderColor: "red.500",
  backgroundColor: "rgba(239, 68, 68, 0.1)",
  color: "red.200",
  padding: 4,
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

const paginationControlsClass = css({
  display: "flex",
  alignItems: "center",
  justifyContent: { base: "center", md: "space-between" },
  gap: 4,
  marginTop: 4,
});

const pageIndicatorClass = css({
  color: "text.secondary",
  fontSize: "sm",
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

function sortAnalysisIdsDesc(values: Iterable<string>): string[] {
  return Array.from(new Set(values))
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
