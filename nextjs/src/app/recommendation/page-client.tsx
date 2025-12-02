"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import TanstackTable from "@/components/tanstack-table/TanstackTable";
import type { CustomColumnMeta } from "@/components/tanstack-table/types";
import type { AiModel } from "@/lib/recommendation/types";
import { css } from "@/styled-system/css";

interface RecommendationPageClientProps {
  aiModels: AiModel[];
}

const pageClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const titleClass = css({
  fontSize: "2xl",
  fontWeight: "bold",
  color: "text.primary",
});

const messageClass = css({
  fontSize: "sm",
  color: "text.muted",
});

const cardClass = css({
  padding: 6,
  backgroundColor: "bg.surface",
  borderRadius: "lg",
  border: "1px solid",
  borderColor: "border.default",
  boxShadow: "sm",
});

export default function RecommendationPageClient({
  aiModels,
}: RecommendationPageClientProps) {
  const columns = useMemo<ColumnDef<AiModel, unknown>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        meta: {
          cellType: "number",
          filterVariant: "text",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
      },
      {
        accessorKey: "aiModelName",
        header: "AIモデル名",
        meta: {
          cellType: "text",
          filterVariant: "text",
          enableGlobalFilter: true,
        } as CustomColumnMeta,
      },
      {
        accessorKey: "customerName",
        header: "顧客名",
        meta: {
          cellType: "text",
          filterVariant: "text",
          enableGlobalFilter: true,
        } as CustomColumnMeta,
      },
      {
        accessorKey: "aiModelCode",
        header: "モデルコード",
        meta: {
          cellType: "text",
          filterVariant: "text",
          enableGlobalFilter: true,
        } as CustomColumnMeta,
      },
      {
        accessorKey: "price",
        header: "価格",
        meta: {
          cellType: "number",
          filterVariant: "text",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) =>
          info.getValue<number>().toLocaleString("ja-JP", {
            style: "currency",
            currency: "JPY",
          }),
      },
      {
        accessorKey: "isActive",
        header: "有効",
        meta: {
          cellType: "text",
          filterVariant: "select",
          selectOptions: [
            { value: "true", label: "有効" },
            { value: "false", label: "無効" },
          ],
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) => (info.getValue() ? "有効" : "無効"),
      },
      {
        accessorKey: "predictMode",
        header: "予測モード",
        meta: {
          cellType: "text",
          filterVariant: "text",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
      },
      {
        accessorKey: "publishDate",
        header: "公開日",
        meta: {
          cellType: "date",
          filterVariant: "dateRange",
          enableGlobalFilter: false,
        } as CustomColumnMeta,
        cell: (info) => {
          const val = info.getValue<Date | string | null>();
          if (!val) return "-";
          return new Date(val).toLocaleDateString("ja-JP");
        },
      },
    ],
    [],
  );

  return (
    <div className={pageClass}>
      <header>
        <h1 className={titleClass}>推薦システム</h1>
        <p className={messageClass}>
          AIモデルデータベースの情報を表示しています。(MySQL)
        </p>
      </header>

      <div className={cardClass}>
        <TanstackTable
          data={aiModels}
          columns={columns}
          enableRowSelection={true}
        />
      </div>
    </div>
  );
}
