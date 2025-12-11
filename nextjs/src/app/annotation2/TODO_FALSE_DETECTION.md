# 誤認識除去機能 実装タスクリスト

このドキュメントは、アノテーションツールの「誤認識除去」機能を実装するための詳細なステップを記述します。

## フェーズ 1: 基盤構築とデータの表示 (データの可視化)

1.  **型定義の作成 (`_types/index.ts`)**
    *   [x] `AnnotationRegion`, `Point` インターフェースの定義。
    *   [x] COCOフォーマット (`CocoData`, `CocoAnnotation`) の型定義。
    *   [x] メトリクス情報 (`MetricStat`) の型定義。

2.  **データローダーの実装 (`_lib/data-loader.ts`) - Part 1 (JSON)**
    *   [x] `input/segmentation.json` を読み込む関数の作成。
    *   [x] COCOフォーマットの `seg` (ポリゴン) データを `Point[]` に変換するロジックの実装。

3.  **データローダーの実装 (`_lib/data-loader.ts`) - Part 2 (CSV)**
    *   [x] `input/result.csv` を読み込み、各列をパースする処理の実装。
    *   [x] JSONのIDとCSVのIDを紐付け、`AnnotationRegion` に `metrics` として結合する処理の実装。
    *   [x] 各メトリクスの最小値・最大値を計算し、`stats` として返す処理の実装。

4.  **サーバーコンポーネントの実装 (`page.tsx`)**
    *   [x] `data-loader` を呼び出し、データを取得する。
    *   [x] `input/origin.png` を読み込み、Base64文字列に変換してクライアントに渡す準備をする。
    *   [x] クライアントコンポーネント (`AnnotationPageClient`) へデータを渡す。

5.  **描画コンポーネントの実装 (`_components/CanvasLayer.tsx`) - Part 1 (画像)**
    *   [x] HTML5 Canvas 要素の配置。
    *   [x] Base64画像データを Canvas に描画する処理の実装。
    *   [x] ウィンドウリサイズ等への対応（今回は固定サイズか、親要素に合わせるか要検討）。

6.  **描画コンポーネントの実装 (`_components/CanvasLayer.tsx`) - Part 2 (アノテーション)**
    *   [x] `AnnotationRegion` 配列を受け取り、ポリゴンを描画する処理の実装。
    *   [x] デフォルトのスタイル（塗りつぶし色、枠線色）の適用。

## フェーズ 2:インタラクションと個別削除 (クリックで消す)

7.  **状態管理の実装 (`_components/AnnotationPageClient.tsx`)**
    *   [x] `removedIds` (Set) ステートの定義。
    *   [x] `hoveredId` (number | null) ステートの定義。
    *   [x] 領域クリック時のハンドラ関数の作成（`removedIds` への追加/削除トグル）。

8.  **ホバー判定ロジックの実装 (`_components/CanvasLayer.tsx`)**
    *   [x] マウス移動イベント (`onMouseMove`) のハンドリング。
    *   [x] 座標変換（画面座標 -> Canvas内部座標）。
    *   [x] 点と多角形の当たり判定 (Point-in-Polygon) アルゴリズムの実装。
    *   [x] ホバー状態の領域IDを親コンポーネントに通知する処理。

9.  **状態に応じた再描画 (`_components/CanvasLayer.tsx`)**
    *   [x] `removedIds` に含まれる領域を描画しない（または「削除済み」として赤く表示する）ロジックの追加。
    *   [x] `hoveredId` に一致する領域をハイライト表示するロジックの追加。

## フェーズ 3: フィルタリングによる一括除去 (閾値で消す)

10. **フィルタリングUIの作成 (`_components/ControlPanel.tsx`)**
    *   [x] `MetricStat` を受け取り、メトリクスごとのスライダー（または数値入力）リストを表示するコンポーネントの実装。
    *   [x] 各スライダーの変更イベントを親コンポーネントに通知する仕組みの実装。

11. **フィルタリングロジックの統合 (`_components/AnnotationPageClient.tsx`)**
    *   [x] `filters` ステートの実装（各メトリクスの [min, max] 範囲）。
    *   [x] 現在の `filters` 設定に基づいて、表示すべきIDリスト (`filteredIds`) を計算する `useMemo` フックの実装。
    *   [x] `CanvasLayer` に `filteredIds` を渡し、除外された領域を薄く表示（または非表示）にする処理の連携。

## フェーズ 4: 検証とデバッグ

12. **ビルド検証**
    *   [ ] `bun run build` を実行し、ビルドが成功することを確認する。
    *   [ ] ビルドエラー (`PageNotFoundError`) の原因を特定し、修正する。

13. **実行時検証**
    *   [ ] `bun dev` で開発サーバーを起動し、ページが正しく表示されることを確認する。
    *   [ ] 画像とアノテーションが正しく描画されていることを確認する。
    *   [ ] マウスホバーでアノテーションがハイライトされることを確認する。
    *   [ ] クリックでアノテーションが削除/復元されることを確認する。
    *   [ ] フィルタリングUIでメトリクスを操作し、Canvas上のアノテーションが正しくフィルタリングされることを確認する。

14. **UI調整とクリーンアップ**
    *   [ ] 全体のレイアウト調整（Panda CSS使用）。
    *   [ ] `CanvasLayer` の `width`/`height` をハードコードから動的に取得するように修正（COCOデータまたは親要素のサイズから）。
    *   [ ] コードの整理（不要なログの削除、コメントの追加、型アサーションの最適化）。
    *   [ ] 既存の `src/app/annotation` ページのコードを参考に、`token.ts` のようなグローバル定数ファイルの必要性を検討。