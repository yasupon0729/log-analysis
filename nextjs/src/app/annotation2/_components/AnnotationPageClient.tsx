"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { css } from "../../../../styled-system/css";
import { createDefaultConfig, evaluateFilter } from "../_lib/filter-utils";
import type {
  AnnotationRegion,
  FilterConfig,
  FilterGroup,
  MetricStat,
} from "../_types";
import { saveFilterConfig, saveRemovedAnnotations } from "../actions";
import { CanvasLayer } from "./CanvasLayer";
import { ControlPanel } from "./ControlPanel";

interface AnnotationPageClientProps {
  initialRegions: AnnotationRegion[];
  stats: MetricStat[];
  imageUrl: string;
  initialRemovedIds?: number[]; // 初期ロード時の削除済みID
  initialFilterConfig?: FilterConfig | null; // 初期ロード時のフィルタ設定
}

export function AnnotationPageClient({
  initialRegions,
  stats,
  imageUrl,
  initialRemovedIds = [],
  initialFilterConfig = null,
}: AnnotationPageClientProps) {
  // ユーザーによって手動で削除された領域のIDを管理
  const [removedIds, setRemovedIds] = useState<Set<number>>(
    new Set(initialRemovedIds),
  );
  // 現在マウスがホバーしている領域のIDを管理
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // 保存処理の状態管理
  const [isSaving, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // フィルタ設定の状態管理 (v2 -> v3)
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(() => {
    if (initialFilterConfig && initialFilterConfig.version === 3) {
      return initialFilterConfig;
    }
    return createDefaultConfig();
  });

  // 初期設定の同期
  useEffect(() => {
    if (initialFilterConfig && initialFilterConfig.version === 3) {
      console.log("[AnnotationPageClient] Applying initial filter config v3");
      setFilterConfig(initialFilterConfig);
    }
  }, [initialFilterConfig]);

  // フィルタリングロジック (再帰評価)
  const filteredIds = useMemo(() => {
    const ids = new Set<number>();

    // Rootが無効ならフィルタリングなし
    if (!filterConfig.root.enabled) return ids;

    for (const region of initialRegions) {
      // Rootグループから評価開始
      // evaluateFilter: true = Pass (表示), false = Block (除外)
      // したがって、false の場合に filteredIds に追加する
      if (!evaluateFilter(filterConfig.root, region)) {
        ids.add(region.id);
      }
    }
    return ids;
  }, [initialRegions, filterConfig]);

  // クリックされた領域のIDをremovedIdsに追加または削除するハンドラ
  const handleRegionClick = (id: number) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id); // 既に削除済みなら元に戻す
      } else {
        next.add(id); // 未削除なら削除リストに追加
      }
      return next;
    });
  };

  // 範囲選択で指定されたIDリストを一括削除（または復元）するハンドラ
  const handleRangeSelect = (ids: number[]) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  };

  // フィルタ設定更新ハンドラ
  const handleUpdateRoot = (newRoot: FilterGroup) => {
    setFilterConfig((prev) => ({ ...prev, root: newRoot }));
  };

  // 保存ボタンのハンドラ
  const handleSave = () => {
    setSaveMessage(null);
    startTransition(async () => {
      // 1. 手動削除IDの保存 (remove.json)
      const removeResult = await saveRemovedAnnotations(Array.from(removedIds));

      // 2. フィルタ設定と除外IDの保存 (filtered.json)
      const configToSave: FilterConfig = {
        ...filterConfig,
        excludedIds: Array.from(filteredIds),
      };
      const filterResult = await saveFilterConfig(configToSave);

      if (removeResult.success && filterResult.success) {
        setSaveMessage({
          type: "success",
          text: "保存しました (remove.json & filtered.json)",
        });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const errorMsgs = [];
        if (!removeResult.success) errorMsgs.push(removeResult.message);
        if (!filterResult.success) errorMsgs.push(filterResult.message);
        setSaveMessage({
          type: "error",
          text: `保存失敗: ${errorMsgs.join(", ")}`,
        });
      }
    });
  };

  return (
    <div
      className={css({ padding: "8", maxWidth: "1600px", margin: "0 auto" })}
    >
      <div
        className={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6",
        })}
      >
        <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>
          Annotation Tool V2 (Recursive Filter)
        </h1>
      </div>

      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "1fr 400px", // パネルを少し広くする
          gap: "8",
          alignItems: "start",
        })}
      >
        {/* Main Canvas Area */}
        <div
          className={css({
            backgroundColor: "gray.50",
            padding: "4",
            borderRadius: "xl",
            border: "1px solid token(colors.gray.200)",
          })}
        >
          <CanvasLayer
            imageSrc={imageUrl}
            width={1200}
            height={900}
            regions={initialRegions}
            filteredIds={filteredIds}
            removedIds={removedIds}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onClick={handleRegionClick}
            onRangeSelect={handleRangeSelect}
          />
          <div
            className={css({
              marginTop: "4",
              fontSize: "sm",
              color: "gray.600",
            })}
          >
            Total Regions: {initialRegions.length} | Filtered:{" "}
            {filteredIds.size} | Removed: {removedIds.size}
          </div>
        </div>

        {/* Sidebar Controls */}
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "6",
          })}
        >
          {/* 保存エリア */}
          <div
            className={css({
              padding: "4",
              backgroundColor: "white",
              borderRadius: "xl",
              border: "1px solid token(colors.gray.200)",
              boxShadow: "sm",
            })}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={css({
                width: "100%",
                padding: "3",
                backgroundColor: isSaving ? "gray.400" : "blue.600",
                color: "white",
                borderRadius: "md",
                fontWeight: "semibold",
                cursor: isSaving ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
                "&:hover": {
                  backgroundColor: isSaving ? "gray.400" : "blue.700",
                },
              })}
            >
              {isSaving
                ? "保存中..."
                : "変更を保存 (remove.json & filtered.json)"}
            </button>
            {saveMessage && (
              <div
                className={css({
                  marginTop: "3",
                  fontSize: "sm",
                  color:
                    saveMessage.type === "success" ? "green.600" : "red.600",
                  fontWeight: "medium",
                  textAlign: "center",
                })}
              >
                {saveMessage.text}
              </div>
            )}
          </div>

          <ControlPanel
            stats={stats}
            rootGroup={filterConfig.root}
            maxDepth={filterConfig.maxDepth}
            onUpdateRoot={handleUpdateRoot}
          />
        </div>
      </div>
    </div>
  );
}