"use client";

// src/app/annotation2/_components/ControlPanel.tsx
//
// このファイルは、アノテーション領域のフィルタリングを行うためのUIコンポーネントです。
// 各メトリクス（CSVから取得）に対応する範囲スライダーまたは数値入力フィールドを提供します。
//
// 関連ファイル:
// - src/app/annotation2/_components/AnnotationPageClient.tsx: フィルタリングの状態を管理し、このコンポーネントにPropsとして渡します。
// - src/app/annotation2/_types/index.ts: フィルタリング対象となるメトリクス統計情報の型定義を利用します。

import { css } from "../../../../styled-system/css";
import type { MetricStat } from "../_types";

interface ControlPanelProps {
  stats: MetricStat[]; // 各メトリクスの統計情報 (min/max値を含む)
  filters: Record<string, [number, number]>; // 現在のフィルタリング範囲 { "メトリクス名": [min, max] }
  onFilterChange: (key: string, min: number, max: number) => void; // フィルタ変更時のコールバック
}

export function ControlPanel({
  stats,
  filters,
  onFilterChange,
}: ControlPanelProps) {
  return (
    <div
      className={css({
        backgroundColor: "white",
        padding: "6",
        borderRadius: "xl",
        border: "1px solid token(colors.gray.200)",
        boxShadow: "sm",
        maxHeight: "800px", // スクロール可能にするため
        overflowY: "auto",
        position: "sticky", // スクロールしても追従
        top: "4", // 上からのオフセット
      })}
    >
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          marginBottom: "4",
        })}
      >
        Filters
      </h2>

      <div
        className={css({ display: "flex", flexDirection: "column", gap: "6" })}
      >
        {/* 各メトリクスに対応するフィルタUIを生成 */}
        {stats.map((stat) => {
          // 現在のフィルタリング範囲を取得、なければ統計情報のmin/maxをデフォルトとする
          const currentFilter = filters[stat.key];
          const currentMin = currentFilter ? currentFilter[0] : stat.min;
          const currentMax = currentFilter ? currentFilter[1] : stat.max;

          return (
            <div
              key={stat.key}
              className={css({
                borderBottom: "1px solid token(colors.gray.100)",
                paddingBottom: "4",
              })}
            >
              <label
                htmlFor={`min-${stat.key}`}
                className={css({
                  display: "block",
                  fontSize: "sm",
                  fontWeight: "medium",
                  marginBottom: "2",
                  color: "gray.800",
                })}
              >
                {stat.key}
              </label>
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "2",
                })}
              >
                {/* 最小値入力フィールド */}
                <input
                  id={`min-${stat.key}`}
                  type="number"
                  className={inputStyle}
                  value={currentMin.toFixed(2)} // 小数点以下2桁で表示
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onFilterChange(stat.key, val, currentMax);
                  }}
                  step={(stat.max - stat.min) / 100} // スライダーのステップ幅
                />
                <span className={css({ color: "gray.400" })}>-</span>
                {/* 最大値入力フィールド */}
                <input
                  id={`max-${stat.key}`}
                  type="number"
                  className={inputStyle}
                  value={currentMax.toFixed(2)} // 小数点以下2桁で表示
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onFilterChange(stat.key, currentMin, val);
                  }}
                  step={(stat.max - stat.min) / 100} // スライダーのステップ幅
                />
              </div>
              <div
                className={css({
                  fontSize: "xs",
                  color: "gray.500",
                  marginTop: "1",
                })}
              >
                {`統計範囲: ${stat.min.toFixed(2)} - ${stat.max.toFixed(2)}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 入力フィールドのPanda CSSスタイル定義
const inputStyle = css({
  width: "100%",
  padding: "2",
  borderRadius: "md",
  border: "1px solid token(colors.gray.300)",
  fontSize: "sm",
  "&:focus": {
    outline: "none",
    borderColor: "blue.500",
    boxShadow: "0 0 0 1px token(colors.blue.500)",
  },
});
