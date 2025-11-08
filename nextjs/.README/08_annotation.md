# /annotation 実装まとめ

## 全体像
- ルート `src/app/annotation/page.tsx` はサーバーコンポーネントで、クライアント専用の `AnnotationCanvasClient` を描画するだけの薄いエントリーポイント。
- UI ロジックは `src/app/annotation/AnnotationCanvasClient.tsx` に集約されており、Panda CSS (`css` ユーティリティ) でキャンバスセクションとキューセクションの 2 カラムレイアウトを構成。
- 画面初期化時に `/api/annotation` から暗号化済みログを模した多角形座標 JSON を取得し、`public/annotation-sample.png` に重ねて描画するモックダッシュボード。

## レイヤー構成
- **ベースレイヤー (Layer1):** `drawScene` 開始時に `annotation-sample.png` をキャンバス全面へ描画。解析対象のスクリーンショットやログビューの静止画を表現。
- **アノテーションレイヤー (Layer2):** `regionDataRef` に保持した Path2D 群をループし、通常=淡いブルー、ホバー中=濃いブルー、キュー投入済み=赤系、と状態別に塗り分け。ホバーとキューの交差状態も考慮してアルファ値／ストローク色を切り替え、単一レイヤー内で状態ヒートマップを実現。
- **Layer3 (範囲選択 + メタ):** Canvas にはオレンジ色の半透明矩形と破線枠で範囲選択結果を重畳し、DOM 側では `overlayBadge` / `loadingOverlay` / `errorBanner` とサイドパネルがメタ情報や操作 UI を提供。矩形に完全に内包されるポリゴンを一括で追加 / 解除できるインタラクション層。
- これらのレイヤーは React 状態で同期され、Canvas の再描画トリガー (`isImageReady`, `regionVersion`, `removalQueue`, `hoveredRegionId`) と DOM レイヤーが常に同じソースデータを参照する構造になっている。

## クライアント UI (`AnnotationCanvasClient`)
- `useRef` で `canvas`, `context`, `image`, `regionSource`, `regionData` を保持。`regionSource` は API から受け取った生の頂点列、`regionData` は `Path2D` を組み立て直して Canvas ヒットテストに使うレンダリング用キャッシュ。
- 状態管理:
  - `hoveredRegionId` / `hoveredRegion`: ホバー中ポリゴンを検出し、オーバーレイバッジに score / IoU / bbox / 頂点数を表示。
  - `removalQueue`: Canvas クリックまたは「キューから除外」ボタンでトグルされる誤認識除去キュー。`queueRegions` で詳細リストを生成。
  - `statusMessage`: 「保存ボタン (モック)」押下時に件数付きメッセージを 3.2 秒間表示。実際の保存処理は未実装のスタブ。
  - `errorMessage`: API 失敗、画像ロード失敗、Canvas 初期化失敗などを捕捉して `AlertBanner` 代替の簡易バナーで提示。
  - `isFetching` と `loadingOverlay`、`isImageReady` / `regionVersion`: データ取得と画像ロード完了の同期を分離し、再描画トリガーを明確化。
  - `selectionMode`: `"click"` / `"range"` をキャンバス直下のモードトグルボタンで切り替え。`rangeSelectionRef` / `isRangeSelectingRef` が Layer3 の矩形描画と判定に利用される。
- 描画処理:
  - `buildRegionPaths` で `Path2D` を構築し、`drawScene` が背景画像描画後に全ポリゴンを塗り分け。ホバー時は線幅アップ、キュー投入時は赤系で強調。
  - ポインタイベント (`onPointerMove`, `onPointerDown`) では Canvas 上のクライアント座標を実ピクセルにスケールし `context.isPointInPath` で領域を逆引き。`AbortController` 付き `fetch` でアンマウント時のメモリリークを回避。
  - 範囲選択時は `rangeSelectionRef` に保持した矩形をオレンジ色の破線＋半透明塗りで Layer3 に重ね描画し、ドラッグ中も `drawScene` を再実行してライブプレビューする。範囲内にある領域はキューへの追加と解除をトグル動作で処理し、Layer2 と同一の `removalQueue` を共有する。
- サイドパネル:
  - `queueList` に現在のキュー内容を列挙し、`Button`（`@/components/ui/Button`）で個別除外・一括クリア・モック保存操作を提供。
  - ヘルパーテキストで「座標 JSON はサーバー側で保護されトークンで取得」と説明しつつ、キュー操作に特化した UI をまとめている。

## データ取得・API フロー
- `src/app/api/annotation/route.ts` の `GET` は `await cookies()` で cookie store を取得し、`annotation-token` が未発行または失効している場合は新たに発行。
- アノテーションデータは `input/annotation.json` をローカルファイルから読み込み (`fs.readFile`)、`{ ok: true, annotation }` として返却。レスポンスヘッダーは `Cache-Control: no-store` 固定。
- エラー時はログ出力(`console.error`)後 `{ ok: false, error: "Failed to load annotation data" }` を 500 で返しつつ、必要ならトークンだけは発行してクッキーに保存。

## トークンユーティリティ (`src/app/annotation/token.ts`)
- `ANNOTATION_COOKIE_NAME = "annotation-token"`、`TOKEN_MAX_AGE_SECONDS = 10*60`。`ANNOTATION_TOKEN_SECRET` (未設定時は `dev-annotation-secret`) を使った HMAC-SHA256 で `timestamp.signature` 形式のワンタイムトークンを生成。
- `verifyAnnotationToken` は (1) `.` 区切りの2要素か、(2) timestamp が数値か、(3) 10 分以内か、(4) HMAC が `timingSafeEqual` で一致するかを順に検証し、失敗時は即 `false` を返す。
- API では常に「失効していたら新しいトークンを発行する」挙動になっており、フロントは `fetch` 時に `credentials: "include"` を指定するだけでよい。

## 依存データ / アセット
- `public/annotation-sample.png`: キャンバスに敷く背景。`IMAGE_PATH` は固定文字列。
- `input/annotation.json`: Mask R-CNN 推論風の `boundaries` 配列。各エントリは `polygon.vertices`(x,y), `bbox`, `score`, `iou` を持ち、クライアントでは `AnnotationRegion` へ再マッピングされる。
- Panda CSS スタイルは `AnnotationCanvasClient.tsx` 内で完結しており、styled-system の生成物と同期が取れている前提。

## 既知の制約・補足
- 保存処理はフロント側でのメッセージ表示のみ。実際の API 書き込みや S3 更新とは連動していない。
- アノテーション JSON はレポジトリに含まれる静的ファイルを読み込むだけで暗号化/復号は未実装（将来的に S3 + 復号フローへ差し替え予定）。
- トークンシークレット未設定時は固定の `dev-annotation-secret` が使われるため、実運用では環境変数の設定と HTTPS 前提 (cookie secure) が必要。
- 画像サイズは固定 (1049x695) のため、別サイズを扱う場合は `CANVAS_WIDTH/HEIGHT` と `aspectRatio` の更新が必須。
- 範囲選択は軸平行の矩形で「ポリゴンの全頂点が内側に含まれる」ことを条件にしているため、部分的な交差や斜め選択には対応していない。
