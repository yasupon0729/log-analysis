import fs from "node:fs/promises";
import path from "node:path";
import type {
  AnnotationRegion,
  CocoData,
  FilterConfig,
  MetricStat,
  Point,
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
 *
 * @returns {Promise<{ regions: AnnotationRegion[]; stats: MetricStat[]; removedIds: number[]; filterConfig: FilterConfig | null; }>}
 */
export async function loadAnnotationData(): Promise<{
  regions: AnnotationRegion[];
  stats: MetricStat[];
  removedIds: number[];
  filterConfig: FilterConfig | null;
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

  // 3. remove.json の読み込み
  let removedIds: number[] = [];
  try {
    const removeJsonPath = path.join(INPUT_DIR, "remove.json");
    const removeJsonContent = await fs.readFile(removeJsonPath, "utf-8");
    const removeData = JSON.parse(removeJsonContent);
    if (Array.isArray(removeData.removedIds)) {
      removedIds = removeData.removedIds;
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
  } catch (error) {
    console.error("[DataLoader] Failed to load filtered.json:", error);
  }

  // 5. データ結合 & メトリクス統計情報の計算
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
    removedIds,
    filterConfig,
  };
}
