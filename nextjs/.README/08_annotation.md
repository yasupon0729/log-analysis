# /annotation 実装まとめ

## 全体像
- ルート `src/app/annotation/page.tsx` はサーバーコンポーネントで、クライアント専用の `AnnotationCanvasClient` を描画するだけの薄いエントリーポイント。
- UI ロジックは `src/app/annotation/AnnotationCanvasClient.tsx` に集約されており、Panda CSS (`css` ユーティリティ) でキャンバスセクションとキューセクションの 2 カラムレイアウトを構成。
- 画面初期化時に `/api/annotation` から暗号化済みログを模した多角形座標 JSON と `input/data.csv` 由来のメトリクス (Area) を取得し、`public/annotation-sample.png` に重ねて描画するモックダッシュボード。

## レイヤー構成
- **ベースレイヤー (Layer1):** `drawScene` 開始時に `annotation-sample.png` をキャンバス全面へ描画。解析対象のスクリーンショットやログビューの静止画を表現。
- **アノテーションレイヤー (Layer2):** `regionDataRef` に保持した Path2D 群をループし、通常=淡いブルー、ホバー中=濃いブルー、キュー投入済み=赤系、と状態別に塗り分け。ホバーとキューの交差状態も考慮してアルファ値／ストローク色を切り替え、単一レイヤー内で状態ヒートマップを実現。
- **Layer3 (範囲選択 + メタ):** Canvas にはオレンジ色の半透明矩形と破線枠で範囲選択結果を重畳し、DOM 側では `overlayBadge` / `loadingOverlay` / `errorBanner` とサイドパネルがメタ情報や操作 UI を提供。矩形に完全に内包されるポリゴンを一括で追加 / 解除できるインタラクション層。
- これらのレイヤーは React 状態で同期され、Canvas の再描画トリガー (`isImageReady`, `regionVersion`, `removalQueue`, `hoveredRegionId`) と DOM レイヤーが常に同じソースデータを参照する構造になっている。

- `useRef` で `canvas`, `context`, `image`, `regionSource`, `regionData` を保持。`regionSource` は API から受け取った生の頂点列、`regionData` は `Path2D` を組み立て直して Canvas ヒットテストに使うレンダリング用キャッシュ。
- 状態管理:
  - `hoveredRegionId` / `hoveredRegion`: ホバー中ポリゴンを検出し、オーバーレイバッジに score / IoU / bbox / 頂点数を表示。
  - `reviewEntries` / `removalEntryList`: 手動クリックまたはフィルタ反映で誤認識除去候補に入った領域を ID ごとに保持。`origin`（manual/filter）、`status`、`filtersApplied` などを記録し、一覧表示や保存 API にそのまま渡す。
  - `statusMessage` / `errorMessage`: 操作フィードバックとエラー表示を統一的に管理し、一定時間後に自動で解除。
  - `isFetching` / `isSavingReview` / `isImageReady` / `regionVersion`: データ取得、レビュー保存、Canvas 初期化状態を個別に追跡して描画更新を制御。
  - `selectionMode`: `"click"` / `"range"` をキャンバス直下のモードトグルボタンで切り替え。`rangeSelectionRef` / `isRangeSelectingRef` が Layer3 の矩形描画と判定に利用される。
  - `metricStats` / `metricFilters` / `filterOrder`: `/api/annotation` から渡される全メトリクスの min/max/label を保持し、UI から任意の指標を追加・削除できるフィルタビルダーを実現。各フィルタは「下限」「上限」「範囲」の 3 モードに対応し、`autoFilteredIds` で該当領域を抽出して Canvas の塗り分けに反映する。
- 描画処理:
- `buildRegionPaths` で `Path2D` を構築し、`drawScene` が背景画像描画後に全ポリゴンを塗り分け。ホバー時は線幅アップ、キュー投入時は赤系で強調。
- しきい値フィルタに該当した領域は `autoFilteredIds` を介してグレー系のフィル・ストロークに切り替え、クリック選択とは独立した「自動フィルタ済み」の状態が一目で分かるようにしている。
  - ポインタイベント (`onPointerMove`, `onPointerDown`) では Canvas 上のクライアント座標を実ピクセルにスケールし `context.isPointInPath` で領域を逆引き。`AbortController` 付き `fetch` でアンマウント時のメモリリークを回避。
  - 範囲選択時は `rangeSelectionRef` に保持した矩形をオレンジ色の破線＋半透明塗りで Layer3 に重ね描画し、ドラッグ中も `drawScene` を再実行してライブプレビューする。範囲内にある領域はキューへの追加と解除をトグル動作で処理し、Layer2 と同一の `removalQueue` を共有する。
