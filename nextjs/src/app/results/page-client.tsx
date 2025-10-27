"use client";

/**
 * 解析結果ブラウザーのクライアント側実装。
 * S3 から API 経由で取得したデータを Tanstack Table に流し込み、
 * ユーザー ID / 解析 ID のフィルタと画像プレビュー機能を提供する。
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
import { logger } from "@/lib/logger/client";
import { css } from "@/styled-system/css";

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

  // API から受け取った解析サマリ／ファイル一覧と、ページ操作に必要な UI ステートをまとめて管理する。
  const [analyses, setAnalyses] = useState<AnalysisResultSummary[]>([]);
  const [files, setFiles] = useState<AnalysisResultFileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>(userIdParam);
  const [selectedAnalysisId, setSelectedAnalysisId] =
    useState<string>(analysisIdParam);
  const [page, setPage] = useState(analysisIdParam ? 1 : initialPage);
  const [hasMore, setHasMore] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [availableAnalysisIds, setAvailableAnalysisIds] = useState<string[]>(
    [],
  );
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [shouldAutoOpenModal, setShouldAutoOpenModal] = useState(false);
  const modalTitleId = useId();
  const previousPageRef = useRef<number>(initialPage);
  const userChangeSourceRef = useRef<"manual" | "row" | null>(null);

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

  const fetchData = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      // 再取得のたびにローディング表示とエラー表示をリセットする。
      setIsLoading(true);
      setError(null);

      const effectivePage = selectedAnalysisId ? 1 : page;
      const params = new URLSearchParams();
      if (selectedUserId) {
        params.set("userId", selectedUserId);
      }
      if (selectedAnalysisId) {
        params.set("analysisId", selectedAnalysisId);
      }
      params.set("limit", String(PAGE_SIZE));
      params.set("page", String(effectivePage));
      if (options?.forceRefresh) {
        params.set("forceRefresh", "1");
      }

      const endpoint = `/api/analysis-results?${params.toString()}`;

      try {
        // API からは常に全件を取得し、フロント側でフィルタリングを行う。
        const response = await fetch(endpoint, { cache: "no-store" });
        const data = (await response.json()) as AnalysisResultsResponse;

        if (!response.ok || !data.ok) {
          const message = data.ok
            ? `解析結果APIでエラーが発生しました (${response.status})`
            : data.error;
          setError(message);
          logger.error("Failed to load analysis results", {
            component: "ResultsPageClient",
            status: response.status,
            error: message,
            endpoint,
          });
          return;
        }

        setAnalyses(data.analyses);
        setFiles(data.files);

        if (Array.isArray(data.users)) {
          setAvailableUsers(data.users);
          if (
            !hasLoadedOnce &&
            data.users.length > 0 &&
            selectedUserId &&
            !data.users.includes(selectedUserId)
          ) {
            const fallbackUser = data.users[0];
            setSelectedUserId(fallbackUser);
            setPage(1);
            updateUrl(fallbackUser, "", 1);
          }
        }

        const fetchedAnalysisIds = data.analyses.map(
          (entry) => entry.analysisId,
        );
        setAvailableAnalysisIds((prev) => {
          const merged = sortAnalysisIdsDesc([
            ...prev,
            ...fetchedAnalysisIds,
            ...(selectedAnalysisId ? [selectedAnalysisId] : []),
          ]);
          if (selectedAnalysisId && !merged.includes(selectedAnalysisId)) {
            merged.unshift(selectedAnalysisId);
          }
          return merged.slice(0, 200);
        });

        if (!selectedAnalysisId) {
          const apiPage = data.pagination?.page ?? effectivePage;
          if (apiPage !== page) {
            setPage(apiPage);
          }
          setHasMore(Boolean(data.pagination?.hasMore));
        } else {
          setHasMore(false);
        }

        logger.info("Analysis results fetched", {
          component: "ResultsPageClient",
          analysisCount: data.analyses.length,
          fileCount: data.files.length,
          userId: selectedUserId || null,
          analysisId: selectedAnalysisId || null,
          page: effectivePage,
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
    },
    [hasLoadedOnce, page, selectedAnalysisId, selectedUserId, updateUrl],
  );

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
    } else {
      setAvailableAnalysisIds([]);
    }
  }, [selectedAnalysisId]);

  useEffect(() => {
    if (!selectedAnalysisId) {
      previousPageRef.current = page;
    }
  }, [page, selectedAnalysisId]);

  useEffect(() => {
    // データ取得が完了するまでは検証しない。
    if (!hasLoadedOnce || !selectedUserId) {
      return;
    }
    const hasUser = analyses.some((entry) => entry.userId === selectedUserId);
    if (!hasUser) {
      setSelectedUserId("");
      setSelectedAnalysisId("");
      return;
    }

    if (selectedAnalysisId) {
      const hasAnalysis = analyses.some(
        (entry) =>
          entry.userId === selectedUserId &&
          entry.analysisId === selectedAnalysisId,
      );
      if (!hasAnalysis) {
        setSelectedAnalysisId("");
      }
    }
  }, [analyses, hasLoadedOnce, selectedAnalysisId, selectedUserId]);

  const userOptions = useMemo<FilterOption[]>(() => {
    return availableUsers.map((value) => ({ label: value, value }));
  }, [availableUsers]);

  const analysisOptions = useMemo<FilterOption[]>(() => {
    return sortAnalysisIdsDesc([
      ...availableAnalysisIds,
      ...(selectedAnalysisId ? [selectedAnalysisId] : []),
    ]).map((value) => ({ label: value, value }));
  }, [availableAnalysisIds, selectedAnalysisId]);

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (selectedUserId && file.userId !== selectedUserId) {
        return false;
      }
      if (selectedAnalysisId && file.analysisId !== selectedAnalysisId) {
        return false;
      }
      return true;
    });
  }, [files, selectedAnalysisId, selectedUserId]);

  const filteredAnalyses = useMemo(() => {
    if (!selectedUserId) {
      return analyses;
    }
    return analyses.filter((entry) => entry.userId === selectedUserId);
  }, [analyses, selectedUserId]);

  const totalFileCount = filteredFiles.length;
  const totalSize = filteredFiles.reduce(
    (sum, file) => sum + (file.size ?? 0),
    0,
  );

  const showEmptyState =
    hasLoadedOnce &&
    !isLoading &&
    !error &&
    filteredAnalyses.length === 0 &&
    filteredFiles.length === 0;

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
    (row: Row<AnalysisResultSummary>) => {
      const summary = row.original;
      if (!summary) {
        return;
      }

      if (summary.userId !== selectedUserId) {
        userChangeSourceRef.current = "row";
        setSelectedUserId(summary.userId);
      }

      if (summary.analysisId !== selectedAnalysisId) {
        setSelectedAnalysisId(summary.analysisId);
      }

      previousPageRef.current = page;
      setPage(1);
      setAvailableAnalysisIds((prev) =>
        sortAnalysisIdsDesc([...prev, summary.analysisId]).slice(0, 200),
      );
      updateUrl(summary.userId, summary.analysisId, 1);
      setShouldAutoOpenModal(true);
    },
    [page, selectedAnalysisId, selectedUserId, updateUrl],
  );

  const selectedAnalysisSummary = useMemo(() => {
    if (!selectedAnalysisId) {
      return null;
    }

    return (
      analyses.find(
        (entry) =>
          entry.analysisId === selectedAnalysisId &&
          (!selectedUserId || entry.userId === selectedUserId),
      ) ?? null
    );
  }, [analyses, selectedAnalysisId, selectedUserId]);

  const analysisImagePairs = useMemo(() => {
    if (!selectedAnalysisId) {
      return [] as AnalysisImagePair[];
    }

    const directoryPairs = new Map<string, AnalysisImagePair>();

    for (const file of filteredFiles) {
      if (file.analysisId !== selectedAnalysisId) {
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
  }, [filteredFiles, selectedAnalysisId]);

  const openPreviewModal = useCallback(() => {
    setIsPreviewModalOpen(true);
  }, []);

  const closePreviewModal = useCallback(() => {
    setIsPreviewModalOpen(false);
    setShouldAutoOpenModal(false);
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
    if (selectedAnalysisId) {
      setIsPreviewModalOpen(true);
    }
    if (!isLoading && hasLoadedOnce) {
      setShouldAutoOpenModal(false);
    }
  }, [hasLoadedOnce, isLoading, selectedAnalysisId, shouldAutoOpenModal]);

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
    ColumnDef<AnalysisResultSummary, unknown>[]
  >(() => {
    const userMeta: CustomColumnMeta = {
      cellType: "text",
      filterVariant: "select",
      filterOptions: userOptions,
      filterPlaceholder: "ユーザーIDで絞り込み",
    };

    const columns: ColumnDef<AnalysisResultSummary, unknown>[] = [
      {
        accessorKey: "userId",
        header: "ユーザーID",
        enableColumnFilter: true,
        meta: userMeta,
      },
      {
        accessorKey: "analysisId",
        header: "解析ID",
        enableColumnFilter: true,
        meta: {
          cellType: "text",
          filterVariant: "text",
          filterPlaceholder: "解析IDで絞り込み",
        },
      },
      {
        accessorKey: "fileCount",
        header: "ファイル数",
        enableColumnFilter: false,
        meta: {
          cellType: "text",
        },
      },
      {
        accessorKey: "totalSize",
        header: "合計サイズ",
        cell: (context) => formatBytes(context.getValue<number>()),
        enableColumnFilter: false,
        meta: {
          cellType: "text",
        },
      },
      {
        accessorKey: "lastModified",
        header: "最終更新",
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
        accessorKey: "prefix",
        header: "S3プレフィックス",
        enableColumnFilter: false,
        meta: {
          cellType: "text",
          enableGlobalFilter: true,
        },
      },
    ];

    return columns;
  }, [dateFormatter, userOptions]);

  const isInitialLoading = !hasLoadedOnce && isLoading;
  const isRefreshing = hasLoadedOnce && isLoading;

  return (
    <div className={pageContainerClass}>
      <div className={headerContainerClass}>
        <div>
          <h1 className={pageTitleClass}>解析結果ブラウザー</h1>
          <p className={pageDescriptionClass}>
            S3バケット上の解析結果をフォルダ階層に基づいて表示します。ユーザーと解析IDで絞り込んで目的の結果を探せます。
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            void fetchData({ forceRefresh: true });
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
          <span className={summaryLabelClass}>対象ファイル数</span>
          <span className={summaryValueClass}>
            {totalFileCount.toLocaleString("ja-JP")}
          </span>
        </div>
        <div className={summaryCardClass}>
          <span className={summaryLabelClass}>対象サイズ</span>
          <span className={summaryValueClass}>{formatBytes(totalSize)}</span>
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
                {filteredAnalyses.length.toLocaleString("ja-JP")} 件
              </span>
            </div>
            <TanstackTable
              data={filteredAnalyses}
              columns={analysisTableColumns}
              isLoading={isLoading}
              onRowClick={handleAnalysisRowClick}
              rowSelectionMode="single"
              getRowId={(row) => `${row.userId}::${row.analysisId}`}
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
              {selectedAnalysisSummary ? (
                <span className={sectionCountBadgeClass}>
                  {selectedAnalysisSummary.analysisId}
                </span>
              ) : null}
            </div>
            {selectedAnalysisId ? (
              analysisImagePairs.length > 0 ? (
                <div className={previewLaunchContainerClass}>
                  <p className={previewLaunchMessageClass}>
                    {`${analysisImagePairs.length.toLocaleString("ja-JP")} 件のディレクトリで origin.png と segmentation.png の組み合わせが見つかりました。`}
                    <span className={previewLaunchHintClass}>
                      下のボタンからモーダル表示を開き、スクロールしながら確認できます。
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openPreviewModal}
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
            {selectedAnalysisSummary ? (
              <p className={modalSubtitleClass}>
                {`ユーザー ${selectedAnalysisSummary.userId} / 解析ID ${selectedAnalysisSummary.analysisId}`}
              </p>
            ) : null}
            {isLoading ? (
              <div className={modalInfoMessageClass}>
                プレビューを読み込み中です…
              </div>
            ) : analysisImagePairs.length > 0 ? (
              <div className={modalPairsContainerClass}>
                {analysisImagePairs.map((pair) => (
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
