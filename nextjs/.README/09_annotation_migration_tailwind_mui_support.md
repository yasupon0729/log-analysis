# アノテーション機能 (`/annotation`) 移行ガイド

このガイドでは、既存の Next.js プロジェクトの `/annotation` 機能を、**Next.js v14 (App Router)**、**Tailwind CSS**、**Material UI (MUI)** を使用する新しいプロジェクトへ移植する手順を詳述します。

## 1. 概要と依存関係

移行元の機能は、サーバー上の JSON/CSV ファイルを読み込み、Canvas 上で領域を描画・保存する機能です。
外部の Canvas ライブラリ（Fabric.js 等）は使用しておらず、**標準の HTML5 Canvas API** で実装されています。

### 必要な依存パッケージ (移行先)

移行先の `package.json` に以下が含まれていることを確認してください（バージョンは目安）。

```bash
npm install @mui/material @emotion/react @emotion/styled
npm install lucide-react
npm install clsx
# tailwindcss は init 済みであること
```

*   **@mui/material**: UI コンポーネント (Slider, Button, Dialog 等)
*   **lucide-react**: アイコン (Trash2, Eye, EyeOff, Save, RotateCcw 等)
*   **clsx**: クラス名の条件付き結合（Tailwind と相性が良い）

## 2. ディレクトリ構造の対応

以下のようにファイルを配置・作成してください。

| 移行元 (log-analysis-codex) | 移行先 (New Next.js v14 App) | 役割 |
| :--- | :--- | :--- |
| `src/app/annotation/page.tsx` | `src/app/annotation/page.tsx` | ページのエントリーポイント |
| `src/app/annotation/AnnotationCanvasClient.tsx` | `src/components/annotation/AnnotationCanvasClient.tsx` | **中核コンポーネント (要書き換え)** |
| `src/app/annotation/token.ts` | `src/lib/annotation/token.ts` | 簡易トークン認証ロジック |
| `src/app/api/annotation/route.ts` | `src/app/api/annotation/route.ts` | データ取得 API |
| `src/app/api/annotation/review/route.ts` | `src/app/api/annotation/review/route.ts` | レビュー保存 API |
| `src/app/api/annotation/additions/route.ts` | `src/app/api/annotation/additions/route.ts` | 追加領域保存 API |
| `input/*.{json,csv}` | `input/` (プロジェクトルート) | マスタデータと保存データ |
| `public/annotation-sample.png` | `public/annotation-sample.png` | 背景画像 |

---

## 3. データとアセットの準備

1.  **データディレクトリ**: プロジェクトルートに `input` フォルダを作成し、以下のファイルを配置します。
    *   `annotation.json` (境界データ)
    *   `data.csv` (属性データ)
    *   `annotation-review.json` (空の初期ファイル `{ "version": 1, "items": [] }` を作成)
    *   `annotation-additions.json` (空の初期ファイル `{ "version": 1, "items": [] }` を作成)

2.  **画像**: `public` フォルダに `annotation-sample.png` を配置します。

---

## 4. バックエンド (API) の移行

API Route は標準的な Node.js の `fs` モジュールを使用しており、ほぼそのままコピー可能です。
ただし、`token.ts` のインポートパス修正が必要です。

### A. トークンロジック (`src/lib/annotation/token.ts`)

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

// 環境変数、または固定の秘密鍵
const SECRET_KEY = process.env.ANNOTATION_SECRET_KEY || "development-secret-key-change-this";
export const ANNOTATION_COOKIE_NAME = "annotation-session-token";
export const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24; // 1 day

export function generateAnnotationToken(): string {
  const timestamp = Date.now().toString();
  const hmac = createHmac("sha256", SECRET_KEY);
  hmac.update(timestamp);
  const signature = hmac.digest("hex");
  return `${timestamp}.${signature}`;
}

export function verifyAnnotationToken(token: string): boolean {
  const [timestamp, signature] = token.split(".");
  if (!timestamp || !signature) return false;

  const hmac = createHmac("sha256", SECRET_KEY);
  hmac.update(timestamp);
  const expectedSignature = hmac.digest("hex");

  // タイミング攻撃対策のための比較
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
```

### B. データ取得 API (`src/app/api/annotation/route.ts`)

`input/data.csv` のパースロジックを含みます。

```typescript
import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ANNOTATION_COOKIE_NAME,
  generateAnnotationToken,
  TOKEN_MAX_AGE_SECONDS,
  verifyAnnotationToken,
} from "@/lib/annotation/token"; // パス調整

