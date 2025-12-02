import type { AiModelWithDetails } from "./types";

export function generateAiModelJson(aiModel: AiModelWithDetails): unknown {
  // additional_model_names の形式変換
  // input/SP-00056.json の例に合わせて、キーをモデル番号、値は 1.0 (固定)と仮定
  const formattedAdditionalNames: Record<string, number> = {};
  if (aiModel.additionalModelNames) {
    for (const modelNum of Object.values(aiModel.additionalModelNames)) {
      formattedAdditionalNames[modelNum] = 1.0;
    }
  }

  // additional_model_names の値も additional_model_conditions と同じ値にする
  // これは additional_model_conditions の値を優先して使用するため、
  // formattedAdditionalNames のループは実質的にキーの取得に使われているが、
  // additional_model_conditions が存在すればそちらで上書きされるロジックになっている
  let finalAdditionalNames: Record<string, number> = formattedAdditionalNames;

  if (aiModel.additionalModelConditions) {
    finalAdditionalNames = {};
    for (const key in aiModel.additionalModelConditions) {
      if (Object.hasOwn(aiModel.additionalModelConditions, key)) {
        finalAdditionalNames[key] = aiModel.additionalModelConditions[key];
      }
    }
  }

  return {
    file_name: "", // 固定値: 空文字
    model_name: aiModel.aiModelCode,
    additional_model_names: finalAdditionalNames,
    additional_model_conditions: aiModel.additionalModelConditions || {},
    add_class_label_offset: Boolean(aiModel.addClassLabelOffset),
    ai_model_name: aiModel.aiModelName,
    predict_mode: aiModel.predictMode,
    masking_predict: Boolean(aiModel.maskingPredict),
    transform_predict: aiModel.transformPredict,
    hybrid_classify: aiModel.hybridClassify,
    edge_remove: !aiModel.edgeRemove,
    overlap_mode: aiModel.overlapMode ?? null,
    overlap_remove: Boolean(aiModel.overlapRemove),
    overlap_remove_filter_size: aiModel.overlapRemoveFilterSize,
    area_rate_threshold: aiModel.areaRateThreshold,
    area_rate_threshold_in_inferences: aiModel.areaRateThresholdInInferences,
    overlap_remove_at_SEG_and_CLS: Boolean(aiModel.overlapRemoveAtSegAndCls),
    overlap_remove_at_SEG_and_CLS_filter_size:
      aiModel.overlapRemoveAtSegAndClsFilterSize,
    area_rate_threshold_at_SEG_and_CLS: aiModel.areaRateThresholdAtSegAndCls,
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
