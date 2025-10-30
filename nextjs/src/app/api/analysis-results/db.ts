import type { RowDataPacket } from "mysql2";

import { selectRows } from "@/lib/mysql/client";

const USER_IDS_QUERY = `
  SELECT DISTINCT iaa.user_id AS userId
  FROM image_analysis_analysisdata AS iaa
  WHERE iaa.is_deleted = 0
  ORDER BY iaa.user_id ASC
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
