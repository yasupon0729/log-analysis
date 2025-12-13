// src/app/annotation2/_types/index.ts

export interface CategoryDef {
  id: number;
  name: string;
  color: string;
  fill: string;
  isSystem?: boolean;
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {
    id: 1,
    name: "Default (Class 1)",
    color: "#06b6d4",
    fill: "rgba(6, 182, 212, 0.25)",
    isSystem: true,
  },
  {
    id: 999,
    name: "Remove (Trash)",
    color: "#dc2626",
    fill: "rgba(239, 68, 68, 0.35)",
    isSystem: true,
  },
];

export const PRESET_COLORS = [
  "#ef4444", // Red
  "#f97316", // Orange
  "#f59e0b", // Amber
  "#eab308", // Yellow
  "#84cc16", // Lime
  "#22c55e", // Green
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#6366f1", // Indigo
  "#a855f7", // Purple
  "#ec4899", // Pink
];

export function getCategoryMap(
  categories: CategoryDef[],
): Record<number, CategoryDef> {
  const map: Record<number, CategoryDef> = {};
  categories.forEach((c) => {
    map[c.id] = c;
  });
  return map;
}

// 汎用的な2次元座標点
export interface Point {
  x: number;
  y: number;
}

// 結合されたアノテーション領域データ
export interface AnnotationRegion {
  id: number;
  bbox: [number, number, number, number];
  points: Point[];
  metrics: Record<string, number>;
  isManualAdded?: boolean; // 手動追加された領域かどうか
  categoryId?: number; // クラスID (デフォルト: 1)
}

// 各メトリクスの統計情報
export interface MetricStat {
  key: string;
  min: number;
  max: number;
}

// COCO Format
export interface CocoImage {
  id: number;
  width: number;
  height: number;
  file_name: string;
}

export interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number];
  seg: number[][] | number[];
}

export interface CocoData {
  images: CocoImage[];
  annotations: CocoAnnotation[];
}

// --- Filter System v3 (Keep/Remove Explicit) ---

export type FilterAction = "keep" | "remove"; // 残す / 消す
export type FilterLogic = "AND" | "OR";

// 葉ノード: 単一条件
// 常に「指定範囲内 (min <= val <= max)」を「マッチ」とみなす。
// マッチした結果どうするか（残すか消すか）は、親グループの action で決まる。
export interface FilterCondition {
  id: string;
  type: "condition";
  metric: string;
  min: number;
  max: number;
  enabled: boolean;
}

// 枝ノード: グループ
export interface FilterGroup {
  id: string;
  type: "group";
  name?: string;
  action: FilterAction; // このグループの役割（マッチしたものをどうするか）
  logic: FilterLogic;   // 子要素の結合方法
  children: (FilterGroup | FilterCondition)[];
  enabled: boolean;
}

export type FilterNode = FilterGroup | FilterCondition;

export interface FilterConfig {
  version: 3;
  root: FilterGroup;
  maxDepth: number;
  excludedIds: number[];
}

export interface FilterPreset {
  id: string;
  name: string;
  config: FilterConfig;
}

export interface ClassificationRule {
  id: string;
  name: string;
  enabled: boolean;
  fromClass: number | "any";
  toClass: number;
  filter: FilterGroup;
}

export interface PipelineConfig {
  version: 1;
  rules: ClassificationRule[];
}
