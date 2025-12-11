"use client";

// src/app/annotation2/_components/AnnotationPageClient.tsx
//
// このファイルは、annotation2アプリケーションのクライアントサイドのエントリーポイントです。
// page.tsx (Server Component) から初期データを受け取り、
// アノテーションの描画、インタラクション、フィルタリングなどのロジックを管理します。
//
// 関連ファイル:
// - src/app/annotation2/page.tsx: このコンポーネントにデータを渡します。
// - src/app/annotation2/_components/CanvasLayer.tsx: 実際にアノテーションを描画します。
// - src/app/annotation2/_components/ControlPanel.tsx: フィルタリングUIを提供します。
// - src/app/annotation2/_types/index.ts: Propsとして受け取るデータの型定義を提供します。

import { useMemo, useState } from "react";
import { css } from "../../../../styled-system/css";
import type { AnnotationRegion, MetricStat } from "../_types";
import { CanvasLayer } from "./CanvasLayer";
import { ControlPanel } from "./ControlPanel";

interface AnnotationPageClientProps {
  initialRegions: AnnotationRegion[];
  stats: MetricStat[];
  imageBase64: string;
}

export function AnnotationPageClient({
  initialRegions,
  stats,
  imageBase64,
}: AnnotationPageClientProps) {
  // ユーザーによって手動で削除された領域のIDを管理
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  // 現在マウスがホバーしている領域のIDを管理
  const [hoveredId, setHoveredId] = useState<number | null>(null);

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

  return (
    <div
      className={css({ padding: "8", maxWidth: "1600px", margin: "0 auto" })}
    >
      <h1
        className={css({
          fontSize: "2xl",
          fontWeight: "bold",
          marginBottom: "6",
        })}
      >
        Annotation Tool V2
      </h1>

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
            imageSrc={`data:image/png;base64,${imageBase64}`}
            width={1200} // TODO: 画像の実際のサイズを動的に取得する
            height={900} // TODO: 同上
            regions={initialRegions}
            filteredIds={filteredIds} // 計算されたフィルタリングIDを渡す
            removedIds={removedIds} // 削除済みIDを渡す
            hoveredId={hoveredId} // ホバーIDを渡す
            onHover={setHoveredId} // ホバーイベントハンドラを渡す
            onClick={handleRegionClick} // クリックイベントハンドラを渡す
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
