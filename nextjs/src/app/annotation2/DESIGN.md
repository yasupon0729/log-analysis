# Annotation V2 設計書

## 1. 概要
本ドキュメントは、新しい入力形式 (COCO Format JSON + CSV Metrics) に対応したアノテーションページの設計について記述する。
本機能は `src/app/annotation` の機能をベースとしつつ、将来的な Tailwind CSS + Material UI への移行を見据え、`src/app/annotation2` ディレクトリ配下で完結する構成とする。
また、**多クラス分類、ルールベースの自動分類パイプライン、手動修正（削除・追記）** を統合した高度なアノテーションプラットフォームとして設計されている。

## 2. ディレクトリ構成
全ての関連ファイルは `src/app/annotation2` 配下に配置する。

```
src/app/annotation2/
├── page.tsx                  # Server Component (データ読み込み、メインエントリー)
├── input/                    # 入力データ
│   ├── origin.png            # 元画像
│   ├── result.csv            # メトリクスデータ
│   ├── segmentation.json     # 領域データ (COCO)
│   ├── classifications.json  # クラス分類結果 (ID -> CategoryID)
│   ├── additions.json        # 手動追記データ
│   ├── filtered.json         # 現在のフィルタ設定
│   ├── categories.json       # クラス定義 (動的)
│   ├── rules.json            # 分類パイプラインルール
│   └── presets.json          # フィルタプリセット
├── _components/              # UIコンポーネント
│   ├── AnnotationPageClient.tsx # クライアントエントリーポイント (全State管理)
│   ├── CanvasLayer.tsx       # キャンバス描画 (画像 + アノテーション)
│   ├── ControlPanel.tsx      # フィルタ条件エディタ (再帰型UI)
│   └── ui/                   # 汎用UIパーツ (Button, Sliderなど)
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

1.  **Load Data**: `segmentation.json` (COCO) と `result.csv` (Metrics) を読み込み、`AnnotationRegion` オブジェクトの配列に結合。
2.  **Load State**: `classifications.json`, `additions.json` を読み込み、初期状態を構築。
3.  **Load Config**: `categories.json`, `rules.json`, `presets.json` を読み込み、設定情報を取得。
4.  **Props**: 全てを `AnnotationPageClient` に渡す。

### 3.2 Client Side (`_components/AnnotationPageClient.tsx`)
高度な状態管理とインタラクションを担当。

*   **State Management**:
    *   `regions`: 初期アノテーションデータ（不変）。
    *   `addedRegions`: 手動追記された領域（可変）。
    *   `classifications`: 領域IDに対するクラスIDのマッピング。
    *   `categories`: クラス定義（ID, 名前, 色）。
    *   `rules`: 分類パイプラインのルールリスト。
    *   `filterConfig`: 現在のフィルタ条件。
*   **Interactions**:
    *   **Select / Batch Mode**: フィルタ条件による絞り込みと、ルールベースの一括クラス適用。
    *   **Draw Mode**: キャンバス上での手動ポリゴン描画（追記）とクラス割り当て。
    *   **Pipeline Execution**: 定義されたルール順序に従って全領域を自動再分類。
*   **Persistence**:
    *   変更があるたびに Server Actions 経由で JSON ファイルを即座に更新（Optimistic Update）。

## 4. データモデル (`_types/index.ts`)

### 4.1 アプリケーション内部データモデル
```typescript
interface Point {
  x: number;
  y: number;
}

interface AnnotationRegion {
  id: number;
  bbox: [number, number, number, number];
  points: Point[];
  metrics: Record<string, number>;
  isManualAdded?: boolean;
  categoryId?: number; // 初期クラス
}

// カテゴリ定義 (動的)
interface CategoryDef {
  id: number;
  name: string;
  color: string;
  fill: string;
  isSystem?: boolean; // Default(1)とRemove(999)は削除不可
}

// 分類ルール (パイプライン)
interface ClassificationRule {
  id: string;
  name: string;
  enabled: boolean;
  fromClass: number | "any"; // 適用対象の元クラス
  toClass: number;           // 適用後のクラス
  filter: FilterGroup;       // 適用条件
}

// フィルタリング設定 (v3)
interface FilterConfig {
  version: 3;
  root: FilterGroup; // 再帰的条件ツリー (Action: Keep/Remove)
  // ...
}
```

## 5. 主要機能

### 5.1 クラス分類 (Classification)
*   **多クラス対応**: 従来の「削除 (Remove)」だけでなく、任意のクラス（Class 2, 3...）への分類が可能。
*   **動的カテゴリ**: ユーザーが自由にクラスを追加・削除・色変更可能。
*   **パレット**: 12色のプリセットカラーから選択可能。

### 5.2 フィルタリングと一括処理 (Batch Processing)
*   **Filter Condition**: 面積、円形度などのメトリクスに基づく条件設定（AND/OR, グループ化対応）。
*   **Visual Preview**: 条件に合致する（または除外される）領域を、適用先のクラス色でプレビュー表示。
*   **From/To**: 「Class 1 の中から、条件Xを満たすものを Remove にする」といった細かい制御が可能。

### 5.3 自動分類パイプライン (Pipeline)
*   **Rule Based**: 複数の変換ルールをリストとして管理。
*   **Sequential Execution**: リストの上から順にルールを適用し、複雑な分類ロジックを一括実行。
*   **Persistence**: ルールセットは `rules.json` に保存され、再現性を確保。

### 5.4 手動修正 (Manual Editing)
*   **Click to Classify**: 個別の領域をクリックしてクラスを変更。
*   **Draw Mode**: 検出漏れの領域をポリゴン描画で追加。
*   **Delete**: 手動追加領域の削除。

## 6. 将来の展望
*   **Tailwind + MUI**: コンポーネントレベルでの移行準備済み。
*   **Undo/Redo**: 複雑な操作が増えたため、履歴管理の実装が望ましい。
*   **AI Integration**: 現在のルールベースに加え、AIモデルによる推論結果の統合。
