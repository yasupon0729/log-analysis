"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import TanstackTable from "@/components/tanstack-table/TanstackTable";
import type { CustomColumnMeta } from "@/components/tanstack-table/types";
import type { SshTarget } from "@/lib/ssh/client";
import { SyncButton } from "./SyncButton";

export interface SyncTableRow {
  name: string;
  status: {
    KNIT02: boolean;
    KNIT03: boolean;
    KNIT04: boolean;
  };
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
        size: 200,
      },
      {
        id: "all_actions",
        header: "一括操作",
        meta: {
          cellType: "actions",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) => {
          const row = info.row.original;
          // 全てのサーバーに存在するか確認
          const allExist = row.status.KNIT02 && row.status.KNIT03 && row.status.KNIT04;
          
          return (
            <SyncButton 
                modelName={row.name} 
                target={undefined} // 一括
                isExists={allExist} 
            />
          );
        },
        size: 100,
      },
      {
        id: "KNIT02",
        header: "KNIT02",
        meta: {
          cellType: "actions",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) => {
          const row = info.row.original;
          return <SyncButton modelName={row.name} target="KNIT02" isExists={row.status.KNIT02} />;
        },
        size: 100,
      },
      {
        id: "KNIT03",
        header: "KNIT03",
        meta: {
          cellType: "actions",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) => {
          const row = info.row.original;
          return <SyncButton modelName={row.name} target="KNIT03" isExists={row.status.KNIT03} />;
        },
        size: 100,
      },
      {
        id: "KNIT04",
        header: "KNIT04",
        meta: {
          cellType: "actions",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) => {
          const row = info.row.original;
          return <SyncButton modelName={row.name} target="KNIT04" isExists={row.status.KNIT04} />;
        },
        size: 100,
      },
    ],
    [],
  );

  return (
    <div style={{ 
      borderRadius: "8px", 
      border: "1px solid #e2e8f0", 
      overflow: "hidden" 
    }}>
      <TanstackTable
        data={data}
        columns={columns}
        enableRowSelection={false}
        pageSize={50}
      />
    </div>
  );
}
