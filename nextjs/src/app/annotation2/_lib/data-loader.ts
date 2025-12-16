import fs from "node:fs/promises";
import path from "node:path";
import {
  type AnnotationRegion,
  type CategoryDef,
  type ClassificationRule,
  type CocoData,
  DEFAULT_CATEGORIES,
  type FilterConfig,
  type FilterPreset,
  type MetricStat,
  type Point,
} from "../_types";
import { resolveDataset } from "./dataset-service";

// 入力ファイルが配置されているディレクトリパス
//TODO: GeXeLでは、動的にパスを読み込む
const INPUT_DIR = path.join(process.cwd(), "src/app/annotation2/input");

async function readJsonFile<T>(paths: string[]): Promise<T | null> {
  for (const p of paths) {
    try {
      const content = await fs.readFile(p, "utf-8");
      return JSON.parse(content) as T;
    } catch (error: any) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

/**
 * COCO形式のJSONデータとCSV形式のメトリクスデータを読み込み、結合して返します。
 * また、各メトリクスに関する統計情報 (最小値、最大値) も計算して返します。
 *
 * 具体的には以下の処理を行います:
 * 1. `segmentation.json` (COCO形式) から、画像内のアノテーション領域の座標 (ポリゴン) とIDを読み込みます。
 * 2. `result.csv` から、アノテーションIDごとの詳細な解析結果 (メトリクス) を読み込みます。
 * 3. 読み込んだJSONとCSVデータを、アノテーションIDをキーとして結合し、
 *    `AnnotationRegion` オブジェクトの配列を生成します。
 *    これにより、「この座標にあるアノテーション領域は、面積が○○で、円形度が△△である」
 *    といった統合されたデータ構造が完成します。
 * 4. 各メトリクス (例: 面積、円相当径など) の最小値と最大値を計算し、
 *    `MetricStat` オブジェクトの配列として返します。これはフィルタリングUIのスライダーの範囲設定などに利用されます。
 * 5. `remove.json` (存在する場合) を読み込み、削除済みのアノテーションIDのリストを返します。
 * 6. `filtered.json` (存在する場合) を読み込み、保存されたフィルター設定を返します。
 * 7. `presets.json` (存在する場合) を読み込み、保存されたフィルタープリセットを返します。
 * 8. `categories.json` (存在する場合) を読み込み、カテゴリ定義を返します。
 * 9. `rules.json` (存在する場合) を読み込み、分類ルールを返します。
 *
 * @returns {Promise<{ regions: AnnotationRegion[]; stats: MetricStat[]; classifications: Record<number, number>; filterConfig: FilterConfig | null; addedRegions: AnnotationRegion[]; presets: FilterPreset[]; categories: CategoryDef[]; rules: ClassificationRule[]; }>}
 */
export async function loadAnnotationData(
  datasetId?: string,
): Promise<{
  datasetId: string;
  regions: AnnotationRegion[];
  stats: MetricStat[];
  classifications: Record<number, number>;
  manualClassifications: Record<number, number>;
  filterConfig: FilterConfig | null;
  addedRegions: AnnotationRegion[];
  presets: FilterPreset[];
  categories: CategoryDef[];
  rules: ClassificationRule[];
}> {
  const paths = await resolveDataset(datasetId);

  // 1. segmentation.json (COCO Format) の読み込み
  const jsonContent = await fs.readFile(paths.segmentationPath, "utf-8");
  const cocoData: CocoData = JSON.parse(jsonContent);
  const derivedCategoryIds = Array.from(
    new Set(cocoData.annotations.map((ann) => ann.category_id)),
  ).sort((a, b) => a - b);

  // 2. result.csv (Metrics) の読み込み
  const csvContent = await fs.readFile(paths.csvPath, "utf-8");
  const csvLines = csvContent.trim().split("\n");

  const headers = csvLines[0].split(",").map((h) => h.trim());
  const csvMap = new Map<number, Record<string, number>>();

  for (let i = 1; i < csvLines.length; i++) {
    const line = csvLines[i].trim();
    if (!line) continue;
    const values = line.split(",").map((v) => Number.parseFloat(v.trim()));
    const id = values[0];

    const metrics: Record<string, number> = {};
    headers.forEach((header, index) => {
      if (index > 0) {
        metrics[header] = values[index];
      }
    });
    csvMap.set(id, metrics);
  }

  // 3. remove.json & classification.json の読み込み
  const classifications: Record<number, number> = {};

  // Legacy: remove.json -> 999 (Trash)
  const removeData = await readJsonFile<{ removedIds?: number[] }>([
    path.join(paths.workDir, "remove.json"),
    path.join(INPUT_DIR, "remove.json"),
  ]);
  if (removeData?.removedIds) {
    removeData.removedIds.forEach((id: number) => {
      classifications[id] = 999;
    });
  }

  // classification.json -> merge
  const classData = await readJsonFile<{ classifications?: Record<number, number> }>([
    path.join(paths.workDir, "classification.json"),
    path.join(INPUT_DIR, "classification.json"),
  ]);
  if (classData?.classifications) {
    Object.assign(classifications, classData.classifications);
  }

  // 3b. manual_classifications.json の読み込み
  const manualClassifications: Record<number, number> = {};
  const manualData = await readJsonFile<{ overrides?: Record<number, number> }>([
    path.join(paths.workDir, "manual_classifications.json"),
    path.join(INPUT_DIR, "manual_classifications.json"),
  ]);
  if (manualData?.overrides) {
    Object.assign(manualClassifications, manualData.overrides);
  }

  // 4. filtered.json の読み込み (フィルター設定)
  let filterConfig: FilterConfig | null = null;
  const filterJsonData = await readJsonFile<FilterConfig>([
    path.join(paths.workDir, "filtered.json"),
    path.join(INPUT_DIR, "filtered.json"),
  ]);
  if (filterJsonData) {
    filterConfig = filterJsonData;
    console.log("[DataLoader] Loaded filter config v", filterConfig?.version);
  }

  // 5. additions.json の読み込み (手動追加領域)
  let addedRegions: AnnotationRegion[] = [];
  const additionsData = await readJsonFile<{ regions?: any[] }>([
    path.join(paths.workDir, "additions.json"),
    path.join(INPUT_DIR, "additions.json"),
  ]);
  if (Array.isArray(additionsData?.regions)) {
    addedRegions = additionsData.regions.map((item: any) => {
      const points: Point[] = [];
      if (Array.isArray(item.segmentation) && item.segmentation.length > 0) {
        const flatSeg = item.segmentation[0];
        for (let i = 0; i < flatSeg.length; i += 2) {
          points.push({ x: flatSeg[i], y: flatSeg[i + 1] });
        }
      }
      return {
        id: item.id,
        bbox: item.bbox,
        points: points,
        metrics: item.metrics || {},
        isManualAdded: true,
        categoryId: item.category_id,
      };
    });
  }

  // 6. presets.json の読み込み (フィルタープリセット)
  let presets: FilterPreset[] = [];
  const presetsData = await readJsonFile<{ presets?: FilterPreset[] }>([
    path.join(paths.workDir, "presets.json"),
    path.join(INPUT_DIR, "presets.json"),
  ]);
  if (Array.isArray(presetsData?.presets)) {
    presets = presetsData.presets;
  }

  // 7. categories.json の読み込み (カテゴリ定義)
  let categories: CategoryDef[] = DEFAULT_CATEGORIES;
  const categoriesData = await readJsonFile<{ categories?: CategoryDef[] }>([
    path.join(paths.workDir, "categories.json"),
    path.join(INPUT_DIR, "categories.json"),
  ]);
  if (Array.isArray(categoriesData?.categories)) {
    categories = categoriesData.categories;
  }

  // categories.json が無い場合は segmentation.json の category_id から初期クラスを自動生成
  if (categories === DEFAULT_CATEGORIES && derivedCategoryIds.length > 0) {
    const derived = derivedCategoryIds.map((id, idx) => {
      const hue = (idx * 57) % 360;
      const color = `hsl(${hue}, 70%, 50%)`;
      return {
        id,
        name: `Class ${id}`,
        color,
        fill: `hsla(${hue}, 70%, 50%, 0.25)`,
      } satisfies CategoryDef;
    });
    const removeCat =
      DEFAULT_CATEGORIES.find((c) => c.id === 999) ??
      ({
        id: 999,
        name: "Remove (Trash)",
        color: "#dc2626",
        fill: "rgba(239, 68, 68, 0.35)",
        isSystem: true,
      } satisfies CategoryDef);
    categories = [...derived, removeCat];
  }

  // 8. rules.json の読み込み (ルール)
  let rules: ClassificationRule[] = [];
  const rulesData = await readJsonFile<{ rules?: ClassificationRule[] }>([
    path.join(paths.workDir, "rules.json"),
    path.join(INPUT_DIR, "rules.json"),
  ]);
  if (Array.isArray(rulesData?.rules)) {
    rules = rulesData.rules;
  }

  // 9. データ結合 & メトリクス統計情報の計算
  const regions: AnnotationRegion[] = [];
  const statMap = new Map<string, { min: number; max: number }>();

  headers.forEach((header, index) => {
    if (index > 0) {
      statMap.set(header, {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      });
    }
  });

  for (const ann of cocoData.annotations) {
    const metrics = csvMap.get(ann.id);
    const points: Point[] = [];
    const segmentations = Array.isArray(ann.seg[0])
      ? (ann.seg as number[][])
      : [ann.seg as number[]];

    if (segmentations.length > 0) {
      const flatSeg = segmentations[0];
      for (let i = 0; i < flatSeg.length; i += 2) {
        points.push({ x: flatSeg[i], y: flatSeg[i + 1] });
      }
    }

    const safeMetrics = metrics || {};

    regions.push({
      id: ann.id,
      bbox: ann.bbox,
      points,
      metrics: safeMetrics,
      categoryId: ann.category_id,
    });

    if (metrics) {
      for (const [key, value] of Object.entries(metrics)) {
        const stat = statMap.get(key);
        if (stat) {
          stat.min = Math.min(stat.min, value);
          stat.max = Math.max(stat.max, value);
        }
      }
    }
  }

  const stats: MetricStat[] = Array.from(statMap.entries()).map(
    ([key, val]) => ({
      key,
      min: val.min === Number.POSITIVE_INFINITY ? 0 : val.min,
      max: val.max === Number.NEGATIVE_INFINITY ? 0 : val.max,
    }),
  );

  return {
    datasetId: paths.id,
    regions,
    stats,
    classifications,
    manualClassifications,
    filterConfig,
    addedRegions,
    presets,
    categories,
    rules,
  };
}
