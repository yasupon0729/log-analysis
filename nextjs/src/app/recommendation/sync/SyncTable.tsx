"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import TanstackTable from "@/components/tanstack-table/TanstackTable";
import type { CustomColumnMeta } from "@/components/tanstack-table/types";
import { SyncButton } from "./SyncButton";

export interface SyncTableRow {
  name: string;
  exists: boolean;
}

interface SyncTableProps {
  data: SyncTableRow[];
}

export function SyncTable({ data }: SyncTableProps) {
  const columns = useMemo<ColumnDef<SyncTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "モデル名",
        meta: {
          cellType: "text",
          filterVariant: "text",
          enableGlobalFilter: true,
        } as CustomColumnMeta,
      },
      {
        accessorKey: "exists",
        header: "状態",
        meta: {
          cellType: "status",
          filterVariant: "select",
          selectOptions: [
            { label: "あり", value: "true" },
            { label: "なし", value: "false" },
          ],
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) => {
          const exists = info.getValue() as boolean;
          return exists ? "あり" : "なし";
        },
        filterFn: (row, columnId, filterValue) => {
          // select filter returns string "true"/"false", row value is boolean
          const rowValue = String(row.getValue(columnId));
          return rowValue === filterValue;
        },
      },
      {
        id: "actions",
        header: "アクション",
        meta: {
          cellType: "actions",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) => {
          const row = info.row.original;
          if (row.exists) {
            return null;
          }
          return <SyncButton modelName={row.name} />;
        },
      },
    ],
    [],
  );

  return (
    <div style={{ 
      borderRadius: "8px", 
      border: "1px solid #e2e8f0", // border.default
      overflow: "hidden" 
    }}>
      <TanstackTable
        data={data}
        columns={columns}
        enableRowSelection={false}
      />
    </div>
  );
}
