"use server";

import { z } from "zod";

import { logger } from "@/lib/logger/server";
import {
  findJudgeImageEvaluations,
  upsertJudgeImageEvaluation,
} from "@/lib/results/judge-image-repository";
import { isJudgeImageUser } from "@/lib/users/config";

const actionsLogger = logger.child({ component: "ResultsActions" });

const evaluateInputSchema = z.object({
  userId: z.string().min(1, "ユーザーIDが指定されていません"),
  analysisId: z.string().min(1, "解析IDが指定されていません"),
  analysisType: z.string().trim().min(1, "解析種別が指定されていません"),
  originalImageUrl: z.string().min(1, "元画像の識別子が指定されていません"),
  maskImageUrl: z.string().min(1, "マスク画像の識別子が指定されていません"),
  isExcel: z.boolean(),
  point: z.union([z.literal(0), z.literal(100)]),
});

const fetchInputSchema = z.object({
  userId: z.string().min(1, "ユーザーIDが指定されていません"),
  analysisId: z.string().min(1, "解析IDが指定されていません"),
  originalImageUrls: z
    .array(z.string().min(1))
    .min(1, "評価対象の画像が指定されていません"),
});

interface JudgeImageEvaluationDTO {
  id: string;
  originalImageUrl: string;
  maskImageUrl: string;
  point: number | null;
  isExcel: boolean;
  updatedAt: string;
}

type EvaluateJudgeImageActionResult =
  | { ok: true; evaluation: JudgeImageEvaluationDTO }
  | { ok: false; message: string };

type FetchJudgeImageEvaluationsResult =
  | { ok: true; evaluations: JudgeImageEvaluationDTO[] }
  | { ok: false; message: string };

function ensureJudgePermission(userId: string): string | null {
  const allowedUserId = process.env.KNIT_MEMBER;
  if (!allowedUserId) {
    actionsLogger.warn("KNIT_MEMBER が設定されていません");
    return "評価権限が設定されていません。環境変数 KNIT_MEMBER を確認してください。";
  }
  if (allowedUserId !== userId) {
    actionsLogger.warn("JudgeImage 操作の権限がありません", {
      requestedUserId: userId,
      allowedUserId,
    });
    return "この解析に対する評価権限がありません。";
  }
  if (!isJudgeImageUser(userId)) {
    actionsLogger.warn("JudgeImage 操作対象外のユーザーです", {
      userId,
    });
    return "このユーザーは評価対象外です。";
  }
  return null;
}

export async function evaluateJudgeImageAction(
  input: z.infer<typeof evaluateInputSchema>,
): Promise<EvaluateJudgeImageActionResult> {
  const parseResult = evaluateInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      message: parseResult.error.issues[0]?.message ?? "入力値が不正です。",
    };
  }

  const {
    userId,
    analysisId,
    analysisType,
    originalImageUrl,
    maskImageUrl,
    isExcel,
    point,
  } = parseResult.data;

  const permissionError = ensureJudgePermission(userId);
  if (permissionError) {
    return { ok: false, message: permissionError };
  }

  if (analysisType !== "main") {
    actionsLogger.warn("非対応の解析種別に対する評価操作が試行されました", {
      userId,
      analysisId,
      analysisType,
    });
    return {
      ok: false,
      message: "本解析以外のプレビューは評価できません。",
    };
  }

  try {
    actionsLogger.info("JudgeImage evaluation invoked", {
      userId,
      analysisId,
      analysisType,
      originalImageUrl,
      point,
      isExcel,
    });
    const record = await upsertJudgeImageEvaluation({
      userId,
      analysisId,
      originalImageUrl,
      maskImageUrl,
      isExcel,
      point,
    });

    return {
      ok: true,
      evaluation: {
        id: record.id,
        originalImageUrl: record.originalImageUrl,
        maskImageUrl: record.maskImageUrl,
        point: record.point ?? null,
        isExcel: record.isExcel,
        updatedAt: record.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    actionsLogger.error("JudgeImage 評価の保存に失敗しました", {
      userId,
      analysisId,
      originalImageUrl,
      maskImageUrl,
      error,
    });
    return {
      ok: false,
      message: "評価の保存に失敗しました。時間をおいて再度お試しください。",
    };
  }
}

export async function getJudgeImageEvaluationsAction(
  input: z.infer<typeof fetchInputSchema>,
): Promise<FetchJudgeImageEvaluationsResult> {
  const parseResult = fetchInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      message: parseResult.error.issues[0]?.message ?? "入力値が不正です。",
    };
  }

  const { userId, analysisId } = parseResult.data;
  const originalImageUrls = Array.from(
    new Set<string>(parseResult.data.originalImageUrls),
  );

  const permissionError = ensureJudgePermission(userId);
  if (permissionError) {
    return { ok: false, message: permissionError };
  }

  try {
    const records = await findJudgeImageEvaluations({
      userId,
      analysisId,
      originalImageUrls,
    });

    const evaluations: JudgeImageEvaluationDTO[] = records.map((record) => ({
      id: record.id,
      originalImageUrl: record.originalImageUrl,
      maskImageUrl: record.maskImageUrl,
      point: record.point ?? null,
      isExcel: record.isExcel,
      updatedAt: record.updatedAt.toISOString(),
    }));

    return { ok: true, evaluations };
  } catch (error) {
    actionsLogger.error("JudgeImage 評価の取得に失敗しました", {
      userId,
      analysisId,
      count: originalImageUrls.length,
      error,
    });
    return {
      ok: false,
      message: "評価の取得に失敗しました。時間をおいて再度お試しください。",
    };
  }
}
