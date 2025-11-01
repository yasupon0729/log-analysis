"use client";

import { useId, useMemo } from "react";

import type { AnalysisTimelinePoint } from "@/lib/analysis-results/service";
import { css } from "@/styled-system/css";

interface UserTrendChartProps {
  data: AnalysisTimelinePoint[];
  title?: string;
}

const chartContainerClass = css({
  backgroundColor: "rgba(21, 30, 45, 0.6)",
  border: "thin",
  borderColor: "border.default",
  borderRadius: "lg",
  padding: 4,
  display: "flex",
  flexDirection: "column",
  gap: 3,
});

const chartTitleClass = css({
  fontSize: "sm",
  color: "text.muted",
});

const chartSvgClass = css({
  width: "100%",
  height: "200px",
});

const axisLabelClass = css({
  fontSize: "10px",
  fill: "#94a3b8",
});

const emptyStateClass = css({
  fontSize: "sm",
  color: "text.muted",
});

export function UserTrendChart({
  data,
  title = "解析数の推移",
}: UserTrendChartProps) {
  const gradientId = useId();
  const chart = useMemo(() => buildChartPath(data), [data]);

  const maxCount = useMemo(() => {
    return data.reduce(
      (max, item) => (item.analysisCount > max ? item.analysisCount : max),
      0,
    );
  }, [data]);

  if (!data.length) {
    return (
      <div className={chartContainerClass}>
        <span className={chartTitleClass}>{title}</span>
        <p className={emptyStateClass}>表示できるデータがありません。</p>
      </div>
    );
  }

  return (
    <div className={chartContainerClass}>
      <span className={chartTitleClass}>{title}</span>
      <svg
        className={chartSvgClass}
        viewBox="0 0 600 220"
        role="img"
        aria-label="解析数の推移グラフ"
      >
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1f2937" stopOpacity="0" />
        </linearGradient>
        {chart ? (
          <>
            <path
              d={chart.areaPath}
              fill={`url(#${gradientId})`}
              stroke="none"
            />
            <path
              d={chart.linePath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {chart.points.map((point) => (
              <circle
                key={point.value.date}
                cx={point.x}
                cy={point.y}
                r={4}
                fill="#38bdf8"
                opacity={0.9}
              >
                <title>
                  {`${point.value.date}: ${point.value.analysisCount.toLocaleString("ja-JP")}枚`}
                </title>
              </circle>
            ))}
            {chart.labels.map((label) => (
              <text
                key={label.x}
                x={label.x}
                y={label.y}
                fill="#94a3b8"
                fontSize="10"
                textAnchor="middle"
              >
                {label.text}
              </text>
            ))}
            <text x={20} y={20} className={axisLabelClass} textAnchor="start">
              枚数
            </text>
            <text x={20} y={40} className={axisLabelClass} textAnchor="start">
              最大: {maxCount.toLocaleString("ja-JP")}枚
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
}

function buildChartPath(data: AnalysisTimelinePoint[]) {
  if (data.length === 0) {
    return null;
  }

  const width = 560;
  const height = 160;
  const offsetX = 20;
  const offsetY = 30;
  const usableWidth = width - offsetX * 2;
  const usableHeight = height - offsetY * 2;

  const maxCount = Math.max(...data.map((item) => item.analysisCount || 0), 1);
  const step = data.length > 1 ? usableWidth / (data.length - 1) : 0;

  const points = data.map((item, index) => {
    const x = offsetX + index * step;
    const ratio = item.analysisCount / maxCount;
    const y = height - offsetY - ratio * usableHeight;
    return { x, y, value: item };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  const areaPath = `${linePath} L${offsetX + (data.length - 1) * step},${height - offsetY} L${offsetX},${height - offsetY} Z`;

  const labels = calculateLabels(data, points, height);

  return { linePath, areaPath, points, labels };
}

function calculateLabels(
  data: AnalysisTimelinePoint[],
  points: Array<{ x: number; y: number }>,
  chartHeight: number,
) {
  const labels: Array<{ x: number; y: number; text: string }> = [];
  const total = data.length;
  const labelIndexes = new Set<number>();

  if (total <= 4) {
    for (let index = 0; index < total; index += 1) {
      labelIndexes.add(index);
    }
  } else {
    labelIndexes.add(0);
    labelIndexes.add(total - 1);
    const middle = Math.floor(total / 2);
    labelIndexes.add(middle);
    if (total > 6) {
      labelIndexes.add(Math.floor(total / 3));
      labelIndexes.add(Math.floor((total * 2) / 3));
    }
  }

  for (const index of labelIndexes) {
    const point = points[index];
    const label = data[index];
    labels.push({
      x: point.x,
      y: chartHeight - 8,
      text: label.date,
    });
  }

  return labels;
}
