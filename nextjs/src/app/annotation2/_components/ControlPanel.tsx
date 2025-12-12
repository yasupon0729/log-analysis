"use client";

import { css } from "../../../../styled-system/css";
import type { FilterRule, MetricStat } from "../_types";

interface ControlPanelProps {
  stats: MetricStat[]; // 各メトリクスの統計情報 (min/max値を含む)
  rules: FilterRule[]; // 現在適用されているフィルタールールのリスト (Stack)
  onAddRule: (metric: string) => void; // ルール追加時のコールバック
  onUpdateRule: (rule: FilterRule) => void; // ルール更新時のコールバック
  onRemoveRule: (id: string) => void; // ルール削除時のコールバック
}

export function ControlPanel({
  stats,
  rules,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
}: ControlPanelProps) {
  return (
    <div
      className={css({
        backgroundColor: "gray.900", // ダークテーマ背景
        color: "gray.100", // 明るいテキスト
        padding: "6",
        borderRadius: "xl",
        border: "1px solid token(colors.gray.700)",
        boxShadow: "lg",
        maxHeight: "800px",
        overflowY: "auto",
        position: "sticky",
        top: "4",
      })}
    >
      <div className={css({ marginBottom: "6" })}>
        <h2
          className={css({
            fontSize: "lg",
            fontWeight: "semibold",
            marginBottom: "3",
            color: "white",
          })}
        >
          Filters
        </h2>
        {/* 新規ルール追加用ドロップダウン */}
        <select
          className={selectStyle}
          onChange={(e) => {
            if (e.target.value) {
              onAddRule(e.target.value);
              e.target.value = ""; // Reset
            }
          }}
          defaultValue=""
        >
          <option value="" disabled>
            + Add Filter Rule...
          </option>
          {stats.map((s) => (
            <option key={s.key} value={s.key}>
              {s.key}
            </option>
          ))}
        </select>
      </div>

      <div
        className={css({ display: "flex", flexDirection: "column", gap: "4" })}
      >
        {rules.map((rule) => {
          const stat = stats.find((s) => s.key === rule.metric);
          if (!stat) return null;
          // スライダーのステップを細かくして、保存された精密な値を再現できるようにする
          const step = (stat.max - stat.min) / 1000;

          return (
            <div
              key={rule.id}
              className={css({
                padding: "4",
                borderRadius: "lg",
                border: "1px solid",
                borderColor: "gray.700",
                backgroundColor: rule.enabled ? "gray.800" : "gray.900",
                opacity: rule.enabled ? 1 : 0.6,
                transition: "all 0.2s",
                "&:hover": {
                  borderColor: "blue.500",
                },
              })}
            >
              {/* Header */}
              <div
                className={css({
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "3",
                })}
              >
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "2",
                  })}
                >
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) =>
                      onUpdateRule({ ...rule, enabled: e.target.checked })
                    }
                    className={css({
                      cursor: "pointer",
                      accentColor: "blue.500",
                    })}
                  />
                  <span
                    className={css({
                      fontWeight: "bold",
                      fontSize: "sm",
                      color: "gray.200",
                    })}
                  >
                    {rule.metric}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveRule(rule.id)}
                  className={css({
                    color: "gray.500",
                    fontSize: "lg",
                    lineHeight: "1",
                    padding: "1",
                    cursor: "pointer",
                    transition: "color 0.2s",
                    "&:hover": { color: "red.400" },
                  })}
                >
                  ×
                </button>
              </div>

              {/* Mode Selection */}
              <div className={css({ marginBottom: "4" })}>
                <select
                  value={rule.mode}
                  onChange={(e) =>
                    onUpdateRule({
                      ...rule,
                      mode: e.target.value as "include" | "exclude",
                    })
                  }
                  className={selectStyle}
                >
                  <option value="include">Include (範囲内を残す)</option>
                  <option value="exclude">Exclude (範囲内を除外)</option>
                </select>
              </div>

              {/* Slider */}
              <div className={css({ marginBottom: "4", paddingX: "1" })}>
                <DoubleRangeSlider
                  min={stat.min}
                  max={stat.max}
                  step={step}
                  value={[rule.min, rule.max]}
                  onChange={(newMin, newMax) => {
                    onUpdateRule({ ...rule, min: newMin, max: newMax });
                  }}
                />
              </div>

              {/* Range Inputs (Manual Edit) */}
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "2",
                })}
              >
                <input
                  type="number"
                  value={rule.min.toFixed(2)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!isNaN(v)) {
                      onUpdateRule({ ...rule, min: v });
                    }
                  }}
                  className={inputStyle}
                />
                <span className={css({ color: "gray.500" })}>-</span>
                <input
                  type="number"
                  value={rule.max.toFixed(2)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!isNaN(v)) {
                      onUpdateRule({ ...rule, max: v });
                    }
                  }}
                  className={inputStyle}
                />
              </div>
              <div
                className={css({
                  fontSize: "xs",
                  color: "gray.500",
                  marginTop: "1",
                  textAlign: "right",
                })}
              >
                Max range: {stat.min.toFixed(2)} - {stat.max.toFixed(2)}
              </div>
            </div>
          );
        })}
        {rules.length === 0 && (
          <div
            className={css({
              textAlign: "center",
              color: "gray.500",
              fontSize: "sm",
              padding: "4",
              border: "1px dashed token(colors.gray.700)",
              borderRadius: "lg",
            })}
          >
            No active filters.
          </div>
        )}
      </div>
    </div>
  );
}

