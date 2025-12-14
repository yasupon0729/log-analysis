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

// 入力ファイルが配置されているディレクトリパス
//TODO: GeXeLでは、動的にパスを読み込む
const INPUT_DIR = path.join(process.cwd(), "src/app/annotation2/input");

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
export async function loadAnnotationData(): Promise<{
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
  // 1. segmentation.json (COCO Format) の読み込み
  const jsonPath = path.join(INPUT_DIR, "segmentation.json");
  const jsonContent = await fs.readFile(jsonPath, "utf-8");
  const cocoData: CocoData = JSON.parse(jsonContent);

  // 2. result.csv (Metrics) の読み込み
  const csvPath = path.join(INPUT_DIR, "result.csv");
  const csvContent = await fs.readFile(csvPath, "utf-8");
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
  try {
    const removeJsonPath = path.join(INPUT_DIR, "remove.json");
    const removeJsonContent = await fs.readFile(removeJsonPath, "utf-8");
    const removeData = JSON.parse(removeJsonContent);
    if (Array.isArray(removeData.removedIds)) {
      removeData.removedIds.forEach((id: number) => {
        classifications[id] = 999;
      });
    }
  } catch (error) {
    // ignore
  }

  // classification.json -> merge
  try {
    const classJsonPath = path.join(INPUT_DIR, "classification.json");
    const classJsonContent = await fs.readFile(classJsonPath, "utf-8");
    const classData = JSON.parse(classJsonContent);
    if (classData.classifications) {
      Object.assign(classifications, classData.classifications);
    }
  } catch (error) {
    // ignore
  }

  // 3b. manual_classifications.json の読み込み
  const manualClassifications: Record<number, number> = {};
  try {
    const manualPath = path.join(INPUT_DIR, "manual_classifications.json");
    const manualContent = await fs.readFile(manualPath, "utf-8");
    const manualData = JSON.parse(manualContent);
    if (manualData.overrides) {
      Object.assign(manualClassifications, manualData.overrides);
    }
  } catch (error) {
    // ignore
  }

  // 4. filtered.json の読み込み (フィルター設定)
  let filterConfig: FilterConfig | null = null;
  try {
    const filterJsonPath = path.join(INPUT_DIR, "filtered.json");
    const filterJsonContent = await fs.readFile(filterJsonPath, "utf-8");
    filterConfig = JSON.parse(filterJsonContent);
    console.log("[DataLoader] Loaded filter config v", filterConfig?.version);
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.error("[DataLoader] Failed to load filtered.json:", error);
    }
  }

  // 5. additions.json の読み込み (手動追加領域)
  let addedRegions: AnnotationRegion[] = [];
  try {
    const additionsPath = path.join(INPUT_DIR, "additions.json");
    const additionsContent = await fs.readFile(additionsPath, "utf-8");
    const additionsData = JSON.parse(additionsContent);
    if (Array.isArray(additionsData.regions)) {
      // 保存フォーマットから内部フォーマットへの変換
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
        };
      });
    }
  } catch (error) {
    // ignore (ファイルがない場合は空リスト)
  }

  // 6. presets.json の読み込み (フィルタープリセット)
  let presets: FilterPreset[] = [];
  try {
    const presetsPath = path.join(INPUT_DIR, "presets.json");
    const presetsContent = await fs.readFile(presetsPath, "utf-8");
    const presetsData = JSON.parse(presetsContent);
    if (Array.isArray(presetsData.presets)) {
      presets = presetsData.presets;
    }
  } catch (error) {
    // ignore
  }

  // 7. categories.json の読み込み (カテゴリ定義)
  let categories: CategoryDef[] = DEFAULT_CATEGORIES;
  try {
    const categoriesPath = path.join(INPUT_DIR, "categories.json");
    const categoriesContent = await fs.readFile(categoriesPath, "utf-8");
    const categoriesData = JSON.parse(categoriesContent);
    if (Array.isArray(categoriesData.categories)) {
      categories = categoriesData.categories;
    }
  } catch (error) {
    // ignore
  }

  // 8. rules.json の読み込み (ルール)
  let rules: ClassificationRule[] = [];
  try {
    const rulesPath = path.join(INPUT_DIR, "rules.json");
    const rulesContent = await fs.readFile(rulesPath, "utf-8");
    const rulesData = JSON.parse(rulesContent);
    if (Array.isArray(rulesData.rules)) {
      rules = rulesData.rules;
    }
  } catch (error) {
    // ignore
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
