# /annotation 移植手順 (Next.js v14 + Tailwind + MUI)

> 前提: 現在の実装は Panda CSS + App Router (Next.js 15) で動作。移植先は Next.js 14 (App Router 想定) かつ Tailwind CSS と Material UI (MUI) を採用。ここでは機能を欠落させずに別プロジェクトへ持って行くための具体的な ToDo と注意点をすべて列挙する。

## 1. 事前準備 (コピーすべきもの)
- アセット: `public/annotation-sample.png` をそのまま移植先の `public/` へ配置 (キャンバス背景で固定パス `/annotation-sample.png` を参照)。
- データファイル (いずれも `input/` 直下): `annotation.json` (ポリゴン座標) / `data.csv` (メトリクス) / `annotation-review.json` (レビュー保存先) / `annotation-additions.json` (手動加筆保存先)。パスが変わる場合は API 側の `path.join(process.cwd(), "input", ...)` を揃える。
- 環境変数: `ANNOTATION_TOKEN_SECRET` (未設定時は dev-annotation-secret にフォールバック)。実運用では HTTPS 前提で `secure` クッキーとなる。
- 依存モジュール: fs/path, crypto(HMAC), NextResponse。Tailwind/MUI へのスタイル置換なので Panda 依存は不要。
- npm 追加インストール例 (移植先で不足している場合):
  - `@mui/material @emotion/react @emotion/styled` (MUI 本体)
  - `lucide-react` (アイコン類)
  - `clsx` (Tailwind クラス結合ヘルパー)
  - Tailwind は `npx tailwindcss init` 済みであることを前提

## 2. API レイヤー移植 (App Router /api/annotation*)
### 2-1. `/api/annotation` (GET 専用)
- `annotation.json` と `data.csv` を読み込み、CSV 先頭列 (`#` または `id`) と `boundaries[i].id` を突合して `metrics` を付与する処理をそのまま移植。
- CSV: BOM 除去 + ダブルクォート剥がし + trim (`sanitizeCell`) → ヘッダを正規化し、ID 列以外を `metricStats` (label/min/max) として集計。
- ID が足りない / 数値でない / メトリクス列が 0 件なら 500 を返す現仕様を維持。
- レスポンス: `{ ok: true, annotation: { boundaries: augmentedBoundaries, metricStats } }` を `Cache-Control: no-store` 付きで返す。
- トークン: `annotation-token` クッキーを httpOnly + sameSite=lax + secure(本番のみ) + maxAge=10分でセット。既存の `generateAnnotationToken` / `verifyAnnotationToken` を `src/app/annotation/token.ts` ごと移植。Next.js 14 では `cookies()` が Promise でないため、`const cookieStore = cookies();` と同期呼び出しに直してもよい。

### 2-2. `/api/annotation/review`
- ファイルパス: `input/annotation-review.json`。存在しなければ初期値 `{ version: 1, updatedAt: now, items: [] }` を生成 (`ensureReviewFile`)。
- `GET`: JSON を返すだけ (`Cache-Control: no-store`)。
- `POST`: { version?, items } を受け取り、version 不一致は 409 で最新を返す。`normalizeReviewItem` で id/origin(`manual|filter`)/status(`queued|removed`)/filtersApplied(min/max/range のスナップショット) を正規化。保存後は version+1・更新日時付きで返却。

### 2-3. `/api/annotation/additions`
- ファイルパス: `input/annotation-additions.json`。存在しなければ初期値 version=1/空配列を生成。
- `GET`: JSON を返すだけ (`Cache-Control: no-store`)。
- `POST`: { version?, items } を受け取り、version 不一致は 409。`normalizeAdditionItem` で points>=3 を強制し、bbox が欠けていれば points から算出。id は string 化、label/score/iou/metrics にデフォルトを与えて保存。

### 2-4. エラーとログ
- いずれの API も失敗時は 500 + `{ ok: false, error: "..."} ` を返し、console.error でログを残すのみ。運用環境では Pino 等へ差し替えを検討。

