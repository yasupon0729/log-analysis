# Repository Guidance

## プロジェクト概要
- S3上の暗号化ログを取得し、Next.js App Routerで閲覧するダッシュボードです。
- フロントエンドはPanda CSSでダーク＋ブルー基調、サーバー／ブラウザ双方でPinoラッパーによるロギングを行います。
- 主要ディレクトリ:
  - `src/app/` – ルーティングとページ。`page.tsx`はサーバーログ発行、UIはクライアント側へ委譲。
  - `src/lib/` – APIクライアント、S3ラッパー、ログユーティリティなどの共通ロジック。
  - `styled-system/` – Panda CSSの生成物。`npm run format`/`npm run lint`後も同期を維持。

## 環境構築 (/.README.md ベース)
### 必須要件
- Node.js 18.18 以上（Bun利用時も内部で使用）
- Git / WSL2（Windowsの場合）
- AWS IAMユーザー: `s3:ListBucket` と `s3:GetObject` 権限（対象プレフィックス: `logs/`）

### 推奨ツール
- Bun 最新版（高速なスクリプト実行用）
- Biome (Lint/Format)
- VSCode はリポジトリルート `/home/yasunari/KNiT/log-analysis` から起動

### セットアップ手順概要
1. Bun をインストール
   ```bash
   curl -fsSL https://bun.sh/install | bash
   bun --version
   ```
2. リポジトリをクローンし `nextjs/` へ移動
3. 依存関係の取得
   - Bun 利用: `bun install`
   - npm 利用: `npm install`
4. Panda CSS コード生成が必要な場合: `bunx panda codegen` または `npm run dev` 時に自動生成

## 実行・ビルド
- 開発サーバー: `npm run dev`（Turbopack）。Bunを使う場合は `bun dev` 相当のスクリプトで置き換え可能。
- 本番ビルド: `npm run build`
- 本番起動: `npm run start`
- Lint: `npm run lint` （Biom e check）
- Format: `npm run format`
- Bun運用例 (/.README.md 記載):
  - ルート `package.json` で `bun dev` → `cd nextjs && bun dev`
  - `nextjs/package.json` では `bunx panda --watch & next dev` 等が想定

## 環境変数と秘密情報
- `.env.local` に以下を設定し、コミットしないこと:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
  - `LOG_ENCRYPTION_KEY` (AES-256-CBC用32バイトキー)
- サーバーサイドでS3アクセスを行い、クライアントにはキーや資格情報を露出しない。

## ログ復号フロー
- `/api/logs/decode` で `multipart/form-data` を受け取り `LOG_ENCRYPTION_KEY` を用いた復号＋gunzip を実施。
- `/upload` ページからドラッグ＆ドロップで `.log.gz.enc` をアップロードすると復号結果が表示される。
- 共通ユーティリティ `src/lib/logs/decoder.ts` を使用して鍵の検証・復号・解凍を一貫処理する。

## コーディング・スタイル
- TypeScript `strict`。不明確な型は明示的に指定。
- コメントは必要最小限。複雑な処理前に1行で要点を注記。
- ログは `logger.info("event", { context })` のように構造化オブジェクトで出力。
- React コンポーネントは PascalCase、ユーティリティやフックは camelCase。

## エラーハンドリング方針
- サーバー側エラーは `ValidationError` / `ForbiddenError` / `DependencyError` / `UnexpectedError` の分類で返却し、レスポンスは `{ ok: false, code, message, details }` 形式に統一する。
- フロントエンドでは共通コンポーネント `AlertBanner`（`@/components/ui/AlertBanner`）を使用して通知する。`variant` を切り替えてエラー／警告／情報を表示可能。
- 詳細な運用手順や背景は `.README/06_エラーハンドリング方針.md` を参照。

## テスト/検証
- 自動テストは未整備。機能追加時は手動で `/upload` や S3 連携を検証。
- 新規テストを追加する場合は `src/` 配下に機能と同階層で配置し、`<feature>.test.ts(x)` 命名。

## セキュリティとトラブルシュート
- AWS資格情報は環境変数管理。`.env.local` が壊れている場合は先頭行にコメントを付けるなどで `source` 時のエラーを防ぐ。
- Panda CSS の生成物が欠落した場合は `bunx panda codegen` を再実行。
- S3 接続エラー時は IAM 権限とリージョン設定を再確認。

## コミット/PR ポリシー
- コミットメッセージは簡潔な日本語（例: `ログ復号APIを追加`）。
- PR では動作確認手順、必要な環境変数、UI変更時のスクリーンショットを添付。
- フォローアップ作業がある場合は PR 説明に明記。

## コミュニケーション
- 本リポジトリに関するエージェントからの回答は **必ず日本語** で行うこと。
- 実装や調査を行う際は `.README` ディレクトリ配下の資料を参照してプロジェクト構成を把握し、構成変更があれば該当 README も適宜更新すること。
- serenaを使用してプロジェクト構造を理解し、DRY原則に従うこと
- 新規UI実装や改修に着手する前に既存コンポーネント／レシピを精査し、再利用・拡張できないか判断した上で、必要なコンポーネントを先に整備すること。
- サーバーサイドの処理が絡む機能を追加・変更する際は、Next.js の Server Actions が利用可能かをまず検討し、適用可能なら優先的に採用すること。
- 3ファイル以上を修正する場合、bun run buildを実行してエラーがないことを確認すること。
