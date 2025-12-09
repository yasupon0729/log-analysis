# GEMINI.md - プロジェクトコンテキストと指示書

## 1. プロジェクト概要
これは **Next.js (App Router)** で構築された **ログ分析ダッシュボード** です。
AWS S3 から暗号化されたログを取得し、サーバー上で復号して可視化します。
フロントエンドは **Panda CSS** を使用し、ダーク/ブルー基調のテーマを採用しています。

## 2. 中核となる指令 (最重要)
*   **言語:** ユーザーとの対話は **すべて日本語** で行ってください。
*   **コンテキスト認識 (重要):** 機能の実装や問題の調査を行う前に、**必ず** `.README/` ディレクトリ内のドキュメントを読み、プロジェクトの構造とアーキテクチャ上の決定事項を理解してください。
*   **ドキュメントの更新:** プロジェクトの構造や主要な機能を変更した場合は、直ちに `.README/` 内の関連ドキュメントを更新してください。
*   **スタイリング:** **Panda CSS recipes** (`src/styles/recipes/`) を使用してください。**インラインスタイルは使用しないでください。** オーバーライドは必要な場合にのみ行ってください。DRY原則に従い、新しいレシピを作成する前に既存のレシピを確認してください。
*   **ロギング:** カスタム **Pino wrapper** (`src/lib/logger`) を使用してください。`console.log` は使用禁止です。
    *   使用法: `logger.info("event_name", { context })`
*   **型安全性:** TypeScript の `strict` モードが有効です。`// biome-ignore` はどうしても必要な場合にのみ、理由を添えて使用してください。
*   **Server Actions:** Next.js 15 では、`cookies()` や `headers()` は非同期です。常に `await` してください。サーバーサイドのロジックには Server Actions を優先的に使用してください。
*   **ビルド検証:** **3つ以上のファイル** を修正した場合は、エラーが発生していないことを確認するために必ず `bun run build` を実行してください。
*   **Git コミット**: エージェントがコードの変更をコミットする必要がある場合は、**必ず事前にユーザーの明示的な許可を得てから実行してください**。許可なくコミットすることは禁止します。
*   **エラーレポート:** 実装中やビルド検証時に解決が困難なエラーや、繰り返し発生しそうなエラーに遭遇した場合は、その内容と解決策を `.error-report/` ディレクトリ内にMarkdownファイルとして保存してください。ファイル名はエラー内容がわかる簡潔な英語（例: `column-def-type-mismatch.md`）とし、内容は日本語で「エラー内容」「原因」「解決方法」を構造化して記述してください。

## 3. アーキテクチャと主要ディレクトリ
*   `src/app/`: App Router ページ。`page.tsx` はサーバーサイドのロジックを処理し、UI はクライアントコンポーネントに委譲します。
*   `src/lib/`: 共有ロジック (API クライアント、S3 ラッパー、ログデコーダーなど)。
*   `src/components/`: React コンポーネント。
    *   `ui/`: Atomic コンポーネント (Button, AlertBanner など)。
    *   `layouts/`: Sidebar など。
*   `styled-system/`: Panda CSS 生成ファイル (手動編集禁止)。
*   `prisma/`: データベーススキーマ。
 
## 4. 主要ワークフロー
### ログ復号
*   **エンドポイント:** `/api/logs/decode` で `multipart/form-data` を処理します。
*   **ロジック:** `LOG_ENCRYPTION_KEY` (32バイト AES-256-CBC) を使用します。
*   **クライアント:** `/upload` ページでドラッグ＆ドロップによる復号が可能です。
*   **コード:** `src/lib/logs/decoder.ts` を参照してください。

### エラーハンドリング
*   **サーバー:** `{ ok: false, code, message, details }` を返します。
    *   エラー種別: `ValidationError`, `ForbiddenError`, `DependencyError`, `UnexpectedError`。
*   **クライアント:** `AlertBanner` コンポーネントを使用してください。

## 5. 開発とコマンド
*   **パッケージマネージャー:** `bun` を厳密に推奨します。
*   **開発サーバー:** `bun dev`
*   **ビルド:** `bun run build`
*   **Lint:** `bun run lint` (Biome)
*   **フォーマット:** `bun run format` (Biome)
*   **CSS コード生成:** `bunx panda codegen` (スタイルが不足している場合に実行)

## 6. 環境変数
`.env.local` を作成してください (コミット禁止):
*   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
*   `LOG_ENCRYPTION_KEY`

## 7. 参照
*   **.README/**: 詳細ドキュメント (要件、セットアップ、CSS、Logger など)。

*大きな変更を行う前には、常に `.README/` で詳細なアーキテクチャ上の決定事項を確認してください。*
