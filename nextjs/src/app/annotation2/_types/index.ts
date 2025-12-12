// src/app/annotation2/_types/index.ts
//
// このファイルは、annotation2アプリケーション全体で利用される型定義を管理します。
// 主に以下のファイルから参照・利用されます:
// - src/app/annotation2/_lib/data-loader.ts: データのロードと結合時にこれらの型に変換します。
// - src/app/annotation2/_components/AnnotationPageClient.tsx: クライアントコンポーネントのPropsや内部Stateとして利用されます。
// - src/app/annotation2/_components/CanvasLayer.tsx: 描画対象のアノテーションデータの型として利用されます。
// - src/app/annotation2/_components/ControlPanel.tsx: フィルタリング対象のメトリクス情報の型として利用されます。
// - src/app/annotation2/page.tsx: サーバーコンポーネントがクライアントコンポーネントに渡すデータの型として利用されます。

// 汎用的な2次元座標点
export interface Point {
  x: number;
  y: number;
}

// 結合されたアノテーション領域データ
// COCOデータとCSVメトリクスデータを統合した形で、クライアント側での表示・操作に使用されます。
export interface AnnotationRegion {
  id: number; // CSVおよびCOCOアノテーションのIDと一致
  bbox: [number, number, number, number]; // [x, y, width, height]
  points: Point[]; // ポリゴンの頂点座標の配列。描画用。
  metrics: Record<string, number>; // CSVからの全てのメトリクスデータ。キーはCSVヘッダー名。
}

// 各メトリクス（例: 面積、円相当径など）の統計情報
// フィルタリングのスライダーの範囲設定などに利用されます。
export interface MetricStat {
  key: string; // メトリクスの名前（例: "面積(μm)^2"）
  min: number; // そのメトリクスの最小値
  max: number; // そのメトリクスの最大値
}

// COCO Format (segmentation.json) の型定義
// data-loader.ts でJSONファイルをパースする際に利用されます。
export interface CocoImage {
  id: number;
  width: number;
  height: number;
  file_name: string;
}

// COCOアノテーションの基本情報
export interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  // segは多角形の頂点座標リスト。
  // サンプルデータは [[x1, y1, x2, y2, ...]] の形式ですが、
  // 他のCOCOデータでは [x1, y1, x2, y2, ...] の1次元配列の場合もあるため、
  // data-loader側で柔軟に処理できるようにします。
  seg: number[][] | number[];
}

// COCO JSON全体の構造
export interface CocoData {
  images: CocoImage[];
  annotations: CocoAnnotation[];
  // categories, licenses など、利用しないフィールドは省略
}

// フィルタールールの定義
// スタック型のフィルター設定で使用されます。
export interface FilterRule {
  id: string; // ルールを一意に識別するID (UI操作用: Date.now()等で生成)
  metric: string; // 対象メトリクス (MetricStat.key)
  mode: "include" | "exclude"; // "include": 範囲内を表示(範囲外を除外), "exclude": 範囲内を除外(範囲外を表示)
  min: number; // 範囲の最小値
  max: number; // 範囲の最大値
  enabled: boolean; // このルールが有効かどうか
}

// 保存用JSON (filtered.json) の構造
export interface FilterConfig {
  version: number;
  rules: FilterRule[];
  excludedIds: number[]; // このルールセットによって最終的に除外されたIDのリスト
}