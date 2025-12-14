# Annotation Manual Edit & Data Flow Specification

## 1. 概要
Annotation Tool V2 の手動編集・フィルタ・パイプラインの流れを、現行実装に合わせて整理する。  
クラスの最終表示は **Manual Overrides > Pipeline Results > 元データ** の優先度で決まる。

## 2. 編集時の挙動 (Frontend)

### 2.1. 操作と状態更新
1.  **クリック (Single Click)**:
    *   現在表示中のクラス (`mergedClassifications`) を参照し、選択中クラス (`Active Category`) なら **手動指定を解除**、異なる場合は **手動指定を付与**。
2.  **範囲選択 (Range Select)**:
    *   範囲内すべてに選択中クラスを **手動指定として適用**（手動追加領域は除外）。
3.  **永続化タイミング**:
    *   手動指定は `manualOverrides` に保持され、操作直後に `manual_classifications.json` へ **リアルタイム保存** される。

### 2.2. 保持データ (React State)
*   **`pipelineResults: Map<number, number>`** – ルール適用後の一時結果。`rules` 変更または実行時に再計算。
*   **`manualOverrides: Map<number, number>`** – 手動指定。最優先で表示に反映され、リアルタイム保存。
*   **`mergedClassifications`** – `pipelineResults` に `manualOverrides` を上書きした表示用マップ。フィルタ判定や「Save All」の入力にも利用。

## 3. 保存時の挙動 (Backend Persistence)

「Save All Changes」では下記をまとめて保存する。

*   **classifications**: `mergedClassifications` を `classification.json` に完全上書き。
*   **filterConfig**: `filtered.json` に保存し、現在の除外IDも `excludedIds` に反映。
*   **rules**: `rules.json` に保存。
*   **manualOverrides**: 既にリアルタイム保存済みだが、再送して整合性を確保。
*   **addedRegions**: `additions.json` に保存。

## 4. フィルタとパイプラインの関係
*   **Keep/Remove の意味**: `evaluateFilter` の結果が `true` なら「表示される側」、`false` なら「フィルタで弾かれる側」。
*   **キャンバスのハイライト対象**: `false` になった領域（= フィルタで弾かれる側）が `activeCategory` の色でプレビューされる。
*   **Add to Pipeline 時の対象**:
    *   ルールのフィルタも上記と同じ判定を使い、**「フィルタで弾かれる側 (!evaluateFilter)」に To Class を適用**する。
    *   例: Root Action が `KEEP` の場合はスライダー範囲 **外** が対象。`REMOVE` の場合は範囲 **内** が対象。
*   **手動指定の維持**: パイプライン再計算後も `manualOverrides` が上書きされるため、手動修正は消えない。

## 5. 推奨ワークフロー
1. フィルタで除外したい領域をハイライトしつつ To Class を決め、「+ Add to Pipeline」でルール化。
2. 自動結果を確認し、必要箇所をクリック/範囲選択で手動修正。
3. 「Save All Changes」で最終状態を一括保存。
