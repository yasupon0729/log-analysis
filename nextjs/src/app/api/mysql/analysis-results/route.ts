import type { RowDataPacket } from "mysql2";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { selectRows } from "@/lib/mysql/client";
import {
  ANALYSIS_RESULTS_BASE_CONDITION,
  ANALYSIS_RESULTS_DEFAULT_ORDER,
  ANALYSIS_RESULTS_FROM_CLAUSE,
  ANALYSIS_RESULTS_SELECT_FIELDS,
} from "./const";

const routeLogger = logger.child({ component: "mysql-analysis-results-route" });

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type AnalysisRow = RowDataPacket & {
  analysisDataId: number;
  userId: number;
  imageAnalysisId: number | null;
  sentAt: string;
  sentStatus: number;
  analyzerName: string | null;
  analysisStatus: string | null;
  analysisType: string;
  downloadLink: string | null;
  totalCount: number;
  completedCount: number;
  incompleteCount: number;
  notes: string | null;
  sendEmailList: string | null;
  etag: string | null;
  dummyResult: string | null;
  imageAnalysisTitle: string | null;
  imageAnalysisFileName: string | null;
  originalImage: string | null;
  processedImage: string | null;
  imageUploadedAt: string | null;
  imageUnit: number | null;
  imageScalingFactor: number | null;
  aiModelName: string | null;
  aiModelCode: string | null;
  username: string | null;
  companyName: string | null;
  userEmail: string | null;
};

type CountRow = RowDataPacket & { total: number };

type OptionRow<T extends string> = RowDataPacket &
  Record<T, string | number | null>;

function clampPage(value: number | undefined) {
  if (!value || Number.isNaN(value) || value <= 0) {
    return 1;
  }
  return value;
}

function clampPageSize(value: number | undefined) {
  if (!value || Number.isNaN(value) || value <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(value, MAX_PAGE_SIZE);
}

function buildWhereClause(conditions: string[]) {
  const trimmed = conditions
    .map((condition) => condition.trim())
    .filter((condition) => condition.length > 0);
  if (trimmed.length === 0) {
    return "";
  }
  return `WHERE ${trimmed.join(" AND ")}`;
}

function sanitizeNumericParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  return Number.parseInt(trimmed, 10);
}

function sanitizeStatusParam(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pageParam = sanitizeNumericParam(url.searchParams.get("page"));
  const pageSizeParam = sanitizeNumericParam(url.searchParams.get("pageSize"));
  const userIdParam = sanitizeNumericParam(url.searchParams.get("userId"));
  const analysisIdParam = sanitizeNumericParam(
    url.searchParams.get("analysisId"),
  );
  const statusParam = sanitizeStatusParam(url.searchParams.get("status"));

  const page = clampPage(pageParam);
  const pageSize = clampPageSize(pageSizeParam);
  const offset = (page - 1) * pageSize;

  const queryParams: Record<string, unknown> = {
    limit: pageSize,
    offset,
  };

  const countParams: Record<string, unknown> = {};
  const baseConditions = [ANALYSIS_RESULTS_BASE_CONDITION];
  const whereConditions: string[] = [...baseConditions];
  const optionConditions: string[] = [...baseConditions];

  if (typeof userIdParam === "number") {
    whereConditions.push("iaa.user_id = :userId");
    optionConditions.push("iaa.user_id = :userId");
    queryParams.userId = userIdParam;
    countParams.userId = userIdParam;
  }

  if (typeof analysisIdParam === "number") {
    whereConditions.push("iaa.image_analysis_id = :analysisId");
    queryParams.analysisId = analysisIdParam;
    countParams.analysisId = analysisIdParam;
  }

  if (statusParam) {
    whereConditions.push("iaa.status = :status");
    queryParams.status = statusParam;
    countParams.status = statusParam;
  }

  const whereClause = buildWhereClause(whereConditions);
  const analysisIdOptionsWhere = buildWhereClause(optionConditions);
  const usersWhereClause = buildWhereClause(baseConditions);

  const selectQuery = `
    SELECT
      ${ANALYSIS_RESULTS_SELECT_FIELDS}
    ${ANALYSIS_RESULTS_FROM_CLAUSE}
    ${whereClause}
    ${ANALYSIS_RESULTS_DEFAULT_ORDER}
    LIMIT :limit OFFSET :offset
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM image_analysis_analysisdata AS iaa
    ${whereClause}
  `;

  const usersQuery = `
    SELECT DISTINCT iaa.user_id AS userId
    FROM image_analysis_analysisdata AS iaa
    ${usersWhereClause}
    ORDER BY iaa.user_id ASC
  `;

  const analysisIdsQuery = `
    SELECT DISTINCT iaa.image_analysis_id AS analysisId
    FROM image_analysis_analysisdata AS iaa
    ${analysisIdOptionsWhere}
    ORDER BY iaa.image_analysis_id DESC
    LIMIT 200
  `;

  routeLogger.info("解析結果一覧の取得を開始しました", {
    page,
    pageSize,
    userId: userIdParam ?? null,
    analysisId: analysisIdParam ?? null,
    status: statusParam ?? null,
  });

  try {
    const [rows, [{ total } = { total: 0 }], userOptions, analysisOptions] =
      await Promise.all([
        selectRows<AnalysisRow>(selectQuery, queryParams),
        selectRows<CountRow>(countQuery, countParams),
        selectRows<OptionRow<"userId">>(usersQuery),
        selectRows<OptionRow<"analysisId">>(
          analysisIdsQuery,
          queryParams.userId !== undefined
            ? { userId: queryParams.userId }
            : undefined,
        ),
      ]);

    const serializedRows = rows.map((row) => ({
      ...row,
      userId: row.userId?.toString() ?? "",
      imageAnalysisId: row.imageAnalysisId?.toString() ?? null,
    }));

    const totalCount = total ?? 0;
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
    const hasMore = offset + serializedRows.length < totalCount;

    return NextResponse.json(
      {
        ok: true,
        rows: serializedRows,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasMore,
        },
        filters: {
          users: userOptions
            .map((option) => option.userId)
            .filter((value): value is string | number => value !== null)
            .map((value) => value.toString()),
          analysisIds: analysisOptions
            .map((option) => option.analysisId)
            .filter((value): value is string | number => value !== null)
            .map((value) => value.toString()),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    routeLogger.error("解析結果の取得に失敗しました", { error });
    return NextResponse.json(
      {
        ok: false,
        error: "解析結果を取得できませんでした。ログを確認してください。",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
