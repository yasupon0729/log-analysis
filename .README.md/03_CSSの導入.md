# Panda CSS 導入方針

## 🎯 目的
ログ解析アプリケーションに**ダーク・青基調**のデザインシステムを構築する。

## 📋 要件（要件まとめより）
- **ダーク固定・青基調**のテーマ
- ウルトラワイド対応（max-width ~2000px）
- アクセシビリティ考慮（フォント14-16px、行高1.4-1.6）
- TanStack Tableとの連携
- パフォーマンス重視（仮想化対応）

## 🏗️ アーキテクチャ方針

### 1. スタイリング戦略
```
Panda CSS (Zero-Runtime)
├── デザイントークン（色・スペース・タイポグラフィ）
├── セマンティックトークン（用途別の色定義）
├── グローバルスタイル（リセット・ベース）
└── コンポーネントレシピ（再利用可能なスタイル）
```

### 2. ファイル構成
```
nextjs/
├── panda.config.ts         # Panda設定
├── src/
│   ├── app/
│   │   ├── globals.css     # グローバルスタイル（Pandaが生成）
│   │   └── layout.tsx      # ルートレイアウト
│   ├── styles/
│   │   ├── tokens/         # デザイントークン
│   │   ├── recipes/        # コンポーネントレシピ
│   │   └── layers.css      # CSSレイヤー定義
│   └── components/
│       └── ui/             # スタイル付きコンポーネント
└── styled-system/          # Panda生成ファイル（.gitignore）
```

## 🎨 デザインシステム

### カラーパレット（実装済み）
```typescript
// ダークテーマ・青基調
colors: {
  // プライマリカラー（青系）
  primary: {
    50: '#e6f2ff',
    100: '#bae3ff',
    200: '#7cc4fa',
    300: '#47a3f3',
    400: '#2186eb',
    500: '#0967d2',  // メインカラー
    600: '#0552b5',
    700: '#03449e',
    800: '#01337d',
    900: '#002159',
    950: '#001135',
  },

  // セカンダリカラー（緑系）
  secondary: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',  // メインカラー
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },

  // ターシャリカラー（ピンク系）
  tertiary: {
    50: '#fdf2f8',
    100: '#fce7f3',
    200: '#fbcfe8',
    300: '#f9a8d4',
    400: '#f472b6',
    500: '#ec4899',  // メインカラー
    600: '#db2777',
    700: '#be185d',
    800: '#9d174d',
    900: '#831843',
    950: '#500724',
  },

  // ダークモード背景
  dark: {
    bg: '#0f172a',           // 背景
    bgSubtle: '#0c1425',     // より暗い背景
    surface: '#1e293b',      // カード・パネル
    surfaceHover: '#263244', // ホバー時
    surfaceActive: '#334155', // アクティブ時
    border: '#334155',       // ボーダー
    borderSubtle: '#1e293b', // 軽いボーダー
  },

  // テキストカラー
  text: {
    primary: '#f1f5f9',
    secondary: '#cbd5e1',
    tertiary: '#94a3b8',
    disabled: '#64748b',
    inverse: '#0f172a',
  },

  // ステータスカラー
  status: {
    error: '#ef4444',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    warning: '#f59e0b',
    warningBg: 'rgba(245, 158, 11, 0.1)',
    success: '#10b981',
    successBg: 'rgba(16, 185, 129, 0.1)',
    info: '#3b82f6',
    infoBg: 'rgba(59, 130, 246, 0.1)',
  }
}
```

### タイポグラフィ
```typescript
fonts: {
  body: 'system-ui, -apple-system, sans-serif',
  mono: 'Consolas, Monaco, monospace',
}

fontSizes: {
  xs: '12px',
  sm: '14px',
  md: '16px',
  lg: '18px',
  xl: '20px',
  '2xl': '24px',
}

lineHeights: {
  tight: '1.2',
  normal: '1.5',
  relaxed: '1.6',
}
```

### スペーシング
```typescript
spacing: {
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
}
```

## 🔧 導入手順

### Phase 1: 基本設定（即実施）
1. Panda CSS インストール
2. panda.config.ts 作成
3. PostCSS 設定
4. グローバルスタイル適用
5. 既存CSS（globals.css, page.module.css）の移行

### Phase 2: コンポーネント実装（MVP開発時）
1. UIコンポーネントレシピ作成
   - Button
   - Table（TanStack Table連携）
   - FilterBar
   - DatePicker