// 内部コンポーネント: ダブルレンジスライダー
function DoubleRangeSlider({
  min,
  max,
  value, // [min, max]
  onChange,
  step,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (min: number, max: number) => void;
  step: number;
}) {
  const [minVal, maxVal] = value;
  const range = max - min || 1; // 0除算防止

  // パーセント計算
  const getPercent = (v: number) => ((v - min) / range) * 100;

  return (
    <div
      className={css({
        position: "relative",
        height: "6",
        width: "100%",
        display: "flex",
        alignItems: "center",
      })}
    >
      {/* 視覚的なトラック (背景) */}
      <div
        className={css({
          position: "absolute",
          width: "100%",
          height: "4px",
          backgroundColor: "gray.700",
          borderRadius: "full",
          zIndex: 0,
        })}
      />

      {/* 選択範囲のハイライト */}
      <div
        className={css({
          position: "absolute",
          height: "4px",
          backgroundColor: "blue.500",
          borderRadius: "full",
          zIndex: 0,
        })}
        style={{
          left: `${Math.max(0, Math.min(100, getPercent(minVal)))}%`,
          width: `${Math.max(
            0,
            Math.min(100, getPercent(maxVal) - getPercent(minVal)),
          )}%`,
        }}
      />

      {/* 左ハンドル (Min) */}
      <input
        type="range"
        min={min}
        max={max}
        value={minVal}
        step={step}
        onChange={(e) => {
          const v = Math.min(Number(e.target.value), maxVal - step);
          onChange(v, maxVal);
        }}
        className={rangeInputStyle}
      />

      {/* 右ハンドル (Max) */}
      <input
        type="range"
        min={min}
        max={max}
        value={maxVal}
        step={step}
        onChange={(e) => {
          const v = Math.max(Number(e.target.value), minVal + step);
          onChange(minVal, v);
        }}
        className={rangeInputStyle}
      />
    </div>
  );
}

// Styles
const inputStyle = css({
  width: "100%",
  padding: "2",
  borderRadius: "md",
  border: "1px solid token(colors.gray.700)",
  fontSize: "sm",
  backgroundColor: "gray.800",
  color: "white",
  "&:focus": {
    outline: "none",
    borderColor: "blue.500",
    boxShadow: "0 0 0 1px token(colors.blue.500)",
  },
});

const selectStyle = css({
  width: "100%",
  padding: "2",
  borderRadius: "md",
  border: "1px solid token(colors.gray.700)",
  fontSize: "sm",
  backgroundColor: "gray.800",
  color: "white",
  cursor: "pointer",
  "&:focus": {
    outline: "none",
    borderColor: "blue.500",
  },
});

const rangeInputStyle = css({
  position: "absolute",
  width: "100%",
  pointerEvents: "none", // 下の要素もクリック可能に
  appearance: "none",
  background: "transparent",
  zIndex: 1,
  margin: 0,

  "&::-webkit-slider-thumb": {
    pointerEvents: "auto",
    appearance: "none",
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    backgroundColor: "white",
    border: "2px solid token(colors.blue.500)",
    cursor: "grab",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    "&:active": { cursor: "grabbing" },
  },
  "&::-moz-range-thumb": {
    pointerEvents: "auto",
    appearance: "none",
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    backgroundColor: "white",
    border: "2px solid token(colors.blue.500)",
    cursor: "grab",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    "&:active": { cursor: "grabbing" },
  },
});