- サイドパネル:
  - `queueList` は `reviewEntries` を元に現在のキュー内容を列挙し、origin（フィルタ反映 / 手動選択）、status、適用フィルタのスナップショットを表示。`Button`（`@/components/ui/Button`）で個別除外・一括クリアが可能。
  - 「メトリクスしきい値」カードで CSV に含まれる任意指標をフィルタとして追加・削除できる。各フィルタは有効/無効トグル・モード切り替え（下限 / 上限 / 範囲）・スライダー・リセット/削除ボタンを備え、現在のデータ範囲と自動除外件数を即時表示。
  - 「フィルタ結果をキューに追加」ボタンで、現在のフィルタに該当する領域を origin=`filter` 付きでレビューキューへ反映。クリック/範囲選択による追加は origin=`manual` となり UI 上も区別できる。
  - `レビュー状態を保存` ボタンで `/api/annotation/review` に POST し、`annotation-review.json` を更新。競合時は API が最新データを返すため、再適用で整合性を保てる。
  - 「加筆モード（クリック＋ドラッグで多角形）」カードでは Canvas 上をクリックして頂点を追加し、ボタンを押しながらドラッグするとフリーハンドで頂点が連続追加される。3 点以上で「多角形を確定」→未保存リスト→`/api/annotation/additions` 保存という流れ。未保存一覧では個別削除 / 全破棄も可能。
  - ヘルパーテキストで「座標 JSON はサーバー側で保護されトークンで取得」と説明しつつ、フィルタ＆レビュー操作に特化した UI をまとめている。

## データ取得・API フロー
- `src/app/api/annotation/route.ts` の `GET` は `await cookies()` で cookie store を取得し、`annotation-token` が未発行または失効している場合は新たに発行。
- アノテーションデータは `input/annotation.json` と `input/data.csv` を同時に読み込み、先頭列 (`#` もしくは `id`) と `boundaries[i].id` を突き合わせた上で全メトリクスを `metrics` に埋め込む。さらに各列に対して `min/max/label` を `metricStats` としてレスポンスに付与し、フロントのフィルタビルダー初期化や表示名に利用。欠損や不整合 (ID 未一致 / 数値でない) を検出した場合は 500 を返して異常を明示する。レスポンスヘッダーは `Cache-Control: no-store` 固定。
- `/api/annotation/review` の `GET/POST` で `input/annotation-review.json` を読み書きし、除外キューの確定状態をバージョン付きで管理する。`POST` 時はオプションの `version` で競合検知を行い、保存済み内容と異なる場合は 409 を返して最新データを通知する。
- `/api/annotation/additions` の `GET/POST` で `input/annotation-additions.json` を読み書きし、手動加筆した領域の一覧を管理する。こちらも `version` を用いた楽観ロックを行い、保存成功時には最新の追加領域一覧が返却される。
- エラー時はログ出力(`console.error`)後 `{ ok: false, error: "Failed to load annotation data" }` を 500 で返しつつ、必要ならトークンだけは発行してクッキーに保存。

## トークンユーティリティ (`src/app/annotation/token.ts`)
- `ANNOTATION_COOKIE_NAME = "annotation-token"`、`TOKEN_MAX_AGE_SECONDS = 10*60`。`ANNOTATION_TOKEN_SECRET` (未設定時は `dev-annotation-secret`) を使った HMAC-SHA256 で `timestamp.signature` 形式のワンタイムトークンを生成。
- `verifyAnnotationToken` は (1) `.` 区切りの2要素か、(2) timestamp が数値か、(3) 10 分以内か、(4) HMAC が `timingSafeEqual` で一致するかを順に検証し、失敗時は即 `false` を返す。
- API では常に「失効していたら新しいトークンを発行する」挙動になっており、フロントは `fetch` 時に `credentials: "include"` を指定するだけでよい。

## 依存データ / アセット
- `public/annotation-sample.png`: キャンバスに敷く背景。`IMAGE_PATH` は固定文字列。
- `input/annotation.json`: Mask R-CNN 推論風の `boundaries` 配列。各エントリは `polygon.vertices`(x,y), `bbox`, `score`, `iou` を持ち、クライアントでは `AnnotationRegion` へ再マッピングされる。
- `input/data.csv`: 各領域の Area / Perimeter などを保持する指標一覧。先頭列 (`#` または `id`) を `annotation.json` の `id` と同期させ、全列をメトリクスとして取り込み、UI のフィルタ候補になる。
- `input/annotation-review.json`: 除外キューの確定状態を保持するブックキーピングファイル。各エントリは `id` / `origin` / `status` / `filtersApplied` を持ち、`/api/annotation/review` から読み書きされる。
- `input/annotation-additions.json`: 手動で加筆した多角形領域の一覧。`/api/annotation/additions` から読み書きされ、`AnnotationRegion` と同一構造で Canvas にマージされる。
- Panda CSS スタイルは `AnnotationCanvasClient.tsx` 内で完結しており、styled-system の生成物と同期が取れている前提。

## 既知の制約・補足
- `/api/annotation/review` への書き込みは現状ローカル JSON を直接更新するのみで、S3 や DB との同期は未実装。実運用では S3 Versioning + 楽観ロック等での整合性確保が必要。
- アノテーション JSON はレポジトリに含まれる静的ファイルを読み込むだけで暗号化/復号は未実装（将来的に S3 + 復号フローへ差し替え予定）。
- トークンシークレット未設定時は固定の `dev-annotation-secret` が使われるため、実運用では環境変数の設定と HTTPS 前提 (cookie secure) が必要。
- 画像サイズは固定 (1049x695) のため、別サイズを扱う場合は `CANVAS_WIDTH/HEIGHT` と `aspectRatio` の更新が必須。
- 範囲選択は軸平行の矩形で「ポリゴンの全頂点が内側に含まれる」ことを条件にしているため、部分的な交差や斜め選択には対応していない。
- フィルタは数値指標にのみ対応し、現状は下限/上限/範囲モードを手動で切り替える設計。メトリクス間の複合条件 (例: OR 条件) や単位変換が必要な場合は追加の UI/ロジックが必要。
