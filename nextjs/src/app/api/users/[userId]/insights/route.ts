import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { getUserInsights } from "@/lib/users/dashboard-service";

const insightsLogger = logger.child({ component: "user-insights-route" });

type UserInsightsData = Awaited<ReturnType<typeof getUserInsights>>;
type MaterialisedInsights = NonNullable<UserInsightsData>;

interface UserInsightsSuccessResponse {
  ok: true;
  user: {
    userId: string;
    totalAnalyses: number;
    latestAnalysisAt?: string;
    questionnaireSubmittedAt?: string;
    companyName?: string | null;
    registeredAt?: string | null;
  };
  analyses: MaterialisedInsights["analyses"];
  timeline: MaterialisedInsights["timeline"];
  modelUsage: MaterialisedInsights["modelUsage"];
  questionnaire: MaterialisedInsights["questionnaire"] | null;
  questionnaires: MaterialisedInsights["questionnaires"];
}

interface UserInsightsErrorResponse {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
}

type UserInsightsResponse =
  | UserInsightsSuccessResponse
  | UserInsightsErrorResponse;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;

  if (!userId || userId.trim().length === 0) {
    return NextResponse.json<UserInsightsResponse>(
      {
        ok: false,
        code: "ValidationError",
        message: "ユーザーIDが指定されていません",
      },
      { status: 400 },
    );
  }

  insightsLogger.info("User insights requested", { userId });

  try {
    const insights = await getUserInsights(userId.trim());
    if (!insights) {
      return NextResponse.json<UserInsightsResponse>(
        {
          ok: false,
          code: "ValidationError",
          message: "指定されたユーザーの情報が取得できませんでした",
        },
        { status: 404 },
      );
    }

    const latestAnalysisAt = insights.analyses[0]?.sentAt;

    return NextResponse.json<UserInsightsResponse>({
      ok: true,
      user: {
        userId: insights.userId,
        totalAnalyses: insights.totalAnalyses,
        latestAnalysisAt: latestAnalysisAt ?? undefined,
        questionnaireSubmittedAt: insights.questionnaire?.submittedAt,
        companyName: insights.companyName ?? null,
        registeredAt: insights.registeredAt ?? null,
      },
      analyses: insights.analyses,
      timeline: insights.timeline,
      modelUsage: insights.modelUsage,
      questionnaire: insights.questionnaire ?? null,
      questionnaires: insights.questionnaires,
    });
  } catch (error) {
    insightsLogger.error("Failed to fetch user insights", { userId, error });
    return NextResponse.json<UserInsightsResponse>(
      {
        ok: false,
        code: "UnexpectedError",
        message: "ユーザー詳細の取得に失敗しました",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
