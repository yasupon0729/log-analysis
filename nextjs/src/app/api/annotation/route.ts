import { promises as fs } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ANNOTATION_COOKIE_NAME,
  generateAnnotationToken,
  TOKEN_MAX_AGE_SECONDS,
  verifyAnnotationToken,
} from "@/app/annotation/token";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ANNOTATION_COOKIE_NAME)?.value ?? null;
  const hasValidToken = token && verifyAnnotationToken(token);
  const issuedToken = hasValidToken ? null : generateAnnotationToken();

  try {
    const baseDir = path.join(process.cwd(), "input");
    const [annotationContent, csvContent] = await Promise.all([
      fs.readFile(path.join(baseDir, "annotation.json"), "utf8"),
      fs.readFile(path.join(baseDir, "data.csv"), "utf8"),
    ]);

    const annotation = JSON.parse(annotationContent) as {
      boundaries: Array<Record<string, unknown> & { id?: string | number }>;
    };

    const csvLines = csvContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (csvLines.length < 2) {
      throw new Error("data.csv に有効なデータ行がありません");
    }

    const sanitizeCell = (value: string) =>
      value
        .replace(/\ufeff/g, "")
        .replace(/^"|"$/g, "")
        .trim();

    const toMetricKey = (header: string, index: number, used: Set<string>) => {
      const normalized = header
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+([a-z0-9])/g, (_, char: string) => char.toUpperCase())
        .replace(/\s+/g, "");
      let candidate = normalized || `metric${index}`;
      let suffix = 1;
      while (used.has(candidate)) {
        suffix += 1;
        candidate = `${normalized || `metric${index}`}${suffix}`;
      }
      used.add(candidate);
      return candidate;
    };

    const headers = csvLines[0]
      .split(",")
      .map((header) => sanitizeCell(header));
    const idIndex = headers.findIndex((header) => {
      if (header === "#") {
        return true;
      }
      const lower = header.toLowerCase();
      return lower === "id";
    });
    if (idIndex === -1) {
      throw new Error("data.csv に必要な列 (# または id) が見つかりません");
    }

    const usedMetricKeys = new Set<string>();
    const metricColumns = headers
      .map((header, columnIndex) => ({ header, columnIndex }))
      .filter((column) => column.columnIndex !== idIndex)
      .map((column, visibleIndex) => ({
        header: column.header,
        columnIndex: column.columnIndex,
        key: toMetricKey(column.header, visibleIndex, usedMetricKeys),
      }));

    if (metricColumns.length === 0) {
      throw new Error("data.csv に利用可能なメトリクス列がありません");
    }

    const metricStats: Record<
      string,
      { label: string; min: number; max: number }
    > = {};
    const metricValuesPerId = new Map<string, Record<string, number>>();

    for (const line of csvLines.slice(1)) {
      const columns = line.split(",");
      const rawId = sanitizeCell(columns[idIndex] ?? "");
      if (!rawId) {
        continue;
      }
      const normalizedId = String(rawId);
      const metricRecord: Record<string, number> = {};
      for (const column of metricColumns) {
        const rawValue = sanitizeCell(columns[column.columnIndex] ?? "");
        if (!rawValue) {
          continue;
        }
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          continue;
        }
        metricRecord[column.key] = numericValue;
        const currentStat = metricStats[column.key];
        if (!currentStat) {
          metricStats[column.key] = {
            label: column.header,
            min: numericValue,
            max: numericValue,
          };
        } else {
          currentStat.min = Math.min(currentStat.min, numericValue);
          currentStat.max = Math.max(currentStat.max, numericValue);
        }
      }
      metricValuesPerId.set(normalizedId, metricRecord);
    }

    if (metricValuesPerId.size === 0) {
      throw new Error("data.csv のメトリクス値を取得できませんでした");
    }

    const augmentedBoundaries = annotation.boundaries.map((boundary, index) => {
      const boundaryId = boundary.id ?? index + 1;
      const idKey = String(boundaryId);
      const metrics = metricValuesPerId.get(idKey);
      if (!metrics) {
        throw new Error(`data.csv に id=${idKey} のメトリクスがありません`);
      }
      return {
        ...boundary,
        id: boundaryId,
        metrics,
      };
    });

    const response = NextResponse.json(
      {
        ok: true,
        annotation: {
          boundaries: augmentedBoundaries,
          metricStats: {
            ...metricStats,
          },
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
    if (issuedToken) {
      response.cookies.set({
        name: ANNOTATION_COOKIE_NAME,
        value: issuedToken,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: TOKEN_MAX_AGE_SECONDS,
      });
    }
    return response;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to load annotation.json", error);
    const response = NextResponse.json(
      { ok: false, error: "Failed to load annotation data" },
      { status: 500 },
    );
    if (issuedToken) {
      response.cookies.set({
        name: ANNOTATION_COOKIE_NAME,
        value: issuedToken,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: TOKEN_MAX_AGE_SECONDS,
      });
    }
    return response;
  }
}
