"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger/server";

interface SaveResult {
  success: boolean;
  message: string;
}

export async function saveJsonToServer(
  jsonData: string,
  fileName: string,
): Promise<SaveResult> {
  try {
    // 保存先ディレクトリ (プロジェクトルート直下の tmp)
    const saveDir = path.join(process.cwd(), "tmp");
    
    // ファイル名が安全かチェック (ディレクトリトラバーサル防止)
    const safeFileName = path.basename(fileName);
    const filePath = path.join(saveDir, safeFileName);

    await fs.writeFile(filePath, jsonData, "utf-8");

    logger.info("JSON file saved to server", { filePath });
    return { success: true, message: `ファイルを保存しました: ${filePath}` };
  } catch (error) {
    logger.error("Failed to save JSON file", { error });
    return {
      success: false,
      message: `保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
