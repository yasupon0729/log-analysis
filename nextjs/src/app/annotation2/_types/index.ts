// src/app/annotation2/_types/index.ts

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
