"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import TanstackTable from "@/components/tanstack-table/TanstackTable";
import type { CustomColumnMeta } from "@/components/tanstack-table/types";
import { css } from "@/styled-system/css";

type LogRow = Record<string, unknown>;

interface LogEntriesTableProps {
  logText: string;
}

interface ParseResult {
  rows: LogRow[];
  failed: number;
  total: number;
}

const infoTextClass = css({
  marginTop: 2,
  fontSize: "xs",
  color: "text.secondary",
});

const emptyContainerClass = css({
  borderRadius: "lg",
  border: "thin",
  borderColor: "border.default",
  backgroundColor: "dark.surface",
  paddingY: 10,
  textAlign: "center",
  color: "text.secondary",
});

const tableWrapperClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 2,
});

export function LogEntriesTable({ logText }: LogEntriesTableProps) {
  const parsed = useMemo(() => parseLogText(logText), [logText]);

  const columns = useMemo<ColumnDef<LogRow, unknown>[]>(() => {
    const keys = new Set<string>();
    for (const row of parsed.rows) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }

    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b, "ja"))
      .map((key) => {
        const meta: CustomColumnMeta = {
          cellType: "text",
          filterVariant: "text",
          enableGlobalFilter: true,
        };

        return {
          accessorKey: key,
          header: key,
          enableColumnFilter: true,
          enableGlobalFilter: true,
          meta,
          cell: (context) => formatCellValue(context.getValue()),
        } satisfies ColumnDef<LogRow, unknown>;
      });
  }, [parsed.rows]);

  if (parsed.rows.length === 0) {
    return (
      <div className={emptyContainerClass}>
        表示できるJSONエントリがありません
        {parsed.failed > 0 ? (
          <p className={infoTextClass}>
            {parsed.failed}件の行はJSONとして解析できませんでした。
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={tableWrapperClass}>
      <TanstackTable
        data={parsed.rows}
        columns={columns}
        enableRowSelection={false}
        pageSize={25}
      />
      {parsed.failed > 0 ? (
        <p className={infoTextClass}>
          {parsed.failed}件の行はJSONとして解析できませんでした。
        </p>
      ) : null}
    </div>
  );
}

function parseLogText(logText: string): ParseResult {
  const lines = logText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let failed = 0;
  const rows: LogRow[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as LogRow;
        if (Object.keys(record).length === 0) {
          rows.push({ value: record });
          continue;
        }

        rows.push(record);
        continue;
      }

      rows.push({ value: parsed });
    } catch (_error) {
      failed += 1;
    }
  }

  return { rows, failed, total: lines.length };
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return JSON.stringify(value);
}
