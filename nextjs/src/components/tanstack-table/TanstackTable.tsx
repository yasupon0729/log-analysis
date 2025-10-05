"use client";

import {
  type ColumnFiltersState,
  type FilterFn,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useState } from "react";

import { css } from "@/styled-system/css";
import {
  dataTableContainerRecipe,
  dataTableEmptyStateRecipe,
  dataTableRecipe,
  dataTableWrapperRecipe,
} from "@/styles/recipes/components/data-table.recipe";

import BulkActionsToolbar from "./BulkActionsToolbar";
import ColumnVisibilityToggle from "./ColumnVisibilityToggle";
import GlobalFilter from "./GlobalFilter";
import Pagination from "./Pagination";
import TanstackTableBody from "./TanstackTableBody";
import TanstackTableHeader from "./TanstackTableHeader";
import type { DateRangeFilterValue, TableProps } from "./types";

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

const dateRangeFilter: FilterFn<unknown> = (row, columnId, filterValue) => {
  if (!filterValue || typeof filterValue !== "object") {
    return true;
  }

  const { start, end } = filterValue as DateRangeFilterValue;
  const rawValue = row.getValue(columnId);
  const timestamp = parseIsoTimestamp(rawValue);

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

interface TanstackTableComponentProps<T> extends TableProps<T> {
  onBulkDelete?: (rowIds: string[]) => void;
  globalFilterPlaceholder?: string;
  pageSize?: number;
  showDebugState?: boolean;
}

const debugStateClass = css({
  marginTop: 4,
  fontSize: "xs",
  color: "text.secondary",
  backgroundColor: "dark.surfaceActive",
  borderRadius: "md",
  border: "thin",
  borderColor: "border.subtle",
  padding: 3,
  whiteSpace: "pre-wrap",
  overflowY: "auto",
  maxHeight: "16rem",
});

export default function TanstackTable<T>({
  data,
  columns,
  isLoading = false,
  error = null,
  onBulkDelete,
  globalFilterPlaceholder = "全列を検索",
  pageSize = 500,
  enableRowSelection = Boolean(onBulkDelete),
  getRowId,
  showDebugState = false,
}: TanstackTableComponentProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      rowSelection,
      columnVisibility,
    },
    enableRowSelection,
    enableHiding: true,
    filterFns: {
      dateRange: dateRangeFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onRowSelectionChange: enableRowSelection ? setRowSelection : undefined,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId:
      getRowId ??
      ((originalRow, index) => {
        if (
          typeof (originalRow as { id?: string }).id === "string" &&
          (originalRow as { id: string }).id.trim().length > 0
        ) {
          return (originalRow as { id: string }).id;
        }
        return `${index}`;
      }),
    debugTable: process.env.NODE_ENV === "development",
    debugHeaders: false,
    debugColumns: false,
  });

  const selectedRowModel = table.getSelectedRowModel();
  const selectedIds = selectedRowModel.rows.map((row) => row.id);
  const selectedCount = selectedIds.length;

  const filteredRowsCount = table.getFilteredRowModel().rows.length;
  const totalRowsCount = table.getPreFilteredRowModel().rows.length;
  const enableGlobalFilter = table
    .getAllLeafColumns()
    .some((column) => column.getCanGlobalFilter());

  const handleBulkDelete = () => {
    if (selectedCount === 0 || !onBulkDelete) {
      return;
    }
    onBulkDelete(selectedIds);
    table.resetRowSelection();
  };

  const handleClearSelection = () => {
    table.resetRowSelection();
  };

  if (isLoading) {
    return (
      <div className={dataTableContainerRecipe()}>
        <div className={dataTableEmptyStateRecipe()}>読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={dataTableContainerRecipe()}>
        <div className={dataTableEmptyStateRecipe()}>
          エラーが発生しました: {error}
        </div>
      </div>
    );
  }

  return (
    <div className={dataTableContainerRecipe()}>
      {enableGlobalFilter ? (
        <GlobalFilter
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder={globalFilterPlaceholder}
          resultsCount={filteredRowsCount}
          totalCount={totalRowsCount}
        />
      ) : null}

      <ColumnVisibilityToggle table={table} />

      {enableRowSelection && selectedCount > 0 ? (
        <BulkActionsToolbar
          selectedCount={selectedCount}
          onDeleteSelected={handleBulkDelete}
          onClearSelection={handleClearSelection}
        />
      ) : null}

      {data.length === 0 ? (
        <div className={dataTableEmptyStateRecipe()}>
          表示できるデータがありません
        </div>
      ) : (
        <>
          <div className={dataTableWrapperRecipe()}>
            <table className={dataTableRecipe()}>
              <TanstackTableHeader table={table} />
              <TanstackTableBody table={table} />
            </table>
          </div>

          <Pagination table={table} />

          {filteredRowsCount === 0 ? (
            <div className={dataTableEmptyStateRecipe()}>
              条件に一致する行が見つかりませんでした
            </div>
          ) : null}
        </>
      )}

      {showDebugState ? (
        <pre className={debugStateClass}>
          {JSON.stringify(
            {
              sorting,
              columnFilters,
              globalFilter,
              pagination,
              rowSelection,
              columnVisibility,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </div>
  );
}
