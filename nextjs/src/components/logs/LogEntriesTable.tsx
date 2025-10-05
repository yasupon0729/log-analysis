"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";

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

const tableContainerClass = css({
  overflowX: "auto",
  borderRadius: "md",
  border: "thin",
  borderColor: "border.default",
  backgroundColor: "neutral.900",
});

const tableClass = css({
  width: "100%",
  minWidth: "640px",
  borderCollapse: "collapse",
  fontSize: "sm",
  color: "neutral.100",
});

const headerCellClass = css({
  textAlign: "left",
  padding: 3,
  fontSize: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "widest",
  borderBottom: "thin",
  borderColor: "border.subtle",
  backgroundColor: "neutral.800",
});

const bodyRowClass = css({
  transition: "background 0.2s",
  _hover: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
});

const bodyCellClass = css({
  padding: 3,
  verticalAlign: "top",
  borderBottom: "thin",
  borderColor: "border.subtle",
  whiteSpace: "normal",
  wordBreak: "break-word",
});

const noDataClass = css({
  padding: 4,
  textAlign: "center",
  color: "text.secondary",
});

const infoTextClass = css({
  marginTop: 2,
  fontSize: "xs",
  color: "text.secondary",
});

export function LogEntriesTable({ logText }: LogEntriesTableProps) {
  const parsed = useMemo(() => parseLogText(logText), [logText]);

  const columnKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of parsed.rows) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }
    return Array.from(keys).sort();
  }, [parsed.rows]);

  const columns = useMemo<ColumnDef<LogRow>[]>(() => {
    return columnKeys.map((key) => ({
      accessorKey: key,
      header: key,
      cell: (info) => formatCellValue(info.getValue()),
    }));
  }, [columnKeys]);

  const table = useReactTable({
    data: parsed.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (parsed.rows.length === 0) {
    return (
      <div className={tableContainerClass}>
        <div className={noDataClass}>表示できるJSONエントリがありません</div>
        {parsed.failed > 0 ? (
          <p className={infoTextClass}>
            {parsed.failed}件の行はJSONとして解析できませんでした。
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className={tableContainerClass}>
        <table className={tableClass}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className={headerCellClass}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={bodyRowClass}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={bodyCellClass}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
