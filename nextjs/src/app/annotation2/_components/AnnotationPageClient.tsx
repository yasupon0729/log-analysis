"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { css } from "../../../../styled-system/css";
import type { AnnotationRegion, FilterConfig, FilterRule, MetricStat } from "../_types";
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

  // フィルタ状態: フィルタールールのスタック
  const [rules, setRules] = useState<FilterRule[]>(
    initialFilterConfig?.rules || [],
  );

  // 初期設定の同期 (確実に反映させるため)
  // サーバーコンポーネントから渡された初期設定があれば、それを適用する
  useEffect(() => {
    if (initialFilterConfig?.rules) {
      console.log("[AnnotationPageClient] Applying initial filter config:", initialFilterConfig.rules);
      setRules(initialFilterConfig.rules);
    }
  }, [initialFilterConfig]);

  // フィルタリングロジック
  const filteredIds = useMemo(() => {
    const ids = new Set<number>();
    const activeRules = rules.filter((r) => r.enabled);

    // 有効なルールがなければ、フィルタリングなし
    if (activeRules.length === 0) return ids;

    for (const region of initialRegions) {
      let isFiltered = false;

      for (const rule of activeRules) {
        const val = region.metrics[rule.metric];
        if (val === undefined) continue;

        if (rule.mode === "include") {
          // "include" (範囲内を残す) -> 範囲外なら除外
          if (val < rule.min || val > rule.max) {
            isFiltered = true;
            break;
          }
        } else {
          // "exclude" (範囲内を除外) -> 範囲内なら除外
          if (val >= rule.min && val <= rule.max) {
            isFiltered = true;
            break;
          }
        }
      }

      if (isFiltered) {
        ids.add(region.id);
      }
    }
    return ids;
  }, [initialRegions, rules]);

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

  // ルール追加ハンドラ
  const handleAddRule = (metricKey: string) => {
    const stat = stats.find((s) => s.key === metricKey);
    if (!stat) return;

    const newRule: FilterRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      metric: metricKey,
      mode: "include", // デフォルトは「範囲内を表示」
      min: stat.min,
      max: stat.max,
      enabled: true,
    };
    // 新しいルールをスタックの一番上に追加
    setRules((prev) => [newRule, ...prev]);
  };

  // ルール更新ハンドラ
  const handleUpdateRule = (updatedRule: FilterRule) => {
    setRules((prev) =>
      prev.map((r) => (r.id === updatedRule.id ? updatedRule : r)),
    );
  };

  // ルール削除ハンドラ
  const handleRemoveRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  // 保存ボタンのハンドラ
  const handleSave = () => {
    setSaveMessage(null);
    startTransition(async () => {
      // 1. 手動削除IDの保存 (remove.json)
      const removeResult = await saveRemovedAnnotations(Array.from(removedIds));

      // 2. フィルタ設定と除外IDの保存 (filtered.json)
      const filterResult = await saveFilterConfig({
        version: 1,
        rules,
        excludedIds: Array.from(filteredIds),
      });

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
          Annotation Tool V2
        </h1>
      </div>

      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "1fr 350px", // 左: Canvas, 右: ControlPanel
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
              {isSaving ? "保存中..." : "変更を保存 (remove.json & filtered.json)"}
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
            rules={rules}
            onAddRule={handleAddRule}
            onUpdateRule={handleUpdateRule}
            onRemoveRule={handleRemoveRule}
          />
        </div>
      </div>
    </div>
  );
}
