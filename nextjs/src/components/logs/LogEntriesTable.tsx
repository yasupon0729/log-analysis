"use client";

import type { ColumnDef, FilterFn, SortingFn } from "@tanstack/react-table";
import { useMemo } from "react";

import TanstackTable from "@/components/tanstack-table/TanstackTable";
import type {
  CustomColumnMeta,
  DateRangeFilterValue,
} from "@/components/tanstack-table/types";
import { css } from "@/styled-system/css";

type LogRow = Record<string, unknown>;

const TIME_FIELD = "time";

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

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Tokyo",
});

const timeSortingFn: SortingFn<LogRow> = (rowA, rowB, columnId) => {
  const valueA = parseIsoTimestamp(rowA.getValue(columnId));
  const valueB = parseIsoTimestamp(rowB.getValue(columnId));

  if (valueA === null && valueB === null) {
    return 0;
  }
  if (valueA === null) {
    return 1;
  }
  if (valueB === null) {
    return -1;
  }

  return valueA - valueB;
};

const timeFilterFn: FilterFn<LogRow> = (row, columnId, filterValue) => {
  if (!filterValue || typeof filterValue !== "object") {
    return true;
  }

  const { start, end } = filterValue as DateRangeFilterValue;
  const timestamp = parseIsoTimestamp(row.getValue(columnId));

  if (timestamp === null) {
    return false;
  }

  if (start) {
    const startTime = parseIsoTimestamp(start);
    if (startTime !== null && timestamp < startTime) {
      return false;
    }
  }

  if (end) {
    const endTime = parseIsoTimestamp(end);
    if (endTime !== null && timestamp > endTime) {
      return false;
    }
  }

  return true;
};

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
        if (key === TIME_FIELD) {
          const meta: CustomColumnMeta = {
            cellType: "date",
            filterVariant: "dateRange",
            filterPlaceholder: "開始 ISO8601",
            enableGlobalFilter: false,
          };

          return {
            accessorKey: key,
            header: key,
            enableColumnFilter: true,
            enableGlobalFilter: false,
            sortingFn: timeSortingFn,
            filterFn: timeFilterFn,
            meta,
            cell: (context) => formatTimeValue(context.getValue()),
          } satisfies ColumnDef<LogRow, unknown>;
        }

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

function formatTimeValue(value: unknown): string {
  if (typeof value !== "string") {
    return formatCellValue(value);
  }

  const timestamp = parseIsoTimestamp(value);
  if (timestamp === null) {
    return value;
  }

  const date = new Date(timestamp);
  return `${dateFormatter.format(date)} (${value})`;
}

function parseIsoTimestamp(value: unknown): number | null {
  return parseFlexibleDate(value);
}

function parseFlexibleDate(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct)) {
    return direct;
  }

  const match = trimmed.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?)?)?$/,
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0", fraction] =
    match;

  let milliseconds = 0;
  if (fraction) {
    const fractionPadded = `${fraction}000`.slice(0, 3);
    milliseconds = Number(fractionPadded);
  }

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );

  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}
