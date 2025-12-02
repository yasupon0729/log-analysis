export interface AiModel {
  id: number;
  aiModelName: string;
  aiModelDescription: string | null;
  internalNotes: string | null;
  customerName: string;
  aiModelCode: string;
  predictMode: string;
  maskingPredict: boolean;
  transformPredict: unknown; // JSON
  hybridClassify: string;
  edgeRemove: boolean;
  overlapRemove: boolean;
  overlapRemoveFilterSize: number | null;
  overlapRemoveAtSegAndCls: boolean;
  overlapRemoveAtSegAndClsFilterSize: number | null;
  price: number;
  exclusiveUse: boolean;
  isActive: boolean;
  publishDate: Date | string | null;
  isTrial: boolean;
  areaRateThreshold: number | null;
  areaRateThresholdAtSegAndCls: number | null;
  areaRateThresholdInInferences: number | null;
  overlapMode: string | null;
  overlapModeAtSegAndCls: string | null;
  addClassLabelOffset: boolean;
}

export interface AiModelNumber {
  id: number;
  number: string;
  notes: string | null;
}

export interface AdditionalAiModelNumber {
  id: number;
  sortValue: number;
  aiModelId: number;
  aiModelNumberId: number;
  number: string; // JOINして取得
}

export interface AdditionalAiModelCondition {
  id: number;
  areaRate: number;
  aiModelId: number;
  aiModelNumberId: number;
  number: string; // JOINして取得
}

// 取得時に結合されたデータを扱うための拡張型
export interface AiModelWithDetails extends AiModel {
  additionalModelNames?: Record<string, string>; // JSON形式に合わせる場合
  additionalModelConditions?: Record<string, number>; // JSON形式に合わせる場合
}