## 3. フロントエンド移植 (ページ + クライアントコンポーネント)
### 3-1. ルーティング
- `src/app/annotation/page.tsx` 相当のサーバーコンポーネントでクライアントコンポーネントを描画する構造はそのまま踏襲。App Router で `export const dynamic = "force-dynamic"` などの設定がある場合は移植先のキャッシュ方針に合わせて再設定。

### 3-2. キャンバス/状態管理の要件
- レイヤー構成: 背景画像 (Layer1) → ポリゴン描画 (Layer2: 通常/ホバー/キュー/フィルタで色分け) → 範囲選択矩形・オーバーレイ・サイドパネル (Layer3)。
- 必須 state/ref 群 (命名は任意だが機能は維持):
  - `canvasRef`, `contextRef`, `imageRef`, `regionSourceRef`(API 生データ), `regionDataRef`(Path2D キャッシュ)。
  - `hoveredRegionId/hoveredRegion`, `removalQueue`(reviewEntries), `selectionMode`(click/range), `rangeSelectionRef`, `isRangeSelectingRef`。
  - `metricStats`, `metricFilters`(min/max/range のフィルタビルダー), `filterOrder`, `autoFilteredIds`。
  - `statusMessage` / `errorMessage` / `isFetching` / `isSavingReview` / `isImageReady` / `regionVersion`。
- イベント: pointermove/down/up/leave/cancel で `canvas.setPointerCapture` / `releasePointerCapture` を確実に行い、範囲選択中でもサイドバー操作に戻れるようにする。`context.isPointInPath` を用いたヒットテストと座標スケール調整を忘れない。
- 描画: `buildRegionPaths` → `drawScene` で画像を貼り、その後ポリゴンを状態別に塗り分け。フィルタ該当領域はグレー系、ホバーは線幅増、キューは赤系。範囲選択中はオレンジの半透明矩形＋破線を重ねる。

### 3-3. UI パーツを Tailwind + MUI で置き換える指針
- レイアウト: Tailwind の `grid` / `grid-cols-[2fr_1fr]` や `flex` で 2 カラム。ダーク基調なら `bg-slate-900 text-slate-100` などをベースに、MUI の ThemeProvider で palette を合わせる。
- ボタン/トグル: MUI Button + IconButton + ToggleButtonGroup でモード切替 (click/range)、レビュー保存、フィルタ適用。Tailwind は余白・レイアウト補助に限定。
- スライダー: MUI Slider を min/max/range 用に再利用。ラベル/値の表示は `valueLabelDisplay` を活用し、Tailwind でカード枠や間隔を調整。
- アラート/バナー: MUI Alert で `variant="filled"` などを使い、エラー/情報メッセージを表示。
- チップ/タグ: MUI Chip で origin(手動/フィルタ)や status を色分け。
- リスト/カード: MUI Card + List でレビューキューと未保存加筆リストを表示。Tailwind で gap/padding を補強。
- オーバーレイバッジ: 画面右上などに絶対配置する箇所は Tailwind の `absolute top-2 right-2` などで位置を固定し、MUI Paper/Chip で中身を装飾。

### 3-4. 機能別の実装メモ
- 初期データ取得: `/api/annotation` を fetch (`credentials: "include"`)。`annotation.boundaries` と `metricStats` を state に設定 → `buildRegionPaths` 実行。
- レビューキュー:
  - クリック/範囲選択で `removalQueue` に id を追加。origin=`manual` をセット。
  - 「フィルタ結果をキューに追加」ボタンで `autoFilteredIds` を origin=`filter` 付きで投入。
  - 保存: `/api/annotation/review` に { version, items } を POST。409 時は返却データで state を上書きして再送。
- フィルタビルダー:
  - `metricStats` から追加できるフィルタ一覧を作る。min/max/range モード切替、enable/disable、削除を実装。
  - `autoFilteredIds` を再計算し、Canvas の色分けとキュー投入処理に反映。
- 手動加筆 (追加ポリゴン):
  - キャンバス上でクリック or ボタン押しながらドラッグで頂点追加。3 点以上で「確定」ボタンを押すと一時リストに追加。
  - 保存: `/api/annotation/additions` に { version, items } を POST。保存後は API レスポンスをそのまま state に反映。
