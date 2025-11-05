import "server-only";

import { logger } from "@/lib/logger/server";
import { prisma } from "@/lib/prisma/client";

const repositoryLogger = logger.child({ component: "JudgeImageRepository" });

export interface JudgeImageEvaluationRecord {
  id: string;
  userId: string;
  analysisId: string;
  originalImageUrl: string;
  maskImageUrl: string;
  isExcel: boolean;
  point: number | null;
  updatedAt: Date;
  createdAt: Date;
}

export async function upsertJudgeImageEvaluation(params: {
  userId: string;
  analysisId: string;
  originalImageUrl: string;
  maskImageUrl: string;
  isExcel: boolean;
  point: number;
}): Promise<JudgeImageEvaluationRecord> {
  const { userId, analysisId, originalImageUrl, maskImageUrl, isExcel, point } =
    params;

  const record = await prisma.judgeImage.upsert({
    where: {
      userId_analysisId_originalImageUrl: {
        userId,
        analysisId,
        originalImageUrl,
      },
    },
    create: {
      userId,
      analysisId,
      originalImageUrl,
      maskImageUrl,
      isExcel,
      point,
    },
    update: {
      maskImageUrl,
      isExcel,
      point,
    },
  });

  repositoryLogger.info("JudgeImage evaluation saved", {
    userId,
    analysisId,
    originalImageUrl,
    maskImageUrl,
    isExcel,
    point,
  });

  return record;
}

export async function findJudgeImageEvaluations(params: {
  userId: string;
  analysisId: string;
  originalImageUrls: string[];
}): Promise<JudgeImageEvaluationRecord[]> {
  const { userId, analysisId, originalImageUrls } = params;
  if (!originalImageUrls.length) {
    return [];
  }

  const records = await prisma.judgeImage.findMany({
    where: {
      userId,
      analysisId,
      originalImageUrl: {
        in: originalImageUrls,
      },
    },
  });

  repositoryLogger.debug("Loaded JudgeImage evaluations", {
    userId,
    analysisId,
    count: records.length,
  });

  return records;
}
