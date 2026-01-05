# annotation2 入出力データ仕様（現行実装）

対象: `src/app/annotation2`

`annotation2` は「画像 + セグメンテーション領域（JSON）+ メトリクス（CSV）」を読み込み、フィルタ・分類ルール・手動修正を通して **領域ごとのクラス分類** を行うツールです。  
本ドキュメントは、型調整（TypeScript / JSON 仕様のすり合わせ）の前提として、入出力ファイルの **役割** と **想定スキーマ** を整理します。

---

## 1. データセットと配置場所

### 1.1. 入力ルート

入力ルートは `src/app/annotation2/input/` です（`_lib/dataset-service.ts`）。

複数データセット対応の標準構成:

- `src/app/annotation2/input/segmentation_outputs/<datasetId>/segmentation.json`
- `src/app/annotation2/input/csv_outputs/<datasetId>/result.csv`
- `src/app/annotation2/input/original_images/<datasetId>.png`

旧単一ファイル構成（fallback）:

- `src/app/annotation2/input/segmentation.json`
- `src/app/annotation2/input/result.csv`
- `src/app/annotation2/input/origin.png`

`datasetId` は `segmentation_outputs/*/segmentation.json` の存在から列挙され、`/annotation2?dataset=<datasetId>` で切り替えます。

### 1.2. 出力（作業領域 / 永続化）

出力（UI 操作により保存される状態ファイル）は、データセットごとに次へ保存されます（`actions.ts`）。

- `src/app/annotation2/input/work/<datasetId>/`

本ドキュメントで扱う出力ファイル:

- `additions.json`
- `categories.json`
- `classification.json`
- `filtered.json`
- `manual_classifications.json`
- `rules.json`

---

## 2. 入力ファイル（json/csv/image）

### 2.1. `segmentation.json`（領域データ / COCO 風）

**役割**

- 画像上の「領域（Region）」の幾何情報（`bbox` とポリゴン）と、初期クラス（`category_id`）を提供します。
- `result.csv` と結合するために、`annotations[].id` が `result.csv` の `id` と一致している必要があります（`_lib/data-loader.ts`）。

**想定スキーマ（最小）**

実装上の型は `src/app/annotation2/_types/index.ts` の `CocoData` 相当です（ただし、実ファイルは追加フィールドを含み得ます）。

```ts
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
  bbox: [number, number, number, number]; // [x, y, w, h]
  seg: number[][] | number[]; // [[x,y,x,y,...]] or [x,y,x,y,...]
}

export interface CocoData {
  images: CocoImage[];
  annotations: CocoAnnotation[];
}
```

**補足 / 実装依存の注意点**

- `seg` は `number[]` と `number[][]` の両方を許容します。現行実装は **先頭ポリゴンのみ** を `AnnotationRegion.points` に変換します。
- `bbox` は `[x, y, w, h]`（左上 + 幅高）です。
- 入力 JSON に `hole` や `class` などのフィールドが含まれていても、現行実装では参照しません（読み込み時に無視されます）。

### 2.2. `result.csv`（メトリクス）

**役割**

- 領域 ID ごとの解析結果（面積、円形度、色統計など）を提供します。
- フィルタ UI の条件は `AnnotationRegion.metrics[metricKey]` を参照して評価されます（`_lib/filter-utils.ts`）。

**想定スキーマ（最小）**

- 1行目はヘッダ行（カンマ区切り）
- 先頭列は `id`（領域ID、数値）
- 2列目以降はすべて数値（`parseFloat` 相当で解釈）

```
id,<metric1>,<metric2>,...
1,123.4,0.98,...
2, ...
```

**補足 / 実装依存の注意点**

- ヘッダ名がそのまま `metrics` のキーになります（例: `metrics["面積(μm)^2"]`）。
- 特定 ID の行が存在しない場合、その領域の `metrics` は `{}`（空）になります。
- フィルタ評価で `metrics[metricKey]` が `undefined` の場合、条件は「マッチしない」と扱われます。

### 2.3. `*.png`（元画像）

**役割**

- キャンバスの背景として表示され、ポリゴン描画・可視化の座標系の基準になります。

**配置**

- `src/app/annotation2/input/original_images/<datasetId>.png`（優先）
- 存在しない場合は `src/app/annotation2/input/origin.png`（fallback）

`/annotation2/image?dataset=<datasetId>`（`image/route.ts`）経由で配信されます。

---

## 3. 出力ファイル（永続化される状態）

### 3.1. `classification.json`（分類結果のスナップショット）

**役割**

- 領域ID → クラスID のマッピングを保存します。
- 「Save All Changes」で、画面上の最終表示（`mergedClassifications`）を **完全上書き保存** します（`_components/AnnotationPageClient.tsx` → `saveClassifications`）。

**想定スキーマ**

```ts
export type ClassificationFileV1 = {
  version: 1;
  updatedAt: string; // ISO-8601
  classifications: Record<string, number>; // key: regionId（JSON上は文字列）
};
```

**補足**

- 値は `categories.json` の `CategoryDef.id`（例: `999` は Remove/Trash 用）。