- オーバーレイ情報: `hoveredRegion` の score/iou/bbox/頂点数、キュー件数、フィルタ件数などをバッジ表示。
- ローディング/エラー: `isFetching`/`isSavingReview`/`errorMessage` で Canvas の半透明オーバーレイや Alert を表示。

## 4. 型・データ構造の写経ポイント
- `AnnotationRegion` 相当: { id: string|number; points: {x,y}[]; bbox: [x,y,w,h]; score: number; iou: number; metrics: Record<string, number> }。`annotation.json` の `boundaries` をこの形に正規化して Path2D を構築。
- `metricStats`: Record<key, { label: string; min: number; max: number }>.
- `ReviewItem`: { id: string; origin: "manual"|"filter"; status: "queued"|"removed"; createdAt: string; filtersApplied?: { key,label,mode("min"|"max"|"range"),min,max }[] }.
- `AdditionItem`: { id: string; label: string; points: {x,y}[]; bbox: [number,number,number,number]; score: number; iou: number; metrics: Record<string, number> }.
- API レスポンス: すべて `{ ok: boolean, ... }` で、競合時のみ 409 + 最新データを返す。

## 5. Tailwind/MUI へのスタイル置換方針 (Panda CSS からの対応表)
- レイアウトコンテナ: Panda の `css({ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" })` → Tailwind `grid grid-cols-[2fr_1fr] gap-4 lg:gap-6`.
- カード枠: `bg-slate-900/80 border border-slate-800 rounded-lg p-4 shadow` をベースに、MUI Card で elevation を付与。
- ボタン: Panda の `Button` 相当を MUI Button `variant="contained"` / `color="primary"` で置換。サブボタンは `variant="outlined"`。
- スイッチ/トグル: Panda のトグルボタン → MUI ToggleButtonGroup、Tailwind で周囲の余白を補正。
- スライダー: Panda カスタム → MUI Slider (marks=metricStats の min/max、step 設定)。
- バッジ: Panda の `Badge` → MUI Chip / Badge。位置指定は Tailwind で absolute。
- オーバーレイ: `absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center` を Tailwind で表現し、中身は MUI CircularProgress + Typography。

## 6. ディレクトリ対応マップ (09 の配置表を統合)
| 移行元 (本リポジトリ) | 移植先 (Next.js v14 + Tailwind + MUI) | 役割 |
| --- | --- | --- |
| `src/app/annotation/page.tsx` | `src/app/annotation/page.tsx` | ページエントリ |
| `src/app/annotation/AnnotationCanvasClient.tsx` | `src/components/annotation/AnnotationCanvasClient.tsx` など | 中核 UI/Canvas |
| `src/app/annotation/token.ts` | `src/lib/annotation/token.ts` | トークンユーティリティ |
| `src/app/api/annotation/route.ts` | 同パス | メインデータ API |
| `src/app/api/annotation/review/route.ts` | 同パス | レビュー保存 API |
| `src/app/api/annotation/additions/route.ts` | 同パス | 追加領域保存 API |
| `input/*.{json,csv}` | `input/` (ルート) | マスタ/保存データ |
| `public/annotation-sample.png` | `public/annotation-sample.png` | 背景画像 |

