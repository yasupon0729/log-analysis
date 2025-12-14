"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import type {
  CategoryDef,
  ClassificationRule,
  FilterConfig,
  FilterPreset,
} from "./_types";

const INPUT_DIR = path.join(process.cwd(), "src/app/annotation2/input");

export interface SaveRemoveResult {
  success: boolean;
  message: string;
}

export async function saveRemovedAnnotations(
  removedIds: number[],
): Promise<SaveRemoveResult> {
  try {
    const filePath = path.join(INPUT_DIR, "remove.json");

    // 保存するデータの形式
    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      removedIds: removedIds,
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    revalidatePath("/annotation2"); // ページキャッシュを更新
    return { success: true, message: "削除リストを保存しました。" };
  } catch (error) {
    console.error("Failed to save remove.json:", error);
    return {
      success: false,
      message: `保存に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export interface SaveClassificationsResult {
  success: boolean;
  message: string;
}

export async function saveClassifications(
  classifications: Record<number, number>,
): Promise<SaveClassificationsResult> {
  try {
    const filePath = path.join(INPUT_DIR, "classification.json");

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      classifications: classifications,
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    revalidatePath("/annotation2");
    return { success: true, message: "分類情報を保存しました。" };
  } catch (error) {
    console.error("Failed to save classification.json:", error);
    return {
      success: false,
      message: `分類保存に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export interface SaveCategoriesResult {
  success: boolean;
  message: string;
}

export async function saveCategories(
  categories: CategoryDef[],
): Promise<SaveCategoriesResult> {
  try {
    const filePath = path.join(INPUT_DIR, "categories.json");

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      categories: categories,
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    revalidatePath("/annotation2");
    return { success: true, message: "カテゴリ定義を保存しました。" };
  } catch (error) {
    console.error("Failed to save categories.json:", error);
    return {
      success: false,
      message: `カテゴリ保存に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export interface SaveFilterResult {
  success: boolean;
  message: string;
}

export async function saveFilterConfig(
  config: FilterConfig,
): Promise<SaveFilterResult> {
  try {
    const filePath = path.join(INPUT_DIR, "filtered.json");

    // _types/index.ts で定義された FilterConfig の構造をそのまま保存します。
    // { version, rules, excludedIds }
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");

    revalidatePath("/annotation2"); // ページキャッシュを更新
    return { success: true, message: "フィルター設定を保存しました。" };
  } catch (error) {
    console.error("Failed to save filtered.json:", error);
    return {
      success: false,
      message: `フィルタ保存に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export interface SaveAdditionsResult {
  success: boolean;
  message: string;
}

export async function saveAddedAnnotations(
  regions: any[], // AnnotationRegion[]
): Promise<SaveAdditionsResult> {
  try {
    const filePath = path.join(INPUT_DIR, "additions.json");

    // AnnotationRegion -> 保存用フォーマット (COCO準拠 + hole) 変換
    const formattedRegions = regions.map((region: any) => {
      // points: {x,y}[] -> [x,y,x,y...]
      const flatPoints: number[] = [];
      if (Array.isArray(region.points)) {
        region.points.forEach((p: any) => {
          flatPoints.push(p.x);
          flatPoints.push(p.y);
        });
      }

      return {
        id: region.id,
        image_id: 1, // Dummy
        category_id: 1, // Dummy
        bbox: region.bbox,
        segmentation: [flatPoints], // [[x,y...]]
        hole: [], // 将来用
        area: 0, // 簡易計算するか、0にしておく
        metrics: region.metrics,
        isManualAdded: true,
      };
    });

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      regions: formattedRegions,
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    revalidatePath("/annotation2");
    return { success: true, message: "追記データを保存しました。" };
  } catch (error) {
    console.error("Failed to save additions.json:", error);
    return {
      success: false,
      message: `追記保存に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export interface SavePresetResult {
  success: boolean;
  message: string;
  presets: FilterPreset[];
}

export async function saveFilterPreset(
  preset: FilterPreset,
): Promise<SavePresetResult> {
  try {
    const filePath = path.join(INPUT_DIR, "presets.json");
    let presets: FilterPreset[] = [];
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data.presets)) presets = data.presets;
    } catch (e) {
      // ignore
    }

    const idx = presets.findIndex((p) => p.id === preset.id);
    if (idx >= 0) {
      presets[idx] = preset;
    } else {
      presets.push(preset);
    }

    await fs.writeFile(
      filePath,
      JSON.stringify({ version: 1, presets }, null, 2),
      "utf-8",
    );
    revalidatePath("/annotation2");
    return { success: true, message: "プリセットを保存しました。", presets };
  } catch (error) {
    console.error("Failed to save preset:", error);
    return {
      success: false,
      message: `保存失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
      presets: [],
    };
  }
}

export async function deleteFilterPreset(
  id: string,
): Promise<SavePresetResult> {
  try {
    const filePath = path.join(INPUT_DIR, "presets.json");
    let presets: FilterPreset[] = [];
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data.presets)) presets = data.presets;
    } catch (e) {
      // ignore
    }

    const newPresets = presets.filter((p) => p.id !== id);

    await fs.writeFile(
      filePath,
      JSON.stringify({ version: 1, presets: newPresets }, null, 2),
      "utf-8",
    );
    revalidatePath("/annotation2");
    return {
      success: true,
      message: "プリセットを削除しました。",
      presets: newPresets,
    };
  } catch (error) {
    console.error("Failed to delete preset:", error);
    return {
      success: false,
      message: `削除失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
      presets: [],
    };
  }
}

export interface SavePipelineResult {

  success: boolean;

  message: string;

}



export async function savePipeline(

  rules: ClassificationRule[],

): Promise<SavePipelineResult> {

  try {

    const filePath = path.join(INPUT_DIR, "rules.json");

    const data = {

      version: 1,

      updatedAt: new Date().toISOString(),

      rules,

    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    revalidatePath("/annotation2");

    return { success: true, message: "ルール設定を保存しました。" };

  } catch (error) {

    console.error("Failed to save rules.json:", error);

    return {

      success: false,

      message: `ルール保存に失敗: ${

        error instanceof Error ? error.message : String(error)

      }`,

    };

  }

}



export interface SaveManualResult {

  success: boolean;

  message: string;

}



export async function saveManualClassifications(

  manualClassifications: Record<number, number>,

): Promise<SaveManualResult> {

  try {

    const filePath = path.join(INPUT_DIR, "manual_classifications.json");



    const data = {

      version: 1,

      updatedAt: new Date().toISOString(),

      overrides: manualClassifications,

    };



    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");



    revalidatePath("/annotation2");

    return { success: true, message: "手動修正を保存しました。" };

  } catch (error) {

    console.error("Failed to save manual_classifications.json:", error);

    return {

      success: false,

      message: `手動修正の保存に失敗: ${

        error instanceof Error ? error.message : String(error)

      }`,

    };

  }

}



export async function loadManualClassifications(): Promise<Record<number, number>> {

  try {

    const filePath = path.join(INPUT_DIR, "manual_classifications.json");

    const content = await fs.readFile(filePath, "utf-8");

    const data = JSON.parse(content);

    return data.overrides || {};

  } catch (error) {

    // File not found or invalid JSON is fine, return empty

    return {};

  }

}