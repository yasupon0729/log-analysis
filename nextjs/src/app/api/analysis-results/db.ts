import type { RowDataPacket } from "mysql2";

import { selectRows } from "@/lib/mysql/client";

const USER_IDS_QUERY = `
  SELECT DISTINCT iaa.user_id AS userId
  FROM image_analysis_analysisdata AS iaa
  WHERE iaa.is_deleted = 0
  ORDER BY iaa.user_id ASC
`;

const USER_PROFILES_QUERY = `
  SELECT DISTINCT
    iaa.user_id AS userId,
    acu.company_name AS companyName,
    acu.date_joined AS registeredAt
  FROM image_analysis_analysisdata AS iaa
  LEFT JOIN accounts_customuser AS acu ON acu.id = iaa.user_id
  WHERE iaa.is_deleted = 0
    /** optionalUserIdCondition */
  ORDER BY iaa.user_id ASC
`;

const USER_MONTHLY_COMPLETED_COUNTS_QUERY = `
  SELECT
    DATE_FORMAT(iaa.sent_at, '%Y-%m') AS month,
    COALESCE(SUM(iaa.completed_count), 0) AS completedCount
  FROM image_analysis_analysisdata AS iaa
  WHERE iaa.is_deleted = 0
    AND iaa.user_id = :userId
    AND iaa.sent_at IS NOT NULL
    AND iaa.sent_at >= :startDate
  GROUP BY month
  ORDER BY month ASC
`;

const USER_MODEL_COMPLETIONS_QUERY = `
  SELECT
    COALESCE(iam.ai_model_name, 'モデル未設定') AS modelName,
    COALESCE(SUM(iaa.completed_count), 0) AS completedCount
  FROM image_analysis_analysisdata AS iaa
  LEFT JOIN image_analysis_imageanalysis AS iai
    ON iai.id = iaa.image_analysis_id
  LEFT JOIN image_analysis_aimodel AS iam
    ON iam.id = iai.ai_model_id
  WHERE iaa.is_deleted = 0
    AND iaa.user_id = :userId
    AND iaa.sent_at IS NOT NULL
    AND iaa.sent_at >= :startDate
  GROUP BY modelName
  ORDER BY completedCount DESC, modelName ASC
  LIMIT :limit
`;

const USER_EXISTS_QUERY = `
  SELECT 1
  FROM image_analysis_analysisdata AS iaa
  WHERE iaa.is_deleted = 0
    AND iaa.user_id = :userId
  LIMIT 1
`;

const ANALYSIS_IDS_QUERY = `
  SELECT DISTINCT iaa.image_analysis_id AS analysisId
  FROM image_analysis_analysisdata AS iaa
  WHERE iaa.is_deleted = 0
    AND iaa.user_id = :userId
  ORDER BY iaa.image_analysis_id DESC
  LIMIT :limit
`;

type UserRow = RowDataPacket & { userId: number | string };
type UserProfileRow = RowDataPacket & {
  userId: number | string;
  companyName: string | null;
  registeredAt: string | null;
};
type UserMonthlyCompletionRow = RowDataPacket & {
  month: string | null;
  completedCount: number | string | null;
};
type UserModelCompletionRow = RowDataPacket & {
  modelName: string | null;
  completedCount: number | string | null;
};
type ExistsRow = RowDataPacket;
type AnalysisRow = RowDataPacket & { analysisId: number | string };

export async function resolveUserIdsFromDatabase(
  expected?: string,
): Promise<string[]> {
  if (expected) {
    const exists = await selectRows<ExistsRow>(USER_EXISTS_QUERY, {
      userId: Number(expected),
    });
    return exists.length > 0 ? [expected] : [];
  }

  const rows = await selectRows<UserRow>(USER_IDS_QUERY);
  return rows.map((row) => row.userId.toString());
}

export async function resolveUserProfilesFromDatabase(
  expected?: string,
): Promise<
  Array<{
    userId: string;
    companyName: string | null;
    registeredAt: string | null;
  }>
> {
  if (expected) {
    const rows = await selectRows<UserProfileRow>(
      USER_PROFILES_QUERY.replace(
        "/** optionalUserIdCondition */",
        "AND iaa.user_id = :userId",
      ),
      {
        userId: Number(expected),
      },
    );
    return rows.map((row) => ({
      userId: row.userId.toString(),
      companyName: row.companyName,
      registeredAt: row.registeredAt,
    }));
  }

  const rows = await selectRows<UserProfileRow>(
    USER_PROFILES_QUERY.replace("/** optionalUserIdCondition */", ""),
  );
  return rows.map((row) => ({
    userId: row.userId.toString(),
    companyName: row.companyName,
    registeredAt: row.registeredAt,
  }));
}

export async function resolveAnalysisIdsFromDatabase(
  userId: string,
  desiredCount?: number,
): Promise<string[]> {
  const limit = desiredCount && desiredCount > 0 ? desiredCount : 1000;
  const rows = await selectRows<AnalysisRow>(ANALYSIS_IDS_QUERY, {
    userId: Number(userId),
    limit,
  });
  return rows.map((row) => row.analysisId.toString());
}

export async function resolveUserMonthlyCompletedCounts(
  userId: string,
  months = 12,
): Promise<Array<{ month: string; completedCount: number }>> {
  const monthCount = Math.max(1, months);
  const startDate = computeMonthStart(monthCount);

  const rows = await selectRows<UserMonthlyCompletionRow>(
    USER_MONTHLY_COMPLETED_COUNTS_QUERY,
    {
      userId: Number(userId),
      startDate,
    },
  );

  return rows
    .map((row) => ({
      month: row.month ?? "",
      completedCount: Number(row.completedCount ?? 0),
    }))
    .filter((entry) => entry.month.length > 0);
}

export async function resolveUserModelCompletions(
  userId: string,
  months = 12,
  limit = 10,
): Promise<Array<{ modelName: string; completedCount: number }>> {
  const monthCount = Math.max(1, months);
  const startDate = computeMonthStart(monthCount);
  const cappedLimit = Math.max(1, limit);

  const rows = await selectRows<UserModelCompletionRow>(
    USER_MODEL_COMPLETIONS_QUERY,
    {
      userId: Number(userId),
      startDate,
      limit: cappedLimit,
    },
  );

  return rows.map((row) => ({
    modelName: (row.modelName ?? "モデル未設定").trim(),
    completedCount: Number(row.completedCount ?? 0),
  }));
}

function computeMonthStart(months: number): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const year = start.getFullYear();
  const month = String(start.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}
