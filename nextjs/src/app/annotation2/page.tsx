import { AnnotationPageClient } from "./_components/AnnotationPageClient";
import { loadAnnotationData } from "./_lib/data-loader";

const ORIGIN_IMAGE_URL = "/annotation2/image";

// Next.jsのServer Componentsとして動作します。
export default async function AnnotationPageV2() {
  // 1. データローダーを呼び出し、アノテーション領域とメトリクス統計データを取得
  // filterConfigも取得して初期状態としてクライアントに渡す
  const { regions, stats, removedIds, filterConfig, addedRegions } =
    await loadAnnotationData();

  // 2. クライアントコンポーネントにデータを渡してレンダリング
  return (
    <AnnotationPageClient
      initialRegions={regions}
      stats={stats}
      imageUrl={ORIGIN_IMAGE_URL}
      initialRemovedIds={removedIds}
      initialFilterConfig={filterConfig}
      initialAddedRegions={addedRegions}
    />
  );
}