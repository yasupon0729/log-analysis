"use server";

import fs from "node:fs/promises";
import path from "node:path";

const INPUT_DIR = path.join(
  process.cwd(),
  "src/app/annotation2/input",
);

export interface SaveRemoveResult {
  success: boolean;
  message: string;
}

export async function saveRemovedAnnotations(removedIds: number[]): Promise<SaveRemoveResult> {
  try {
    const filePath = path.join(INPUT_DIR, "remove.json");
    
    // 保存するデータの形式
    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      removedIds: removedIds,
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    return { success: true, message: "削除リストを保存しました。" };
  } catch (error) {
    console.error("Failed to save remove.json:", error);
    return { 
      success: false, 
      message: `保存に失敗しました: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}
