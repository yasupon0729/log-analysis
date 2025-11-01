"use server";

import {
  resolveUserAnalysisSummaries,
  resolveUserModelCompletions,
  resolveUserMonthlyCompletedCounts,
  resolveUserOverviewsFromDatabase,
  resolveUserProfilesFromDatabase,
} from "@/app/api/analysis-results/db";
import {
  type AnalysisTimelinePoint,
  buildAnalysisPrefix,
  type ModelUsageEntry,
} from "@/lib/analysis-results/service";
import { logger } from "@/lib/logger/server";
import { hasMysqlConfiguration } from "@/lib/mysql/client";
import { getQuestionnaireClient } from "@/lib/questionnaire/client";
import type { QuestionnaireRecord } from "@/lib/questionnaire/types";

const dashboardLogger = logger.child({ component: "users-dashboard-service" });

const questionnaireClient = getQuestionnaireClient();

const ANALYSIS_SUMMARY_LIMIT = 20;
export interface UserOverview {
  userId: string;
  totalAnalyses: number;
  latestAnalysisAt?: string;
  modelUsage?: ModelUsageEntry[];
  questionnaireSubmittedAt?: string;
  hasQuestionnaire?: boolean;
  companyName?: string | null;
  registeredAt?: string | null;
}

export interface UserAnalysisSummary {
  analysisId: string;
  analysisType: string;
  sentAt?: string | null;
  completedCount: number;
  totalCount: number;
}

export interface UserInsights {
  userId: string;
  totalAnalyses: number;
  analyses: UserAnalysisSummary[];
  timeline: AnalysisTimelinePoint[];
  modelUsage: ModelUsageEntry[];
  questionnaire?: QuestionnaireRecord | null;
  questionnaires: QuestionnaireRecord[];
  companyName?: string | null;
  registeredAt?: string | null;
}

export async function getUsersOverview(
  options: { limit?: number } = {},
): Promise<UserOverview[]> {
  if (!hasMysqlConfiguration()) {
    dashboardLogger.warn(
      "MySQL configuration is missing; returning empty users overview",
    );
    return [];
  }

  const overviews = await resolveUserOverviewsFromDatabase();
  if (!overviews.length) {
    return [];
  }

  const limit =
    options.limit && options.limit > 0 ? options.limit : overviews.length;
  const targets = overviews.slice(0, limit);

  const results: UserOverview[] = targets.map((entry) => {
    const latestAnalysisAt = normalizeDate(entry.latestAnalysisAt);
    const registeredAt = normalizeDate(entry.registeredAt);

    const overview: UserOverview = {
      userId: entry.userId,
      totalAnalyses: entry.totalAnalyses,
      companyName: entry.companyName ?? null,
    };

    if (latestAnalysisAt) {
      overview.latestAnalysisAt = latestAnalysisAt;
    }
    if (registeredAt) {
      overview.registeredAt = registeredAt;
    }

    return overview;
  });

  return results.sort((a, b) => {
    if (a.latestAnalysisAt && b.latestAnalysisAt) {
      return b.latestAnalysisAt.localeCompare(a.latestAnalysisAt, "ja");
    }
    if (a.latestAnalysisAt) {
      return -1;
    }
    if (b.latestAnalysisAt) {
      return 1;
    }
    return a.userId.localeCompare(b.userId, "ja");
  });
}

export async function getUserInsights(
  userId: string,
  options: { pageSize?: number } = {},
): Promise<UserInsights | null> {
  if (!userId) {
    return null;
  }

  if (!hasMysqlConfiguration()) {
    dashboardLogger.warn(
      "MySQL configuration is missing; returning empty insights",
      {
        userId,
      },
    );
    const timeline = buildMonthlyTimeline([]);
    const questionnaires = await questionnaireClient.getAllAnswers(userId);
    const primaryQuestionnaire =
      questionnaires.find((entry) => entry.hasResponses) ?? null;

    return {
      userId,
      totalAnalyses: 0,
      analyses: [],
      timeline,
      modelUsage: [],
      questionnaire: primaryQuestionnaire,
      questionnaires,
      companyName: null,
      registeredAt: null,
    };
  }

  const [overview] = await resolveUserOverviewsFromDatabase(userId);
  let companyName = overview?.companyName ?? null;
  let registeredAt = normalizeDate(overview?.registeredAt) ?? null;
  const totalAnalyses = overview?.totalAnalyses ?? 0;

  if (!overview) {
    const [profile] = await resolveUserProfilesFromDatabase(userId);
    companyName = profile?.companyName ?? null;
    registeredAt = normalizeDate(profile?.registeredAt) ?? null;
  }

  const limit =
    options.pageSize && options.pageSize > 0
      ? options.pageSize
      : ANALYSIS_SUMMARY_LIMIT;
  const summaries = await resolveUserAnalysisSummaries(userId, limit);
  const monthlyCounts = await resolveUserMonthlyCompletedCounts(userId);
  const timeline = buildMonthlyTimeline(monthlyCounts);

  if (!totalAnalyses) {
    const questionnaires = await questionnaireClient.getAllAnswers(userId);
    const primaryQuestionnaire =
      questionnaires.find((entry) => entry.hasResponses) ?? null;
    return {
      userId,
      totalAnalyses: 0,
      analyses: [],
      timeline,
      modelUsage: [],
      questionnaire: primaryQuestionnaire,
      questionnaires,
      companyName,
      registeredAt,
    };
  }

  const modelUsage = await resolveUserModelCompletions(userId);
  const questionnaires = await questionnaireClient.getAllAnswers(userId);
  const primaryQuestionnaire =
    questionnaires.find((entry) => entry.hasResponses) ?? null;

  return {
    userId,
    totalAnalyses,
    analyses: summaries.map((summary) => ({
      analysisId: summary.analysisId,
      analysisType: summary.analysisType,
      completedCount: summary.completedCount,
      totalCount: summary.totalCount,
      sentAt: normalizeDate(summary.sentAt),
    })),
    timeline,
    modelUsage: modelUsage.map((entry) => ({
      model: entry.modelName,
      count: entry.completedCount,
    })),
    questionnaire: primaryQuestionnaire,
    questionnaires,
    companyName,
    registeredAt,
  };
}

export async function resolveAnalysisPrefix(
  userId: string,
  analysisType: string,
  analysisId: string,
): Promise<string> {
  return buildAnalysisPrefix({
    userId,
    analysisType,
    analysisId,
  });
}

function buildMonthlyTimeline(
  entries: Array<{ month: string; completedCount: number }>,
  months = 12,
): AnalysisTimelinePoint[] {
  const desiredMonths = Math.max(1, months);
  const map = new Map(
    entries.map((entry) => [entry.month, entry.completedCount]),
  );
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);

  const timeline: AnalysisTimelinePoint[] = [];

  for (let index = desiredMonths - 1; index >= 0; index -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    const completedCount = map.get(key) ?? 0;
    const label = `${current.getFullYear()}年${String(current.getMonth() + 1).padStart(2, "0")}月`;

    timeline.push({
      date: label,
      analysisCount: completedCount,
      fileCount: 0,
      totalSize: 0,
    });
  }

  return timeline;
}

function normalizeDate(value?: string | Date | null): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}