## 7. 移植手順 (作業順のチェックリスト)
1) 移植先リポジトリに `public/annotation-sample.png` と `input/*.json` `input/data.csv` を配置し、gitignore ルールを確認。  
2) `src/app/annotation/token.ts` を移植し、`ANNOTATION_TOKEN_SECRET` を `.env.local` に追加。Next14 では `await cookies()` を外すか、そのままでも Promise 対応しておく。  
3) `/api/annotation`, `/api/annotation/review`, `/api/annotation/additions` の Route Handler を実装。ファイルパスやレスポンスフォーマット、version 競合時の 409 挙動を現行通りに写す。  
4) `/annotation/page.tsx` と `AnnotationCanvasClient` 相当のクライアントコンポーネントを新設。フェッチ処理と state 構造は既存に合わせ、スタイルのみ Tailwind+MUI に置換。  
5) Canvas ロジック (Path2D 生成、drawScene、pointer キャプチャ、範囲選択、フィルタリング、キュー管理、加筆モード) を既存のアルゴリズムで移植。ログ出力が必要なら console か移植先のロガーを使う。  
6) UI 置換: Panda のクラスを Tailwind クラスへ置換し、ボタン/スライダー/アラートなどは MUI コンポーネントに差し替え。ThemeProvider でダーク＋ブルー基調を設定。  
7) 手動動作確認:  
   - `/annotation` 表示、背景画像とポリゴンが描画される。  
   - ホバーでバッジ表示、クリック/範囲選択でキューに入る。  
   - フィルタを追加し、色分けが変わり「フィルタ結果をキューに追加」が動く。  
   - レビュー保存→ `annotation-review.json` 更新、409 ハンドリング確認。  
   - 加筆モードでポリゴン追加→保存→再読み込みで描画される。  
   - クッキーに `annotation-token` が発行されている。  
8) 必要なら `bun run build` / `npm run build` でビルド検証 (3ファイル以上触った場合は必須)。

## 8. 落とし穴と対応策
- Pointer Capture の取り扱い: `pointerdown` で `setPointerCapture`、`pointerup/leave/cancel` とモード切替時、アンマウント時に `releasePointerCapture` を必ず実行。漏れるとサイドバークリックが効かない。
- 画像サイズ依存: 現行は 1049x695 固定。別画像を使う場合はキャンバス幅/高さやアスペクト比を調整し、bbox/points のスケール計算を確認。
- メトリクス整合性: `data.csv` の ID と `annotation.json` の id/boundaries が一致しないと 500 になる。移植先データでもサンプルと同じ列構造を維持する。
- Cookie 周り: 本番ドメインで secure フラグが付与される。ローカルで https でない場合は `secure: false` に落とすか、開発環境だけ条件分岐。
- MUI + Tailwind 共存: クラス衝突は少ないが、Tailwind の `preflight` が MUI のリセットと被る場合は MUI の CssBaseline を導入し、Tailwind 側は必要に応じてカスタムする。
- 競合解決: review/additions の version 競合時は API が最新を返すので、UI 側で差分をマージするか全置換するかを決めて実装 (現行は全置換)。

## 9. 参考 (元実装の要点抜粋 + 09 の UI 置換例)
- 多角形状態色分け: 通常=淡ブルー、ホバー=濃ブルー、キュー=赤系、フィルタ該当=グレー系。Layer2 でまとめて描画。
- フィルタモード: min/max/range を UI で切替、複数フィルタを組み合わせて `autoFilteredIds` を算出。
- 加筆モード: クリック追加 + ドラッグ連続追加、3 点以上で確定→保存→描画。未保存一覧から個別削除/全削除可能。
- API はすべて `{ ok: boolean }` を返し、ローカル JSON を直接読み書きするモック構成。S3/DB 連携は未実装なので、必要ならストレージ層を差し替える。
- UI 置換の最小雛形 (Tailwind + MUI):
  ```tsx
  <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
    <div className="relative flex-1 bg-black/50 overflow-hidden flex items-center justify-center">
      <div className="relative shadow-2xl" style={{ width: 800, height: 600 }}>
        <img src="/annotation-sample.png" className="absolute inset-0 w-full h-full pointer-events-none select-none" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" />
      </div>
      <Paper className="absolute bottom-4 right-4 p-2 flex items-center gap-2 bg-slate-800 text-white" elevation={4}>
        <ZoomIn size={16} />
        <Slider value={zoom} onChange={...} min={0.5} max={3} step={0.1} sx={{ width: 100 }} />
      </Paper>
    </div>
    <div className="w-80 flex flex-col border-l border-slate-700 bg-slate-800">
      <div className="p-4 border-b border-slate-700 font-bold text-lg flex items-center justify-between">
        <span>Annotation Tool</span>
        <Button variant="contained" size="small" startIcon={<Save size={14} />} onClick={handleSave}>
          Save
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* サイドバー各カードやフィルタ/キュー一覧をここに配置 */}
      </div>
    </div>
  </div>
  ```
