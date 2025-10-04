# ログ解析アプリケーション - プロジェクト構成

## 📋 概要
S3から直接ログを取得して解析するダッシュボードアプリケーション。
ダークテーマ・青基調のUIで、リアルタイムログ解析機能を提供。

# mcpのcodex、serenaを優先的に使用して検証しなさい。
# 修正・作成したファイルに関しては、実行後、必ずerrorがないことを確認しなさい。

## 🏗️ 現在の構成

### 技術スタック
- **Runtime**: Bun v1.2.17
- **Framework**: Next.js v15 (App Router)
- **Language**: TypeScript
- **Styling**: Panda CSS (Zero-runtime CSS)
- **UI Components**: TanStack Table (予定)
- **Linter/Formatter**: Biome
- **Development Environment**: WSL

### ディレクトリ構造
```
/home/yasunari/KNiT/log-analysis/
├── .vscode/
│   ├── settings.json      # VSCode設定（Biome自動フォーマット）
│   ├── extensions.json    # 推奨拡張機能
│   ├── launch.json       # デバッグ設定
│   └── tasks.json        # ビルドタスク
├── .README.md/
│   ├── 01_要件まとめ.md
│   ├── 02_環境構築まとめ.md
│   └── 03_CSSの導入.md
├── biome.json            # Biomeワークスペース設定
├── package.json          # ワークスペース管理
├── CLAUDE.md            # この文書
└── nextjs/
    ├── src/
    │   ├── app/
    │   │   ├── globals.css    # グローバルCSS（Panda CSS import）
    │   │   ├── layout.tsx     # ルートレイアウト（サイドバー付き）
    │   │   └── page.tsx       # ホームページ（Panda CSS動作確認）
    │   ├── components/
    │   │   └── layouts/
    │   │       └── Sidebar.tsx  # サイドバーコンポーネント
    │   └── styles/
    │       ├── recipes/
    │       │   └── layouts/
    │       │       └── sidebar.recipe.ts  # サイドバーレシピ
    │       └── utils/
    │           └── gradient-text.ts  # グラデーションテキスト
    ├── styled-system/        # Panda CSS生成ファイル
    ├── panda.config.ts      # Panda CSS設定
    ├── postcss.config.mjs   # PostCSS設定
    ├── tsconfig.json        # TypeScript設定
    └── package.json         # Next.jsパッケージ

```

## 🎨 デザインシステム

### カラーパレット
- **Primary (青)**: #0967d2 - メインカラー
- **Secondary (緑)**: #10b981 - 成功・ポジティブ
- **Tertiary (ピンク)**: #ec4899 - アクセント・強調
- **Dark Background**: #0f172a - 背景色
- **Dark Surface**: #1e293b - カード・パネル

### 実装済みコンポーネント
1. **サイドバー（左側縦配置）**
   - 折りたたみ可能
   - アイコン + ラベル表示
   - アクティブ状態の視覚化

2. **Panda CSSレシピ**
   - `sidebarRecipe` - サイドバー基本スタイル
   - `sidebarNavItemRecipe` - ナビゲーション項目
   - グラデーションテキストユーティリティ

## 🔧 開発コマンド

### 開発サーバー起動
```bash
cd /home/yasunari/KNiT/log-analysis/nextjs
bun dev
```

### ビルド
```bash
cd /home/yasunari/KNiT/log-analysis/nextjs
bun run build --turbopack
```

### 本番環境起動
```bash
cd /home/yasunari/KNiT/log-analysis/nextjs
bun run start
```

### コード品質
```bash
# フォーマット
bun run format

# Lint
bun run lint

# Lint修正
bun run lint:fix
```

## ⚙️ 設定ファイル

### Biome設定
- ワークスペースレベルで管理
- Ctrl+S で自動フォーマット有効
- インデント: スペース2
- クォート: ダブルクォート

### Panda CSS設定
- Zero-runtime CSS
- レシピベースのスタイリング
- ダークテーマ固定
- グローバルスタイル適用済み

### TypeScript設定
- パスエイリアス設定済み
  - `@/*` → `./src/*`
  - `@/styled-system/*` → `./styled-system/*`

## 🚀 次のステップ

### 実装予定
1. **AWS S3連携**
   - S3クライアント実装
   - ログ取得API作成

2. **ログテーブル実装**
   - TanStack Table統合
   - 仮想化スクロール
   - フィルター・ソート機能

3. **データ処理**
   - ログパーサー実装
   - JSON正規化処理
   - リアルタイム更新

### 技術的課題
- [ ] S3アクセス認証設定
- [ ] 大量データの効率的な処理
- [ ] ウルトラワイド対応（max-width: 2000px）

## 📝 メモ

### Panda CSS使用時の注意
- WebKit系プロパティはstyle属性で直接指定
- レシピとインラインスタイルの使い分け
- グローバルCSSは`globalCss`で定義

### デバッグ
- VSCodeでF5キー → "Full Stack: Server + Client"選択
- サーバーサイド・クライアントサイド同時デバッグ可能

### ログファイル
- **開発環境**: `nextjs/logs/server/app-dev.log`
- **本番環境**: `nextjs/logs/server/app-prod.log`
- **クライアントログ**: APIエンドポイント経由でサーバーログに記録

### パフォーマンス考慮
- Panda CSSのZero-runtime特性を活用
- 不要なre-renderを避ける
- 仮想化スクロールの実装予定

## 🔗 関連ドキュメント
- [要件まとめ](.README.md/01_要件まとめ.md)
- [環境構築まとめ](.README.md/02_環境構築まとめ.md)
- [CSSの導入](.README.md/03_CSSの導入.md)
- [Loggerの実装](.README.md/04_loggerの実装.md)

# 完了要件
- 修正・追加したファイルにエラーがないこと。