export async function GET() {
  const cookieStore = cookies(); // Next.js 14 では await不要な場合もあるが、15に合わせてawait推奨
  const token = cookieStore.get(ANNOTATION_COOKIE_NAME)?.value ?? null;
  const hasValidToken = token && verifyAnnotationToken(token);
  const issuedToken = hasValidToken ? null : generateAnnotationToken();

  try {
    const baseDir = path.join(process.cwd(), "input");
    // ... (オリジナルのロジックをコピー。fs.readFile で annotation.json と data.csv を読む)
    // ... (CSVパースとデータ結合のロジックは変更なし)
    
    // レスポンス返却部分
    const response = NextResponse.json({ ok: true, annotation: { ... } });
    
    if (issuedToken) {
      response.cookies.set({
        name: ANNOTATION_COOKIE_NAME,
        value: issuedToken,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: TOKEN_MAX_AGE_SECONDS,
      });
    }
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
```

※ `review/route.ts` と `additions/route.ts` も同様に `src/app/api/annotation/...` にコピーし、ファイルパス定数 (`input/...`) が正しいか確認してください。

---

## 5. フロントエンド (UI) の移行

ここが最大の作業です。`AnnotationCanvasClient.tsx` の Panda CSS (`css({...})`) を Tailwind と MUI に置き換えます。

### ファイル: `src/components/annotation/AnnotationCanvasClient.tsx`

#### 構造の変更点
1.  `"use client";` を先頭に記述。
2.  `styled-system/css` の import を削除。
3.  MUI コンポーネント (`Box`, `Typography`, `Slider`, `Button`, `Paper`) を import。
4.  Lucide React からアイコンを import。

#### スタイル置換ガイド

**1. レイアウトコンテナ**

*   **旧 (Panda):**
    ```typescript
    <div className={css({ display: "flex", height: "100vh", bg: "#0f172a", color: "white" })}>
    ```
*   **新 (Tailwind):**
    ```tsx
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
    ```

**2. キャンバスエリア (メイン)**

*   **旧:** Flex grow, relative positioning
*   **新:**
    ```tsx
    <div className="relative flex-1 bg-black/50 overflow-hidden flex items-center justify-center">
      {/* Canvas Wrapper */}
      <div 
        className="relative shadow-2xl"
        style={{ width: 800, height: 600 }} // アスペクト比固定のためstyle推奨
      >
        <img src="/annotation-sample.png" className="absolute inset-0 w-full h-full pointer-events-none select-none" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" />
        
        {/* ホバー時のツールチップ */}
        {hoveredBoundary && (
          <div 
            className="absolute z-10 bg-slate-800/90 text-white p-2 rounded shadow-lg border border-slate-600 pointer-events-none whitespace-pre text-sm"
            style={{ 
              left: mousePos.current.x + 10, 
              top: mousePos.current.y + 10 
            }}
          >
            {/* 内容 */}
          </div>
        )}
      </div>
      
      {/* ズームコントロール (画面右下など) */}
      <Paper 
        className="absolute bottom-4 right-4 p-2 flex items-center gap-2 bg-slate-800 text-white"
        elevation={4}
      >
        <ZoomIn size={16} />
        <Slider value={zoom} onChange={...} min={0.5} max={3} step={0.1} sx={{ width: 100 }} />
      </Paper>
    </div>
    ```

**3. サイドバー (右側パネル)**

*   **旧:** `width: "320px"`, `borderLeft: "1px solid ..."`
*   **新:**
    ```tsx
    <div className="w-80 flex flex-col border-l border-slate-700 bg-slate-800">
      {/* ヘッダー */}
      <div className="p-4 border-b border-slate-700 font-bold text-lg flex items-center justify-between">
        <span>Annotation Tool</span>
        <div className="flex gap-2">
           <Button variant="contained" size="small" startIcon={<Save size={14} />} onClick={handleSave}>
             Save
           </Button>
        </div>
      </div>
      
      {/* スクロールエリア */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* ステータスセクション */}
        <div className="space-y-2">
          <Typography variant="subtitle2" className="text-slate-400">STATUS</Typography>
          <div className="flex items-center justify-between bg-slate-900 p-2 rounded border border-slate-700">
            <span>Review Progress</span>
            <span className="font-mono text-cyan-400">{stats.reviewed} / {stats.total}</span>
          </div>
        </div>

        {/* フィルタセクション */}
        <div className="space-y-2">
          <Typography variant="subtitle2" className="text-slate-400">FILTER</Typography>
          {/* MUI Slider for Range */}
          <Box px={1}>
             <Slider 
               value={range} 
               onChange={...} 
               valueLabelDisplay="auto"
               sx={{ color: '#22d3ee' }} // Tailwind cyan-400
             />
          </Box>
        </div>
        
        {/* リスト表示 */}
        <div className="space-y-2">
           {boundaries.map(b => (
             <div 
               key={b.id}
               className={clsx(
                 "p-2 rounded border cursor-pointer transition-colors text-sm flex items-center justify-between",
                 b.isReviewed ? "border-green-800 bg-green-900/20" : "border-slate-700 bg-slate-900/50",
                 selectedId === b.id && "ring-2 ring-cyan-500"
               )}
               onClick={() => handleSelect(b.id)}
             >
               <span>ID: {b.id}</span>
               {/* アイコン類 */}
             </div>
           ))}
        </div>
      </div>
    </div>
    ```

#### 主要ロジックの移植時の注意点

1.  **Canvas 描画ロジック**: `useEffect` 内の `renderCanvas` 関数は、DOM 要素への参照 (`canvasRef.current`) と標準 API (`ctx.beginPath()`, `ctx.fillStyle`) しか使っていないため、**100% コピー可能**です。
2.  **座標変換**: マウスイベント (`handleMouseMove` 等) で `e.nativeEvent.offsetX` を使用している場合、Canvas の CSS サイズと内部解像度 (`width`, `height` 属性) が一致しているか注意してください。
3.  **非同期通信**: `fetch('/api/annotation/...')` 部分もそのまま動作します。

## 6. 型定義の整理

`src/types/annotation.ts` などを作成し、共通の型定義を行うと管理しやすくなります。

```typescript
export interface Point {
  x: number;
  y: number;
}

export interface AnnotationItem {
  id: string | number;
  points: Point[]; // 多角形の頂点
  bbox: [number, number, number, number]; // [x, y, w, h]
  isReviewed?: boolean;
  metrics?: Record<string, number>;
  // ... その他必要なプロパティ
}
```

## 7. ページコンポーネントの実装

`src/app/annotation/page.tsx`:

```tsx
import AnnotationCanvasClient from "@/components/annotation/AnnotationCanvasClient";

export const metadata = {
  title: "Annotation Tool",
};

export default function AnnotationPage() {
  return (
    <main className="h-screen w-screen overflow-hidden">
      <AnnotationCanvasClient />
    </main>
  );
}
```

以上で移植は完了です。`bun dev` (または `npm run dev`) でサーバーを起動し、`/annotation` にアクセスして動作を確認してください。
