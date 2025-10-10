# Log Analysis Dashboard - Current Configuration

# mcpのcodex、serenaを優先的に使用して検証しなさい。
# 修正・作成したファイルに関しては、実行後、必ずerrorがないことを確認しなさい。
# cssは必ず、レシピとして別ファイル定義してください。(オーバライドのみ許可)

## 開発ルール

### TypeScript
- `any`型を使用する際は、必ず以下のBiome ignoreコメントを付ける:
  ```typescript
  // biome-ignore lint/suspicious/noExplicitAny: 理由を記載
  ```
- "修正後は、必ず 以下のコードを実行する
```
bun run lint
bun run format`
```

### コンポーネント開発
- コンポーネントは小さく、単一責任の原則に従って作成する
- 既存のコンポーネントを必ず確認し、再利用可能な場合は新規作成せず既存を使用する
- 例: Button, Input, Card等の基本コンポーネントが既に存在する場合は、それらを優先的に使用

### アクセシビリティ
- クリック可能な要素には適切なキーボードイベントを実装する
- 配列のmapでkeyを設定する際は、indexではなく一意のIDを使用する

## Project Overview
Next.js-based log analysis dashboard with S3 integration capabilities, built with modern React patterns and zero-runtime CSS.

## Technology Stack

### Core
- **Runtime**: Bun (latest)
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript 5
- **Styling**: Panda CSS (zero-runtime CSS-in-JS) - ダーク＋ブルー基調
- **Logging**: Pino wrapper (サーバー／ブラウザ双方対応)
- **Linting/Formatting**: Biome

### Architecture
- **Structure**: Monorepo workspace (ready for backend addition)
- **CSS Pattern**: Recipe-based architecture (styles separated from components)
- **Theme**: Dark mode with semantic color tokens

## Directory Structure
```
log-analysis/
├── nextjs/                    # Frontend application
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   │   ├── layout.tsx    # Root layout with sidebar
│   │   │   ├── page.tsx      # Home page with Panda CSS demo
│   │   │   └── globals.css   # Global styles
│   │   ├── components/       # React components
│   │   │   └── layouts/      # Layout components
│   │   │       └── Sidebar.tsx
│   │   └── styles/           # Styling utilities
│   │       ├── recipes/      # Panda CSS recipes
│   │       │   └── layouts/
│   │       │       └── sidebar.recipe.ts
│   │       └── utils/        # Style utilities
│   │           └── gradient-text.ts
│   ├── styled-system/        # Panda CSS generated files
│   ├── panda.config.ts       # Panda CSS configuration
│   ├── tsconfig.json         # TypeScript configuration
│   ├── package.json          # Project dependencies
│   └── biome.json           # Biome configuration
├── .vscode/
│   ├── launch.json          # Debug configurations
│   ├── settings.json        # VSCode settings
│   └── extensions.json     # Recommended extensions
├── package.json             # Workspace root package
└── biome.json              # Workspace Biome config
```

## Color System

### Primary Colors
- **Primary** (Blue): #0967d2 - #47a3f3 - #7cc4fa - #bae3ff
- **Secondary** (Green): #10b981 - #34d399 - #6ee7b7 - #a7f3d0
- **Tertiary** (Pink): #ec4899 - #f472b6 - #f9a8d4 - #fbcfe8

### Status Colors
- **Error**: #ef4444 (red-500)
- **Warning**: #f59e0b (amber-500)
- **Success**: #10b981 (green-500)
- **Info**: #3b82f6 (blue-500)

### Dark Theme Base
- **Background**: #0a0a0a
- **Surface**: #1a1a1a
- **Border**: #2a2a2a

## Implemented Components

### Sidebar (`/src/components/layouts/Sidebar.tsx`)
- Vertical navigation on left side
- Expand/collapse functionality
- Recipe-based styling pattern
- Navigation items with icons
- User profile section

### Gradient Text Utility (`/src/styles/utils/gradient-text.ts`)
- WebKit-compatible gradient text
- Solves TypeScript property issues
- Reusable across components

## Configuration Files

### TypeScript (`tsconfig.json`)
```json
{
  "paths": {
    "@/*": ["./src/*"],
    "@/styled-system/*": ["./styled-system/*"]
  }
}
```

### Panda CSS (`panda.config.ts`)
- Dark theme with semantic tokens
- Recipe-based component styling
- Global CSS reset
- Custom color tokens

### Debugging (`.vscode/launch.json`)
- Server-side debugging
- Client-side Chrome debugging
- Full Stack compound configuration

## Scripts
```bash
# Development
bun dev          # Start development server

# Build
bun build        # Production build
bun css:build    # Generate Panda CSS

# Code Quality
bun format       # Format with Biome
bun lint         # Lint with Biome
bun typecheck    # TypeScript checking
```

## Current Status
✅ **Completed**
- Workspace setup for monorepo
- Next.js 15 with App Router
- Panda CSS with dark theme (ダーク＋ブルー基調)
- Recipe-based CSS architecture (インラインCSS禁止)
- Sidebar navigation component
- TypeScript configuration
- Debugging setup
- All TypeScript errors resolved
- Pinoラッパーによるロギング実装（サーバー／ブラウザ双方対応）

⏳ **Pending**
- AWS S3 integration
- Log data fetching and parsing
- TanStack Table implementation
- Data visualization components
- Ultra-wide display optimization
- Backend service (when needed)

## Development Notes

### CSS Architecture
- **Separation**: Styles defined in recipe files, not inline
- **Recipes**: Variants and base styles in `.recipe.ts` files - 必須、インラインCSS禁止（オーバライドのみ許可）
- **Utilities**: Reusable style functions in `/styles/utils`
- **Tokens**: Semantic color tokens for consistency
- **Theme**: ダーク＋ブルー基調のデザインシステム

### WebKit Properties
- Use style prop for WebKit-specific CSS properties
- Gradient text utility handles browser compatibility

### Path Aliases
- `@/` → `./src/`
- `@/styled-system/` → `./styled-system/`

## Next Steps
1. Implement S3 connection for log retrieval
2. Create log parsing and normalization logic
3. Add TanStack Table for data display
4. Implement filtering and search functionality
5. Add data visualization charts
6. Optimize for ultra-wide displays (max-width: 2000px)