import { selectOne, selectRows } from "@/lib/mysql/client";
import type { AiModel, AiModelWithDetails } from "./types";

export async function getAiModels(): Promise<AiModel[]> {
  const sql = `
    SELECT
      id,
      ai_model_name AS aiModelName,
      ai_model_description AS aiModelDescription,
      internal_notes AS internalNotes,
      customer_name AS customerName,
      ai_model_code AS aiModelCode,
      predict_mode AS predictMode,
      masking_predict AS maskingPredict,
      transform_predict AS transformPredict,
      hybrid_classify AS hybridClassify,
      edge_remove AS edgeRemove,
      overlap_remove AS overlapRemove,
      overlap_remove_filter_size AS overlapRemoveFilterSize,
      overlap_remove_at_SEG_and_CLS AS overlapRemoveAtSegAndCls,
      overlap_remove_at_SEG_and_CLS_filter_size AS overlapRemoveAtSegAndClsFilterSize,
      price,
      exclusive_use AS exclusiveUse,
      is_active AS isActive,
      publish_date AS publishDate,
      is_trial AS isTrial,
      area_rate_threshold AS areaRateThreshold,
      area_rate_threshold_at_SEG_and_CLS AS areaRateThresholdAtSegAndCls,
      area_rate_threshold_in_inferences AS areaRateThresholdInInferences,
      overlap_mode AS overlapMode,
      overlap_mode_at_SEG_and_CLS AS overlapModeAtSegAndCls,
      add_class_label_offset AS addClassLabelOffset
    FROM image_analysis_aimodel
    ORDER BY id DESC
    LIMIT 100
  `;

  const rows = await selectRows<
    AiModel & { constructor: { name: "RowDataPacket" } }
  >(sql);

  return rows;
}

export async function getAiModelByName(
  name: string,
): Promise<AiModelWithDetails | null> {
  // 1. Main AI Model Data
  const modelSql = `
    SELECT
      id,
      ai_model_name AS aiModelName,
      ai_model_description AS aiModelDescription,
      internal_notes AS internalNotes,
      customer_name AS customerName,
      ai_model_code AS aiModelCode,
      predict_mode AS predictMode,
      masking_predict AS maskingPredict,
      transform_predict AS transformPredict,
      hybrid_classify AS hybridClassify,
      edge_remove AS edgeRemove,
      overlap_remove AS overlapRemove,
      overlap_remove_filter_size AS overlapRemoveFilterSize,
      overlap_remove_at_SEG_and_CLS AS overlapRemoveAtSegAndCls,
      overlap_remove_at_SEG_and_CLS_filter_size AS overlapRemoveAtSegAndClsFilterSize,
      price,
      exclusive_use AS exclusiveUse,
      is_active AS isActive,
      publish_date AS publishDate,
      is_trial AS isTrial,
      area_rate_threshold AS areaRateThreshold,
      area_rate_threshold_at_SEG_and_CLS AS areaRateThresholdAtSegAndCls,
      area_rate_threshold_in_inferences AS areaRateThresholdInInferences,
      overlap_mode AS overlapMode,
      overlap_mode_at_SEG_and_CLS AS overlapModeAtSegAndCls,
      add_class_label_offset AS addClassLabelOffset
    FROM image_analysis_aimodel
    WHERE ai_model_name = :name
  `;

  const model = await selectOne<
    AiModel & { constructor: { name: "RowDataPacket" } }
  >(modelSql, { name });

  if (!model) {
    return null;
  }

  // 2. Additional Model Names
  const namesSql = `
    SELECT
      t1.sort_value AS sortValue,
      t2.number
    FROM image_analysis_aimodel_additional_ai_model_numbers AS t1
    JOIN image_analysis_aimodelnumber AS t2 ON t1.aimodelnumber_id = t2.id
    WHERE t1.aimodel_id = :id
    ORDER BY t1.sort_value ASC
  `;

  const nameRows = await selectRows<{
    sortValue: number;
    number: string;
    constructor: { name: "RowDataPacket" };
  }>(namesSql, { id: model.id });

  // Map to object format (key as sortValue or index string, value as number string)
  // input/STD-00001.json format suggests object (dictionary).
  // Assuming format: { "0": "number1", "1": "number2" ... } based on sort_value?
  // Or simply just "number" as value if keys don't matter much.
  // Let's construct a Record<string, string> based on typical JSON structure expectations.
  // If the JSON has keys like "0", "1", etc. representing order.
  const additionalModelNames: Record<string, string> = {};
  for (const row of nameRows) {
    additionalModelNames[row.sortValue.toString()] = row.number;
  }

  // 3. Additional Model Conditions
  const conditionsSql = `
    SELECT
      t1.area_rate AS areaRate,
      t2.number
    FROM image_analysis_additionalaimodelcondition AS t1
    JOIN image_analysis_aimodelnumber AS t2 ON t1.ai_model_number_id = t2.id
    WHERE t1.ai_model_id = :id
  `;

  const conditionRows = await selectRows<{
    areaRate: number;
    number: string;
    constructor: { name: "RowDataPacket" };
  }>(conditionsSql, { id: model.id });

  // Construct Record<string, number> where key is the model number and value is area_rate?
  // Or vice versa? Usually "condition" implies mapping FROM something TO something.
  // Let's assume key = model number, value = area_rate based on column names.
  const additionalModelConditions: Record<string, number> = {};
  for (const row of conditionRows) {
    additionalModelConditions[row.number] = row.areaRate;
  }

  return {
    ...model,
    additionalModelNames:
      Object.keys(additionalModelNames).length > 0
        ? additionalModelNames
        : undefined,
    additionalModelConditions:
      Object.keys(additionalModelConditions).length > 0
        ? additionalModelConditions
        : undefined,
  };
}
