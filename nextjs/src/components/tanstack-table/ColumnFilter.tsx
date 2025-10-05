import type { Column } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import {
  dataTableFilterInputRecipe,
  dataTableFilterSelectRecipe,
} from "@/styles/recipes/components/data-table.recipe";

import type { CustomColumnMeta, FilterOption } from "./types";

interface ColumnFilterProps<T> {
  column: Column<T, unknown>;
}

export default function ColumnFilter<T>({ column }: ColumnFilterProps<T>) {
  const meta = column.columnDef.meta as CustomColumnMeta | undefined;
  const variant = meta?.filterVariant ?? "text";

  if (variant === "select") {
    return <SelectFilter column={column} meta={meta} />;
  }

  return <TextFilter column={column} meta={meta} />;
}

function TextFilter<T>({
  column,
  meta,
}: {
  column: Column<T, unknown>;
  meta: CustomColumnMeta | undefined;
}) {
  const rawValue = column.getFilterValue();
  let initialValue: string;
  if (typeof rawValue === "string") {
    initialValue = rawValue;
  } else {
    initialValue = rawValue?.toString() ?? "";
  }

  const [value, setValue] = useState<string>(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextValue = value.trim();
      column.setFilterValue(nextValue === "" ? undefined : nextValue);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [column, value]);

  return (
    <input
      type="text"
      className={dataTableFilterInputRecipe()}
      placeholder={meta?.filterPlaceholder ?? `${column.id}で絞り込み`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

function SelectFilter<T>({
  column,
  meta,
}: {
  column: Column<T, unknown>;
  meta: CustomColumnMeta | undefined;
}) {
  const columnFilterValue = column.getFilterValue();
  const currentValue =
    typeof columnFilterValue === "string"
      ? columnFilterValue
      : (columnFilterValue?.toString() ?? "");

  const options = useMemo<FilterOption[]>(() => {
    if (meta?.filterOptions && meta.filterOptions.length > 0) {
      return meta.filterOptions;
    }

    const uniqueValues = column.getFacetedUniqueValues?.();
    if (!uniqueValues) {
      return [];
    }

    return Array.from(uniqueValues.keys())
      .filter((value) => value !== undefined && value !== null)
      .map((value) => {
        const stringValue = String(value);
        return { label: stringValue, value: stringValue };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "ja"));
  }, [column, meta?.filterOptions]);

  return (
    <select
      className={dataTableFilterSelectRecipe()}
      value={currentValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        column.setFilterValue(nextValue === "" ? undefined : nextValue);
      }}
    >
      <option value="">すべて</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
