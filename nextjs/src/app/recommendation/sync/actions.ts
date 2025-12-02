"use server";

import { logger } from "@/lib/logger/server";
import { generateAiModelJson } from "@/lib/recommendation/json-generator";
import { getAiModelByName } from "@/lib/recommendation/service";
import { uploadFileToRemote } from "@/lib/ssh/client";
import { revalidatePath } from "next/cache";

export interface SyncResult {
  success: boolean;
  message: string;
}

export async function syncAiModelJson(modelName: string): Promise<SyncResult> {
  try {
    // 1. DBからモデル情報を取得
    const aiModel = await getAiModelByName(modelName);
    if (!aiModel) {
      return { success: false, message: `モデルが見つかりません: ${modelName}` };
    }

    // 2. JSONデータを生成
    const jsonData = generateAiModelJson(aiModel);
    const jsonString = JSON.stringify(jsonData, null, 4);

    // 3. リモートサーバーへアップロード
    const fileName = `${modelName}.json`;
    await uploadFileToRemote(fileName, jsonString);

    logger.info("Synced AI model JSON", { modelName, fileName });
    
    // 4. キャッシュを更新して一覧を再取得させる
    revalidatePath("/recommendation/sync");
    
    return { success: true, message: `同期しました: ${fileName}` };
  } catch (error) {
    logger.error("Failed to sync AI model JSON", { modelName, error });
    return {
      success: false,
      message: `同期に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
