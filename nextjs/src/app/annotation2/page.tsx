// src/app/annotation2/page.tsx
//
// このファイルは、新しいアノテーションページのサーバーコンポーネントです。
// 主に以下の処理を行います:
// - src/app/annotation2/_lib/data-loader.ts を使用して、COCOデータとCSVメトリクスを非同期でロードします。
// - src/app/annotation2/input/origin.png 画像ファイルを読み込み、Base64文字列に変換します。
// - ロードしたデータと画像を、クライアントコンポーネントである AnnotationPageClient にPropsとして渡します。

import fs from "node:fs/promises";
import path from "node:path";
import { AnnotationPageClient } from "./_components/AnnotationPageClient";
import { loadAnnotationData } from "./_lib/data-loader";

// Next.jsのServer Componentsとして動作します。
export default async function AnnotationPageV2() {
  // 1. データローダーを呼び出し、アノテーション領域とメトリクス統計データを取得
  const { regions, stats, removedIds } = await loadAnnotationData();

  // 2. 画像ファイル (origin.png) の読み込みとBase64変換
  // クライアント側でCanvasに描画するためにBase64形式で渡します。
  // TODO: 本番環境ではS3やCDNから取得する等の最適化を検討してください。
  const imagePath = path.join(
    process.cwd(),
    "src/app/annotation2/input/origin.png",
  );
  
  let imageBase64 = "";
  try {
    const imageBuffer = await fs.readFile(imagePath);
    imageBase64 = imageBuffer.toString("base64");
  } catch (error) {
    console.error("Failed to load image for AnnotationPageV2:", error);
    // 画像読み込み失敗時は空文字列を渡し、クライアント側でエラー表示などのハンドリングを可能にします。
  }

  // 3. クライアントコンポーネントにデータを渡してレンダリング
  return (
    <AnnotationPageClient
      initialRegions={regions}
      stats={stats}
      imageBase64={imageBase64}
      initialRemovedIds={removedIds}
    />
  );
}
