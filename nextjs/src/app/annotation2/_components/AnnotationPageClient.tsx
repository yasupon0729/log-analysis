"use client";

import { useMemo, useState, useTransition } from "react";
import { css } from "../../../../styled-system/css";
import type { AnnotationRegion, MetricStat } from "../_types";
import { saveRemovedAnnotations } from "../actions";
import { CanvasLayer } from "./CanvasLayer";
import { ControlPanel } from "./ControlPanel";

interface AnnotationPageClientProps {
  initialRegions: AnnotationRegion[];
  stats: MetricStat[];
  imageUrl: string;
  initialRemovedIds?: number[]; // 初期ロード時の削除済みID
}

export function AnnotationPageClient({
  initialRegions,
  stats,
  imageUrl,
  initialRemovedIds = [],
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

  // フィルタ状態: 各メトリクスキーに対する [min, max] の範囲を管理
  const [filters, setFilters] = useState<Record<string, [number, number]>>({});

  // フィルタリングロジック: filtersの状態に基づいて、非表示にする領域のIDを計算
  const filteredIds = useMemo(() => {
    const ids = new Set<number>();

    // フィルタが一つも設定されていなければ、何もフィルタリングしない (空のSetを返す)
    if (Object.keys(filters).length === 0) return ids;

    for (const region of initialRegions) {
      let isFiltered = false; // この領域がフィルタリングされるべきか
      for (const [key, [min, max]] of Object.entries(filters)) {
        const val = region.metrics[key];
        // 値が存在しない、または範囲外なら、この領域はフィルタリング対象
        if (val === undefined || val < min || val > max) {
          isFiltered = true;
          break; // いずれかのフィルタ条件に合致すれば、その領域はフィルタされる
        }
      }
      if (isFiltered) {
        ids.add(region.id); // フィルタ対象のIDをSetに追加
      }
    }
    return ids;
  }, [initialRegions, filters]); // initialRegionsまたはfiltersが変更されたら再計算

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
      // トグル動作にするか、一括削除にするか。
      // 範囲選択は「選択」なので、ここでは「範囲内のIDを全て反転（トグル）」させる。
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

  // ControlPanelからのフィルタ変更イベントハンドラ
  const handleFilterChange = (key: string, min: number, max: number) => {
    setFilters((prev) => {
      // フィルタがデフォルト値に戻された場合、フィルタリストから削除してパフォーマンスを最適化
      const stat = stats.find((s) => s.key === key);
      if (stat && min === stat.min && max === stat.max) {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      }
      return {
        ...prev,
        [key]: [min, max],
      };
    });
  };

  // 保存ボタンのハンドラ
  const handleSave = () => {
    setSaveMessage(null);
    startTransition(async () => {
      const result = await saveRemovedAnnotations(Array.from(removedIds));
      setSaveMessage({
        type: result.success ? "success" : "error",
        text: result.message,
      });

      // 成功メッセージは数秒後に消す
      if (result.success) {
        setTimeout(() => setSaveMessage(null), 3000);
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
        {/* Header Save Button (Optional placement) */}
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
            width={1200} // TODO: 画像の実際のサイズを動的に取得する
            height={900} // TODO: 同上
            regions={initialRegions}
            filteredIds={filteredIds} // 計算されたフィルタリングIDを渡す
            removedIds={removedIds} // 削除済みIDを渡す
            hoveredId={hoveredId} // ホバーIDを渡す
            onHover={setHoveredId} // ホバーイベントハンドラを渡す
            onClick={handleRegionClick} // クリックイベントハンドラを渡す
            onRangeSelect={handleRangeSelect} // 範囲選択ハンドラを渡す
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
              {isSaving ? "保存中..." : "変更を保存 (remove.json)"}
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
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </div>
      </div>
    </div>
  );
}