2. レイアウトコンポーネント
   - Container（ウルトラワイド対応）
   - Grid/Flex ユーティリティ

### Phase 3: 最適化（リリース前）
1. 未使用スタイルの削除
2. Critical CSS の抽出
3. パフォーマンス計測

## 💻 実装例

### コンポーネントでの使用
```tsx
import { css } from '@/styled-system/css'
import { flex, stack } from '@/styled-system/patterns'

export function LogTable() {
  return (
    <div className={css({
      bg: 'dark.surface',
      borderRadius: 'lg',
      p: 4,
      border: '1px solid',
      borderColor: 'dark.border',
    })}>
      <table className={css({
        width: 'full',
        color: 'dark.text',
      })}>
        {/* テーブル内容 */}
      </table>
    </div>
  )
}
```

### レシピの使用
```tsx
import { button } from '@/styled-system/recipes'

export function FilterButton({ variant = 'primary' }) {
  return (
    <button className={button({ variant })}>
      フィルター
    </button>
  )
}
```

## ⚡ パフォーマンス考慮

### Zero-Runtime の利点
- ビルド時にCSSを生成
- ランタイムオーバーヘッドなし
- Tree-shaking 対応
- 小さなバンドルサイズ

### TanStack Table との統合
```tsx
// 仮想化スクロール対応
const tableStyles = css({
  height: '600px',
  overflow: 'auto',
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-track': {
    bg: 'dark.bg',
  },
  '&::-webkit-scrollbar-thumb': {
    bg: 'primary.600',
    borderRadius: '4px',
  },
})
```

## 📐 CSS実装方針

### 基本原則: スタイルとロジックの完全分離

#### ❌ 避けるべきパターン
```tsx
// インラインスタイル - 禁止
export function BadComponent() {
  return (
    <div className={css({
      bg: 'dark.surface',
      p: 4,
      borderRadius: 'lg',
      // スタイルがコンポーネントに密結合
    })}>
      Content
    </div>
  )
}
```

#### ✅ 推奨パターン
```tsx
// styles/recipes/card.recipe.ts
import { cva } from '@/styled-system/css'

export const cardRecipe = cva({
  base: {
    bg: 'dark.surface',
    borderRadius: 'lg',
    border: '1px solid',
    borderColor: 'dark.border',
    transition: 'all 0.2s',
  },
  variants: {
    size: {
      sm: { p: 2 },
      md: { p: 4 },
      lg: { p: 6 },
    },
    interactive: {
      true: {
        cursor: 'pointer',
        _hover: {
          borderColor: 'primary.500',
          transform: 'translateY(-2px)',
        },
      },
    },
  },
  defaultVariants: {
    size: 'md',
    interactive: false,
  },
})

// components/ui/Card.tsx
import { cardRecipe } from '@/styles/recipes/card.recipe'

export function Card({ size, interactive, children }) {
  return (
    <div className={cardRecipe({ size, interactive })}>
      {children}
    </div>
  )
}
```

### レシピ化の階層構造

```
styles/
├── recipes/
│   ├── components/          # UIコンポーネントレシピ
│   │   ├── button.recipe.ts
│   │   ├── input.recipe.ts
│   │   ├── table.recipe.ts
│   │   └── card.recipe.ts
│   ├── layouts/            # レイアウトレシピ
│   │   ├── container.recipe.ts
│   │   ├── grid.recipe.ts
│   │   └── stack.recipe.ts
│   └── patterns/           # 共通パターンレシピ
│       ├── scrollbar.recipe.ts
│       ├── focus.recipe.ts
│       └── animation.recipe.ts
├── tokens/
│   ├── colors.ts          # カラートークン
│   ├── typography.ts      # タイポグラフィ
│   └── spacing.ts         # スペーシング
└── utilities/
    ├── responsive.ts      # レスポンシブユーティリティ
    └── accessibility.ts   # アクセシビリティヘルパー
```

### レシピ作成ガイドライン

#### 1. 命名規則
```typescript
// {component}Recipe という命名
export const buttonRecipe = cva({...})
export const tableRecipe = cva({...})
export const filterBarRecipe = cva({...})
```

