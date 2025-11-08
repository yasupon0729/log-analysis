# Annotation Worklog Summary

## 1. アノテーション機能の初期実装
- `/annotation` ページを新設し、キャンバス UI と誤認識除去キューを実装。
- `/api/annotation` で `input/annotation.json` を読み込み、領域ポリゴンを返却。
- `annotation/token.ts` を導入し、httpOnly クッキーによるトークン検証を実装。
- サイドバーに「アノテーション」タブを追加。

## 2. 座標JSONの暗号化と復号
- 平文 `annotation.json` を暗号化し `annotation.json.enc` として保管。
- `ANNOTATION_ENCRYPTION_KEY` を追加し、Route Handler で復号してレスポンス。
- 暗号化ファイルの読み込み共通化モジュール `src/lib/annotation/data.ts` を実装。
- `AGENTS.md` に鍵運用と暗号化方針を追記。

## 3. `/annotation2`（座標を渡さないモード）
- メタ情報のみを返す `/api/annotation2/metadata` と、サーバー側ヒットテスト `/api/annotation2/hit-test` を実装。
- `/annotation2` ページでは矩形オーバーレイ表示＋サーバー判定結果でハイライト。
- サイドバーに「アノテーション (保護版)」を追加し、既存モードと併存させた。
- この方法の欠点は矩形であるということ。

## 4. 暗号鍵とファイルの調整
- `annotation.json.enc` を新しい鍵 `VBfFSKzg1hnn5Mk75ccGQqWM06HoQzOe` で再暗号化。
- `loadAnnotationDataset` を改修し、複数ディレクトリ探索と復号エラー時の詳細ログを追加。
- 暗号化ファイルが移動しても対応できるようにパス探索ロジックを実装。

## 5. セキュリティ方針の検討
- サーバー側ヒットテスト＋サーバー合成レンダリングで座標／マスクを一切配布しない構成を検討。
- カラーマスク方式と輪郭画像方式を比較し、復元リスクや実装コストを整理。
- クライアント側での単純な数値変換による「暗号化」の限界を確認。
