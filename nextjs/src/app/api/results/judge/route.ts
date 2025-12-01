import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger/server";
import {
  findJudgeImageEvaluations,
  upsertJudgeImageEvaluation,
} from "@/lib/results/judge-image-repository";
import { isJudgeImageUser } from "@/lib/users/config";

const routeLogger = logger.child({ component: "judge-image-api" });

const postSchema = z.object({
  userId: z.string().min(1),
  analysisId: z.string().min(1),
  analysisType: z.string().min(1),
  originalImageUrl: z.string().min(1),
  maskImageUrl: z.string().min(1),
  isExcel: z.boolean(),
  point: z.union([z.literal(0), z.literal(100)]),
});

const getSchema = z.object({
  userId: z.string().min(1),
  analysisId: z.string().min(1),
  imageUrls: z.array(z.string().min(1)).min(1),
});

function ensurePermission(userId: string): string | null {
  const allowedUserId = process.env.KNIT_MEMBER;
  if (!allowedUserId) {
    routeLogger.warn("KNIT_MEMBER is not configured");
    return "評価権限が設定されていません。環境変数 KNIT_MEMBER を確認してください。";
  }
  if (allowedUserId !== userId) {
    routeLogger.warn("User attempted to evaluate without permission", {
      allowedUserId,
      requestedUserId: userId,
    });
    return "この解析に対する評価権限がありません。";
  }
  if (!isJudgeImageUser(userId)) {
    routeLogger.warn("User is not allowed to evaluate images", { userId });
    return "このユーザーは評価対象外です。";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "入力値が不正です。";
      return NextResponse.json({ ok: false, message }, { status: 400 });
    }

    const {
      userId,
      analysisId,
      analysisType,
      originalImageUrl,
      maskImageUrl,
      isExcel,
      point,
    } = parsed.data;

    if (analysisType !== "main") {
      return NextResponse.json(
        { ok: false, message: "本解析以外のプレビューは評価できません。" },
        { status: 403 },
      );
    }

    const permissionError = ensurePermission(userId);
    if (permissionError) {
      return NextResponse.json(
        { ok: false, message: permissionError },
        { status: 403 },
      );
    }

    try {
      const record = await upsertJudgeImageEvaluation({
        userId,
        analysisId,
        originalImageUrl,
        maskImageUrl,
        isExcel,
        point,
      });

      routeLogger.info("JudgeImage evaluation saved", {
        userId,
        analysisId,
        originalImageUrl,
        point,
        isExcel,
      });

      return NextResponse.json({
        ok: true,
        evaluation: {
          id: record.id,
          originalImageUrl: record.originalImageUrl,
          maskImageUrl: record.maskImageUrl,
          point: record.point ?? null,
          isExcel: record.isExcel,
          updatedAt: record.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      routeLogger.error("Failed to save JudgeImage evaluation", {
        userId,
        analysisId,
        originalImageUrl,
        error,
      });
      return NextResponse.json(
        {
          ok: false,
          message: "評価の保存に失敗しました。時間をおいて再度お試しください。",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    routeLogger.error("Unexpected error while saving evaluation", { error });
    return NextResponse.json(
      {
        ok: false,
        message: "評価の保存に失敗しました。時間をおいて再度お試しください。",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const imageUrls = url.searchParams.getAll("imageUrl");
  const payload = {
    userId: url.searchParams.get("userId") ?? "",
    analysisId: url.searchParams.get("analysisId") ?? "",
    imageUrls,
  };

  const parsed = getSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "入力値が不正です。";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }

  const { userId, analysisId } = parsed.data;
  const uniqueImageUrls = Array.from(new Set(parsed.data.imageUrls));

  const permissionError = ensurePermission(userId);
  if (permissionError) {
    return NextResponse.json(
      { ok: false, message: permissionError },
      { status: 403 },
    );
  }

  try {
    const records = await findJudgeImageEvaluations({
      userId,
      analysisId,
      originalImageUrls: uniqueImageUrls,
    });

    return NextResponse.json({
      ok: true,
      evaluations: records.map((record) => ({
        id: record.id,
        originalImageUrl: record.originalImageUrl,
        maskImageUrl: record.maskImageUrl,
        point: record.point ?? null,
        isExcel: record.isExcel,
        updatedAt: record.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    routeLogger.error("Failed to load JudgeImage evaluations", {
      userId,
      analysisId,
      count: uniqueImageUrls.length,
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        ok: false,
        message: "評価の取得に失敗しました。時間をおいて再度お試しください。",
      },
      { status: 500 },
    );
  }
}
