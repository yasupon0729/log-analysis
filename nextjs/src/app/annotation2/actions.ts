"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import type { FilterConfig } from "./_types";

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