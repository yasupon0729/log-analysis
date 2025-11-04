"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { css } from "@/styled-system/css";

export type S3LogEnvironment = "staging" | "production";

interface S3LogFetcherProps {
  isLoading: boolean;
  onFetch: (params: {
    startDate: string;
    endDate: string;
    environment: S3LogEnvironment;
  }) => Promise<void>;
}

export function S3LogFetcher({ isLoading, onFetch }: S3LogFetcherProps) {
  const today = useMemo(() => new Date(), []);
  const defaultDate = useMemo(() => formatDate(today), [today]);

  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [environment, setEnvironment] = useState<S3LogEnvironment>("staging");

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!startDate || !endDate) {
        return;
      }
      await onFetch({ startDate, endDate, environment });
    },
    [startDate, endDate, environment, onFetch],
  );

  const handleStartDateChange = useCallback(
    (value: string) => {
      if (!value) {
        return;
      }
      setStartDate(value);
      if (endDate < value) {
        setEndDate(value);
      }
    },
    [endDate],
  );

  const handleEndDateChange = useCallback(
    (value: string) => {
      if (!value) {
        return;
      }
      if (value < startDate) {
        setEndDate(startDate);
        return;
      }
      setEndDate(value);
    },
    [startDate],
  );

  return (
    <section className={fetchSectionClass}>
      <h2 className={sectionTitleClass}>S3から取得</h2>
      <form className={fetchFormClass} onSubmit={handleSubmit}>
        <label className={labelClass}>
          開始日
          <input
            type="date"
            className={dateInputClass}
            value={startDate}
            max={endDate || defaultDate}
            onChange={(event) => handleStartDateChange(event.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          終了日
          <input
            type="date"
            className={dateInputClass}
            value={endDate}
            max={defaultDate}
            min={startDate}
            onChange={(event) => handleEndDateChange(event.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          取得対象
          <select
            className={selectClass}
            value={environment}
            onChange={(event) =>
              setEnvironment(event.target.value as S3LogEnvironment)
            }
          >
            <option value="production">本番</option>
            <option value="staging">ステージング</option>
          </select>
        </label>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "取得中..." : "この日付のログを取得"}
        </Button>
      </form>
    </section>
  );
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const fetchSectionClass = css({
  marginTop: 8,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  border: "thin",
  borderColor: "border.default",
  borderRadius: "lg",
  padding: 6,
  backgroundColor: "dark.surface",
});

const sectionTitleClass = css({
  fontSize: "lg",
  fontWeight: "semibold",
});

const fetchFormClass = css({
  display: "flex",
  flexDirection: { base: "column", md: "row" },
  alignItems: { base: "stretch", md: "flex-end" },
  gap: 4,
});

const labelClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  fontSize: "sm",
  color: "text.secondary",
});

const dateInputClass = css({
  paddingX: 3,
  paddingY: 2,
  borderRadius: "md",
  border: "thin",
  borderColor: "border.default",
  backgroundColor: "dark.surfaceActive",
  color: "text.primary",
  fontSize: "sm",
  _focus: {
    outline: "none",
    borderColor: "primary.500",
    boxShadow: "0 0 0 2px rgba(33, 134, 235, 0.35)",
  },
});

const selectClass = css({
  paddingX: 3,
  paddingY: 2,
  borderRadius: "md",
  border: "thin",
  borderColor: "border.default",
  backgroundColor: "dark.surfaceActive",
  color: "text.primary",
  fontSize: "sm",
  _focus: {
    outline: "none",
    borderColor: "primary.500",
    boxShadow: "0 0 0 2px rgba(33, 134, 235, 0.35)",
  },
});
