"use server";

import {
  ANALYSIS_BUCKET,
  ANALYSIS_REGION,
} from "@/app/api/analysis-results/common";
import {
  resolveAnalysisIdsFromDatabase,
  resolveUserIdsFromDatabase,
  resolveUserModelCompletions,
  resolveUserMonthlyCompletedCounts,
  resolveUserProfilesFromDatabase,
} from "@/app/api/analysis-results/db";
import {
  type AnalysisCollectionParams,
  type AnalysisCollectionResult,
  type AnalysisResultFileEntry,
  type AnalysisResultSummary,
  type AnalysisTimelinePoint,
  buildAnalysisPrefix,
  collectAnalysisData,
  type ModelUsageEntry,
} from "@/lib/analysis-results/service";
import { logger } from "@/lib/logger/server";
import { getQuestionnaireClient } from "@/lib/questionnaire/client";
import type { QuestionnaireRecord } from "@/lib/questionnaire/types";
import { S3Client } from "@/lib/s3/client";

const dashboardLogger = logger.child({ component: "users-dashboard-service" });

const analysisClient = new S3Client({
  bucket: ANALYSIS_BUCKET,
  region: ANALYSIS_REGION,
});

const analysisDependencies = {
  resolveUserIds: resolveUserIdsFromDatabase,
  resolveAnalysisIdsFromDatabase,
};

const questionnaireClient = getQuestionnaireClient();

const DEFAULT_PAGE_SIZE = 50;
const LIST_PAGE_SIZE = 10;
export interface UserOverview {
  userId: string;
  totalAnalyses: number;
  latestAnalysisAt?: string;
  modelUsage: ModelUsageEntry[];
  questionnaireSubmittedAt?: string;
  hasQuestionnaire: boolean;
  companyName?: string | null;
  registeredAt?: string | null;
}

export interface UserInsights {
  userId: string;
  totalAnalyses: number;
  analyses: AnalysisResultSummary[];
  files: AnalysisResultFileEntry[];
  timeline: AnalysisTimelinePoint[];
  modelUsage: ModelUsageEntry[];
  questionnaire?: QuestionnaireRecord | null;
  companyName?: string | null;
  registeredAt?: string | null;
}

export async function getUsersOverview(
  options: { limit?: number } = {},
): Promise<UserOverview[]> {
  const profiles = await resolveUserProfilesFromDatabase();
  if (!profiles.length) {
    return [];
  }

  const limit =
    options.limit && options.limit > 0 ? options.limit : profiles.length;
  const targets = profiles.slice(0, limit);

  const results: UserOverview[] = [];

  for (const profile of targets) {
    const { userId, companyName = null, registeredAt = null } = profile;
    const analysis = await fetchAnalysisData({
      userId,
      page: 1,
      pageSize: LIST_PAGE_SIZE,
    });

    const modelUsage = await resolveUserModelCompletions(userId, 12, 3);

    const questionnaire = await questionnaireClient.getAnswers(userId);
    const latestAnalysisAt = analysis.analyses[0]?.lastModified;

    results.push({
      userId,
      totalAnalyses: analysis.totalAnalyses,
      latestAnalysisAt,
      modelUsage: modelUsage.map((entry) => ({
        model: entry.modelName,
        count: entry.completedCount,
      })),
      questionnaireSubmittedAt: questionnaire?.submittedAt,
      hasQuestionnaire: Boolean(questionnaire),
      companyName,
      registeredAt,
    });
  }

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

  const [profile] = await resolveUserProfilesFromDatabase(userId);
  const companyName = profile?.companyName ?? null;
  const registeredAt = profile?.registeredAt ?? null;

  const pageSize =
    options.pageSize && options.pageSize > 0
      ? options.pageSize
      : DEFAULT_PAGE_SIZE;
  const analysis = await fetchAnalysisData({
    userId,
    page: 1,
    pageSize,
  });
  const monthlyCounts = await resolveUserMonthlyCompletedCounts(userId);
  const timeline = buildMonthlyTimeline(monthlyCounts);

  if (!analysis.totalAnalyses) {
    const questionnaire = await questionnaireClient.getAnswers(userId);
    return {
      userId,
      totalAnalyses: 0,
      analyses: [],
      files: [],
      timeline,
      modelUsage: [],
      questionnaire,
      companyName,
      registeredAt,
    };
  }

  const modelUsage = await resolveUserModelCompletions(userId);
  const questionnaire = await questionnaireClient.getAnswers(userId);

  return {
    userId,
    totalAnalyses: analysis.totalAnalyses,
    analyses: analysis.analyses,
    files: analysis.files,
    timeline,
    modelUsage: modelUsage.map((entry) => ({
      model: entry.modelName,
      count: entry.completedCount,
    })),
    questionnaire,
    companyName,
    registeredAt,
  };
}

async function fetchAnalysisData(
  params: AnalysisCollectionParams,
): Promise<AnalysisCollectionResult> {
  dashboardLogger.info("Fetching analysis data for dashboard", {
    userId: params.userId,
    page: params.page,
    pageSize: params.pageSize,
  });

  return collectAnalysisData(analysisClient, params, analysisDependencies);
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