### 3.2. `manual_classifications.json`（手動修正 / Manual Overrides）

**役割**

- ユーザーがクリック/範囲選択で行った「手動クラス指定」を保存します。
- 表示の優先度は **Manual Overrides > Pipeline Results > 元データ** で、ルール再計算をしても手動指定が維持されます（`MANUAL_EDIT_FLOW.md`）。
- 操作直後にリアルタイム保存され、Save All でも再送されます（`actions.ts`）。

**想定スキーマ**

```ts
export type ManualClassificationsFileV1 = {
  version: 1;
  updatedAt: string; // ISO-8601
  overrides: Record<string, number>; // key: regionId（JSON上は文字列）
};
```

### 3.3. `rules.json`（分類パイプラインルール）

**役割**

- ルールベース分類パイプラインの定義を保存します。
- ルールは上から順に適用され、前段の結果（その時点のクラス）を見ながら `toClass` を上書きしていきます（`_components/AnnotationPageClient.tsx`）。

**想定スキーマ**

```ts
export type RulesFileV1 = {
  version: 1;
  updatedAt: string; // ISO-8601
  rules: ClassificationRule[];
};

export interface ClassificationRule {
  id: string;
  name: string;
  enabled: boolean;
  fromClass: number | "any";
  toClass: number;
  filter: FilterGroup;
}
```

**フィルタの解釈（重要）**

- `evaluateFilter(...)` は `true=Pass(通過/表示側)`, `false=Block(除外側)` を返します。
- 現行のパイプライン適用は **「除外側（`!evaluateFilter`）」をターゲット** として `toClass` を付与します。  
  例: `KEEP` の範囲外を `Remove(999)` にしたい、といった使い方を想定しています（詳細は `MANUAL_EDIT_FLOW.md`）。

### 3.4. `filtered.json`（フィルタ設定）

**役割**

- フィルタ UI（条件ツリー）の状態を保存し、次回ロード時に復元します（`_lib/data-loader.ts`）。
- Save All 時に、現在のフィルタ判定で「除外側」になった領域 ID を `excludedIds` として同時に保存します（現行実装ではスナップショット用途）。

**想定スキーマ**

`src/app/annotation2/_types/index.ts` の `FilterConfig`（v3）をそのまま保存します（`saveFilterConfig` は `updatedAt` を付与しません）。

```ts
export type FilterAction = "keep" | "remove";
export type FilterLogic = "AND" | "OR";

export interface FilterCondition {
  id: string;
  type: "condition";
  metric: string;
  min: number;
  max: number;
  enabled: boolean;
}

export interface FilterGroup {
  id: string;
  type: "group";
  name?: string;
  action: FilterAction;
  logic: FilterLogic;
  children: (FilterGroup | FilterCondition)[];
  enabled: boolean;
}

export interface FilterConfig {
  version: 3;
  root: FilterGroup;
  maxDepth: number;
  excludedIds: number[];
}
```

### 3.5. `categories.json`（カテゴリ定義 / クラス定義）

**役割**

- UI 上のクラス一覧（表示名・色・塗り）を保存します。
- 無い場合は `segmentation.json` の `category_id` から初期クラスが自動生成されます（`_lib/data-loader.ts`）。

**想定スキーマ**

```ts
export type CategoriesFileV1 = {
  version: 1;
  updatedAt: string; // ISO-8601
  categories: CategoryDef[];
};

export interface CategoryDef {
  id: number;
  name: string;
  color: string; // 例: "#06b6d4" / "hsl(...)"
  fill: string;  // 例: "rgba(...)" / "hsla(...)"
  isSystem?: boolean;
}
```

**補足**

- `id=999` は Remove（Trash）用途として予約されています（UI でも特別扱い）。

### 3.6. `additions.json`（手動追記領域）

**役割**

- 手動で描画して追加した領域（検出漏れ等）を保存します。
- ロード時に `AnnotationRegion` に変換され、既存領域に追加されます（`_lib/data-loader.ts`）。

**想定スキーマ**

```ts
export type AdditionsFileV1 = {
  version: 1;
  updatedAt: string; // ISO-8601
  regions: AddedRegion[];
};

export type AddedRegion = {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, w, h]
  segmentation: number[][]; // [[x,y,x,y,...]]
  hole: unknown[];          // 将来用（現状は []）
  area: number;             // 現状は 0
  metrics?: Record<string, number>;
  isManualAdded?: true;
};
```

**補足 / 実装依存の注意点**

- UI 内部では `AnnotationRegion.points: {x,y}[]` ですが、ファイル保存時は `segmentation: [[x,y,...]]` に変換されます。
- 現行実装では、追加領域の `id` は `-Date.now()` のような **負の数** が割り当てられます（既存領域と衝突しない前提）。

---

## 4. 関連（今回の対象外だが併存するファイル）

- `presets.json`: フィルタプリセット（`FilterPreset[]`）を保存します。
- `remove.json`: 旧仕様の削除リスト（`removedIds`）で、ロード時に `classification=999` としてマージされます。