#### 2. Variants設計
```typescript
export const buttonRecipe = cva({
  base: {
    // 共通スタイル
  },
  variants: {
    // 見た目のバリアント
    variant: {
      primary: {},
      secondary: {},
      danger: {},
    },
    // サイズバリアント
    size: {
      sm: {},
      md: {},
      lg: {},
    },
    // 状態バリアント
    state: {
      loading: {},
      disabled: {},
    },
  },
  // 複合バリアント
  compoundVariants: [
    {
      variant: 'primary',
      size: 'lg',
      css: {
        // 特定の組み合わせ時のスタイル
      },
    },
  ],
})
```

#### 3. テーブル専用レシピ（TanStack Table連携）
```typescript
// styles/recipes/components/table.recipe.ts
export const tableRecipe = cva({
  base: {
    width: 'full',
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
})

export const tableHeaderRecipe = cva({
  base: {
    bg: 'dark.surface',
    borderBottom: '2px solid',
    borderColor: 'primary.600',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
})

export const tableCellRecipe = cva({
  base: {
    p: 3,
    borderBottom: '1px solid',
    borderColor: 'dark.border',
    fontSize: 'sm',
  },
  variants: {
    align: {
      left: { textAlign: 'left' },
      center: { textAlign: 'center' },
      right: { textAlign: 'right' },
    },
    type: {
      header: {
        fontWeight: 'semibold',
        color: 'primary.300',
        textTransform: 'uppercase',
        fontSize: 'xs',
        letterSpacing: 'wider',
      },
      body: {
        color: 'dark.text',
      },
    },
  },
})

export const tableRowRecipe = cva({
  base: {
    transition: 'background 0.2s',
  },
  variants: {
    interactive: {
      true: {
        cursor: 'pointer',
        _hover: {
          bg: 'dark.surface',
        },
      },
    },
    selected: {
      true: {
        bg: 'primary.900',
        _hover: {
          bg: 'primary.800',
        },
      },
    },
  },
})
```

### コンポーネント実装例

```tsx
// components/ui/LogTable.tsx
import { useReactTable } from '@tanstack/react-table'
import {
  tableRecipe,
  tableHeaderRecipe,
  tableCellRecipe,
  tableRowRecipe
} from '@/styles/recipes/components/table.recipe'

export function LogTable({ data, columns }) {
  const table = useReactTable({
    data,
    columns,
    // TanStack Table設定
  })

  return (
    <table className={tableRecipe()}>
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th
                key={header.id}
                className={tableHeaderRecipe()}
              >
                {header.renderHeader()}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr
            key={row.id}
            className={tableRowRecipe({
              interactive: true,
              selected: row.getIsSelected()
            })}
          >
            {row.getVisibleCells().map(cell => (
              <td
                key={cell.id}
                className={tableCellRecipe({ type: 'body' })}
              >
                {cell.renderCell()}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

### スタイル管理のベストプラクティス

1. **一貫性の確保**
   - すべてのスタイルはレシピ経由で適用
   - トークンを必ず使用（マジックナンバー禁止）

2. **再利用性の向上**
   - 共通パターンは別レシピとして抽出
   - 複数箇所で使うスタイルは必ずレシピ化

3. **メンテナンス性**
   - レシピファイルは機能単位で分割
   - 1ファイル1レシピを基本とする

4. **パフォーマンス**
   - 使用していないバリアントは自動削除される
   - ビルド時に最適化

### 移行戦略

#### Phase 1: 既存CSSの移行
```bash
# 1. 既存のCSS Modulesを一時的に共存
# 2. レシピを順次作成
# 3. コンポーネントを段階的に移行
```

#### Phase 2: 完全移行
```bash
# 1. すべてのコンポーネントをレシピ使用に変更
# 2. CSS Modulesファイルを削除
# 3. globals.cssをPanda生成のみに
```

## 🚀 次のステップ

1. **即座に実行**
   - Panda CSS パッケージインストール
   - panda.config.ts 作成
   - 基本トークン設定
   - レシピディレクトリ構造作成

2. **MVP開発時**
   - 必要最小限のコンポーネントレシピ作成
   - TanStack Table スタイル統合
   - 既存CSSの段階的移行

3. **将来の拡張**
   - アニメーション設定
   - レスポンシブデザイン強化
   - ダークモード切り替え（現在は固定）

## 📚 参考資料
- [Panda CSS Documentation](https://panda-css.com)
- [Next.js + Panda CSS Guide](https://panda-css.com/docs/installation/nextjs)
- [TanStack Table Styling](https://tanstack.com/table/latest/docs/framework/react/examples/basic)