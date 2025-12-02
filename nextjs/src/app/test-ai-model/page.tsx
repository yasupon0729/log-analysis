import { logger } from "@/lib/logger/server";
import { getAiModelByName } from "@/lib/recommendation/service";
import type { AiModelWithDetails } from "@/lib/recommendation/types";
import { SaveButton } from "./SaveButton";

export default async function TestAiModelPage({
  searchParams,
}: {
  searchParams: { name?: string };
}) {
  const modelName = searchParams.name || "STD-00001";
  let aiModel: AiModelWithDetails | null = null;
  let error = null;
  let formattedModel = null;

  try {
    aiModel = await getAiModelByName(modelName);

    if (aiModel) {
      // additional_model_names の形式変換
      // input/SP-00056.json の例に合わせて、キーをモデル番号、値は 1.0 (固定)と仮定
      const formattedAdditionalNames: Record<string, number> = {};
      if (aiModel.additionalModelNames) {
        for (const modelNum of Object.values(aiModel.additionalModelNames)) {
          formattedAdditionalNames[modelNum] = 1.0;
        }
      }

      // input/STD-00001.json の形式に合わせてデータを整形
      formattedModel = {
        file_name: "", // 固定値: 空文字
        model_name: aiModel.aiModelCode,
        additional_model_names: aiModel.additionalModelConditions,
        additional_model_conditions: aiModel.additionalModelConditions || {},
        add_class_label_offset: Boolean(aiModel.addClassLabelOffset),
        ai_model_name: aiModel.aiModelName,
        predict_mode: aiModel.predictMode,
        masking_predict: Boolean(aiModel.maskingPredict),
        transform_predict: aiModel.transformPredict,
        hybrid_classify: aiModel.hybridClassify,
        edge_remove: Boolean(aiModel.edgeRemove),
        overlap_mode: aiModel.overlapMode ?? null,
        overlap_remove: Boolean(aiModel.overlapRemove),
        overlap_remove_filter_size: aiModel.overlapRemoveFilterSize,
        area_rate_threshold: aiModel.areaRateThreshold,
        area_rate_threshold_in_inferences:
          aiModel.areaRateThresholdInInferences,
        overlap_remove_at_SEG_and_CLS: Boolean(
          aiModel.overlapRemoveAtSegAndCls,
        ),
        overlap_remove_at_SEG_and_CLS_filter_size:
          aiModel.overlapRemoveAtSegAndClsFilterSize,
        area_rate_threshold_at_SEG_and_CLS:
          aiModel.areaRateThresholdAtSegAndCls,
        scaling_factor: 1, // 固定値: 1
        unit: "px", // 固定値: "px"
        is_root_user: false, // 固定値: false
        keys_geometry: [
          "diameter",
          "area",
          "perimeter",
          "maximum_length",
          "diagonal_length",
          "rectangle_width",
          "rectangle_height",
          "fiber_length",
          "fiber_width",
          "aspect_ratio",
          "circularity",
          "roundness",
          "square_degree",
          "convexity",
          "angle",
          "angle_base_on_mode",
          "centroid_distance",
          "cohesion_degree",
          "orient_degree",
          "coverage_rate",
        ],
        keys_color: ["gray", "rgb", "hsv", "lab"],
      };
    }
  } catch (e) {
    logger.error("Failed to fetch AI model by name", {
      modelName,
      error: e,
    });
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>AIモデルデータ表示 (JSON比較用)</h1>
      <p>モデル名: {modelName}</p>

      {error && (
        <div style={{ color: "red" }}>
          <p>エラーが発生しました:</p>
          <pre>{error}</pre>
        </div>
      )}

      {formattedModel ? (
        <>
          <SaveButton
            jsonData={formattedModel}
            fileName={`${modelName}_out.json`}
          />
          <pre
            style={{
              backgroundColor: "#333",
              color: "#eee",
              padding: "10px",
              borderRadius: "5px",
              marginTop: "20px",
            }}
          >
            {JSON.stringify(formattedModel, null, 4)}
          </pre>
        </>
      ) : (
        !error && <p>AIモデル '{modelName}' は見つかりませんでした。</p>
      )}
    </div>
  );
}
