import { AnnotationPageClient } from "./_components/AnnotationPageClient";
import { loadAnnotationData } from "./_lib/data-loader";
import { listDatasetIds } from "./_lib/dataset-service";

type PageProps = {
  searchParams?: { dataset?: string };
};

// Next.jsのServer Componentsとして動作します。
export default async function AnnotationPageV2({ searchParams }: PageProps) {
  const datasetParam = searchParams?.dataset;

  const datasetIds = await listDatasetIds();

  // 1. データローダーを呼び出し、アノテーション領域とメトリクス統計データを取得
  // filterConfigも取得して初期状態としてクライアントに渡す
  const {
    datasetId,
    regions,
    stats,
    filterConfig,
    addedRegions,
    classifications,
    manualClassifications, // Added
    presets,
    categories,
    rules,
  } = await loadAnnotationData(datasetParam);

  const selectableDatasetIds = datasetIds.includes(datasetId)
    ? datasetIds
    : [datasetId, ...datasetIds];

  const imageUrl = `/annotation2/image?dataset=${encodeURIComponent(datasetId)}`;

  // 2. クライアントコンポーネントにデータを渡してレンダリング
  return (
    <AnnotationPageClient
      datasetId={datasetId}
      datasetIds={selectableDatasetIds}
      initialRegions={regions}
      stats={stats}
      imageUrl={imageUrl}
      initialFilterConfig={filterConfig}
      initialAddedRegions={addedRegions}
      initialClassifications={classifications}
      initialManualClassifications={manualClassifications} // Pass prop
      initialPresets={presets}
      initialCategories={categories}
      initialRules={rules}
    />
  );
}
