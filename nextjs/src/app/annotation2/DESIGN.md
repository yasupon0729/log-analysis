# Annotation V2 設計書

## 1. 概要
本ドキュメントは、新しい入力形式 (COCO Format JSON + CSV Metrics) に対応したアノテーションページの設計について記述する。
本機能は `src/app/annotation` の機能をベースとしつつ、将来的な Tailwind CSS + Material UI への移行を見据え、`src/app/annotation2` ディレクトリ配下で完結する構成とする。

## 2. ディレクトリ構成
全ての関連ファイルは `src/app/annotation2` 配下に配置する。

```
src/app/annotation2/
├── page.tsx                  # Server Component (データ読み込み、メインエントリー)
├── input/                    # 入力データ (origin.png, result.csv, segmentation.json, remove.json, filtered.json)
├── _components/              # UIコンポーネント
│   ├── AnnotationPageClient.tsx # クライアントサイドのエントリーポイント (State管理)
│   ├── CanvasLayer.tsx       # キャンバス描画 (画像 + アノテーション)
│   ├── ControlPanel.tsx      # フィルタリングなどの操作パネル (再帰型UI)
│   └── ui/                   # 汎用UIパーツ (Button, Sliderなど - 移行容易性のためここに定義)
├── _lib/                     # ビジネスロジック
│   ├── data-loader.ts        # データの読み込みと結合ロジック
│   └── filter-utils.ts       # フィルタリング評価・変換ロジック
├── _types/                   # 型定義
│   └── index.ts
└── _utils/                   # ユーティリティ
    └── index.ts
```

## 3. アーキテクチャとデータフロー

### 3.1 Server Side (`page.tsx`, `_lib/data-loader.ts`)
Next.js App Router の Server Component の利点を活かし、APIルートを経由せず、直接ファイルシステムからデータを読み込む。

1.  **Load JSON**: `input/segmentation.json` (COCO Format) を読み込む。
2.  **Load CSV**: `input/result.csv` (Metrics) を読み込む。
3.  **Merge**:
    *   COCOデータの `annotations` 配列を反復処理。
    *   `id` をキーにして CSV データの該当行を検索。
    *   `AnnotationRegion` オブジェクトを生成。
4.  **Load Config**: `input/remove.json` (手動削除), `input/filtered.json` (フィルタ設定) を読み込む。
5.  **Props**: 結合されたデータを `AnnotationPageClient` に渡す。

### 3.2 Client Side (`_components/AnnotationPageClient.tsx`)
既存の `AnnotationCanvasClient.tsx` のロジックを移植・リファクタリングする。

*   **State Management**:
    *   `regions`: 全アノテーションデータ。
    *   `filterConfig`: 再帰的なフィルタ設定 (v3)。
    *   `removedIds`: ユーザー操作により削除されたIDのセット。
    *   `hoveredId`: ホバー中の領域ID。
*   **Interactions**:
    *   フィルタリング変更 -> `evaluateFilter` (再帰評価) -> `filteredIds` 更新 -> 再描画。
    *   キャンバス操作 -> ホバーハイライト、削除操作。
    *   保存操作 -> Server Actions 経由で JSON ファイルを保存。

## 4. データモデル (`_types/index.ts`)

### 4.1 入力データ形式
**COCO Format (segmentation.json)**
```typescript
interface CocoImage {
  id: number;
  width: number;
  height: number;
  file_name: string;
}

interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  seg: number[][]; // [x1, y1, x2, y2, ...] (Polygon)
}

interface CocoData {
  images: CocoImage[];
  annotations: CocoAnnotation[];
}
```

**CSV Metrics (result.csv)**
*   Header: `id`, `面積(μm)^2`, `円相当径(μm)`, ...
*   各列をキーとしたオブジェクトとしてパースする。

### 4.2 アプリケーション内部データモデル
```typescript
interface Point {
  x: number;
  y: number;
}

interface AnnotationRegion {
  id: number; // CSV, JSONのIDと一致
  bbox: [number, number, number, number];
  points: Point[]; // 描画用ポリゴン
  metrics: Record<string, number>; // CSVの全カラムデータ
}

// フィルタリング設定 (v3: Recursive Keep/Remove System)
type FilterAction = "keep" | "remove";
type FilterLogic = "AND" | "OR";

interface FilterGroup {
  type: "group";
  action: FilterAction;
  logic: FilterLogic;
  children: (FilterGroup | FilterCondition)[];
  enabled: boolean;
}

interface FilterCondition {
  type: "condition";
  metric: string;
  min: number;
  max: number;
  enabled: boolean;
}

interface FilterConfig {
  version: 3;
  root: FilterGroup;
  maxDepth: number;
  excludedIds: number[];
}
```

## 5. 実装ステップ

1.  **型定義**: `_types/index.ts` の作成。
2.  **データローダー実装**: `_lib/data-loader.ts` で JSON と CSV を読み込み結合する処理を実装。
3.  **UIコンポーネント移植**:
    *   `AnnotationPageClient` の作成。
    *   `CanvasLayer` の作成 (Canvas API を使用)。
    *   `ControlPanel` の作成 (再帰的なフィルタ設定UI)。
4.  **メインページ結合**: `page.tsx` でローダーとクライアントコンポーネントを接続。

## 6. 技術的な考慮事項
*   **Performance**: アノテーション数が多い場合、Canvas描画の最適化が必要（既存実装もCanvasなので踏襲）。
*   **Filter Logic**: 複雑な条件 (`(A AND B) OR C`) を実現するため、再帰的な評価ロジックを実装。
*   **UI Design**: フィルタ設定パネルは視認性を高めるためダークテーマを採用。論理式を可視化して表示する。

## 7. 将来の移行 (Tailwind + MUI)
*   `_components/ui` 内のコンポーネントを MUI コンポーネントに差し替える。
*   レイアウト用の Panda CSS (`css({...})`, `Stack`, `HStack` 等) を Tailwind のクラス (`flex gap-4` 等) に書き換える。
*   この設計により、ロジック部分 (`_lib`, `AnnotationPageClient` のステート管理) はほぼそのまま再利用可能となる。

## 8. 機能拡張履歴
*   **高度なフィルタリング**:
    *   再帰的なグループ構造による条件設定。
    *   各グループに対して「残す (Keep)」か「除外する (Remove)」かのアクションを指定可能。
    *   論理結合 (AND/OR) の切り替え。
    *   現在のフィルタ論理式の可視化表示。
*   **UI/UX改善**:
    *   ダークテーマへの対応 (ControlPanel)。
    *   ダブルレンジスライダーによる直感的な範囲指定。
    *   削除済み領域の強調表示 (赤色)。
*   **設定の永続化**:
    *   `filtered.json` への設定保存と読み込み。