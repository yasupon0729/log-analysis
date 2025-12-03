"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import { generateAiModelJson } from "@/lib/recommendation/json-generator";
import { getAiModelByName } from "@/lib/recommendation/service";
import { type SshTarget, uploadFileToRemote } from "@/lib/ssh/client";

export interface SyncResult {
  success: boolean;
  message: string;
  results?: Record<string, { success: boolean; message: string }>;
}

const ALL_TARGETS: SshTarget[] = ["KNIT02", "KNIT03", "KNIT04"];

export async function syncAiModelJson(
  modelName: string,
  targets: SshTarget[] = ALL_TARGETS,
): Promise<SyncResult> {
  try {
    // 1. DBからモデル情報を取得
    const aiModel = await getAiModelByName(modelName);
    if (!aiModel) {
      return {
        success: false,
        message: `モデルが見つかりません: ${modelName}`,
      };
    }

    // 2. JSONデータを生成
    const jsonData = generateAiModelJson(aiModel);
    const jsonString = JSON.stringify(jsonData, null, 4);
    const fileName = `${modelName}.json`;

    // 3. 各ターゲットへ並列アップロード
    const uploadPromises = targets.map(async (target) => {
      try {
        await uploadFileToRemote(target, fileName, jsonString);
        return { target, success: true, message: "OK" };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Loggerとコンソール両方に出力
        logger.error("Failed to upload to target", {
          target,
          modelName,
          error: errorMsg,
        });
        console.error(`[Sync Error] Target: ${target}, Model: ${modelName}, Error: ${errorMsg}`);
        return { target, success: false, message: errorMsg };
      }
    });

    const results = await Promise.all(uploadPromises);

    // 結果の集計
    const failed = results.filter((r) => !r.success);
    const successCount = results.filter((r) => r.success).length;

    const detailedResults: Record<
      string,
      { success: boolean; message: string }
    > = {};
    for (const res of results) {
      detailedResults[res.target] = {
        success: res.success,
        message: res.message,
      };
    }

    // 4. キャッシュ更新
    revalidatePath("/recommendation/sync");

    if (failed.length === 0) {
      logger.info("Synced AI model JSON to all targets", {
        modelName,
        targets,
      });
      return {
        success: true,
        message: `全サーバー(${successCount}/${targets.length})に同期しました: ${fileName}`,
        results: detailedResults,
      };
    }

    if (successCount === 0) {
      return {
        success: false,
        message: "全てのサーバーへの同期に失敗しました。",
        results: detailedResults,
      };
    }

    return {
      success: false, // 部分的成功はUI上では警告扱いにするため false
      message: `一部のサーバーへの同期に失敗しました (${successCount}/${targets.length} 成功)`,
      results: detailedResults,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to sync AI model JSON process", { modelName, error });
    console.error(`[Sync Process Error] Model: ${modelName}, Error: ${errorMsg}`);
    return {
      success: false,
      message: `処理中にエラーが発生しました: ${errorMsg}`,
    };
  }
}