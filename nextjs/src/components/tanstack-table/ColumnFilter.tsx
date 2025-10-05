import type { Column } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import { css } from "@/styled-system/css";
import {
  dataTableFilterDateRangeContainerRecipe,
  dataTableFilterInputRecipe,
  dataTableFilterSelectRecipe,
} from "@/styles/recipes/components/data-table.recipe";

import type {
  CustomColumnMeta,
  DateRangeFilterValue,
  FilterOption,
} from "./types";

interface ColumnFilterProps<T> {
  column: Column<T, unknown>;
}

export default function ColumnFilter<T>({ column }: ColumnFilterProps<T>) {
  const meta = column.columnDef.meta as CustomColumnMeta | undefined;
  const variant = meta?.filterVariant ?? "text";

  if (variant === "select") {
    return <SelectFilter column={column} meta={meta} />;
  }

  if (variant === "dateRange") {
    return <DateRangeFilter column={column} meta={meta} />;
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

function DateRangeFilter<T>({
  column,
  meta,
}: {
  column: Column<T, unknown>;
  meta: CustomColumnMeta | undefined;
}) {
  const currentValue =
    (column.getFilterValue() as DateRangeFilterValue | undefined) ?? {};

  const [startText, setStartText] = useState<string>(
    formatDateForText(currentValue.start),
  );
  const [endText, setEndText] = useState<string>(
    formatDateForText(currentValue.end),
  );

  useEffect(() => {
    setStartText(formatDateForText(currentValue.start));
  }, [currentValue.start]);

  useEffect(() => {
    setEndText(formatDateForText(currentValue.end));
  }, [currentValue.end]);

  const updateValue = (part: "start" | "end", next: string | undefined) => {
    const nextValue: DateRangeFilterValue = {
      ...currentValue,
      [part]: next,
    };

    if (!nextValue.start && !nextValue.end) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue(nextValue);
    }
  };

  const handleTextBlur = (
    part: "start" | "end",
    value: string,
    setText: (text: string) => void,
  ) => {
    const trimmed = value.trim();
    if (trimmed === "") {
      updateValue(part, undefined);
      setText("");
      return;
    }

    const normalised = normaliseDateInput(trimmed);
    if (normalised) {
      updateValue(part, normalised);
      setText(formatDateForText(normalised));
    }
  };

  const handleDateTimeChange = (
    part: "start" | "end",
    rawValue: string,
    setText: (text: string) => void,
  ) => {
    if (!rawValue) {
      updateValue(part, undefined);
      setText("");
      return;
    }

    const normalised = fromDatetimeLocalValue(rawValue);
    if (normalised) {
      updateValue(part, normalised);
      setText(formatDateForText(normalised));
    }
  };

  return (
    <div className={dataTableFilterDateRangeContainerRecipe()}>
      <div className={dateRangeSectionClass}>
        <span className={dateRangeLabelClass}>開始</span>
        <div className={dateRangeInputsClass}>
          <input
            type="datetime-local"
            className={dataTableFilterInputRecipe()}
            value={toDatetimeLocalValue(currentValue.start)}
            onChange={(event) =>
              handleDateTimeChange("start", event.target.value, setStartText)
            }
          />
          <input
            type="text"
            className={dataTableFilterInputRecipe()}
            placeholder={meta?.filterPlaceholder ?? "例: 2025/10/10 13:00"}
            value={startText}
            onChange={(event) => setStartText(event.target.value)}
            onBlur={(event) =>
              handleTextBlur("start", event.target.value, setStartText)
            }
          />
        </div>
      </div>
      <div className={dateRangeSectionClass}>
        <span className={dateRangeLabelClass}>終了</span>
        <div className={dateRangeInputsClass}>
          <input
            type="datetime-local"
            className={dataTableFilterInputRecipe()}
            value={toDatetimeLocalValue(currentValue.end)}
            onChange={(event) =>
              handleDateTimeChange("end", event.target.value, setEndText)
            }
          />
          <input
            type="text"
            className={dataTableFilterInputRecipe()}
            placeholder="例: 2025/10/10 14:30"
            value={endText}
            onChange={(event) => setEndText(event.target.value)}
            onBlur={(event) =>
              handleTextBlur("end", event.target.value, setEndText)
            }
          />
        </div>
      </div>
    </div>
  );
}

const dateRangeSectionClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 1,
});

const dateRangeLabelClass = css({
  fontSize: "xs",
  color: "text.secondary",
});

const dateRangeInputsClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 1,
});

function normaliseDateInput(input: string): string | undefined {
  const timestamp = parseFlexibleDate(input);
  if (timestamp === null) {
    return undefined;
  }
  return new Date(timestamp).toISOString();
}

function formatDateForText(value?: string): string {
  if (!value) {
    return "";
  }
  const timestamp = parseFlexibleDate(value);
  if (timestamp === null) {
    return value;
  }
  const date = new Date(timestamp);
  return `${pad(date.getFullYear(), 4)}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toDatetimeLocalValue(value?: string): string {
  if (!value) {
    return "";
  }
  const timestamp = parseFlexibleDate(value);
  if (timestamp === null) {
    return "";
  }
  const date = new Date(timestamp);
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
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

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, "0");
}
