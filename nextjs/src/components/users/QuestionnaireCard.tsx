"use client";

import { useEffect, useMemo, useState } from "react";

import type { QuestionnaireRecord } from "@/lib/questionnaire/types";
import { css } from "@/styled-system/css";

interface QuestionnaireCardProps {
  questionnaires: QuestionnaireRecord[];
}

const cardClass = css({
  backgroundColor: "rgba(21, 30, 45, 0.5)",
  border: "thin",
  borderColor: "border.default",
  borderRadius: "lg",
  padding: 4,
  display: "flex",
  flexDirection: "column",
  gap: 3,
});

const titleClass = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "text.secondary",
});

const metaClass = css({
  fontSize: "xs",
  color: "text.muted",
});

const listClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 2,
});

const listItemClass = css({
  fontSize: "sm",
  lineHeight: "short",
  color: "text.primary",
  display: "flex",
  flexDirection: "column",
  gap: 1,
});

const emptyClass = css({
  fontSize: "sm",
  color: "text.muted",
});

const selectClass = css({
  alignSelf: "flex-start",
  backgroundColor: "rgba(15, 23, 42, 0.6)",
  border: "thin",
  borderColor: "border.default",
  borderRadius: "md",
  color: "text.primary",
  paddingX: 3,
  paddingY: 2,
  fontSize: "sm",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "primary.500",
  },
});

export function QuestionnaireCard({ questionnaires }: QuestionnaireCardProps) {
  const preferredVariant = useMemo(() => {
    return (
      questionnaires.find((entry) => entry.hasResponses) ??
      questionnaires[0] ??
      null
    );
  }, [questionnaires]);

  const [activeId, setActiveId] = useState<string | null>(
    preferredVariant?.variantId ?? null,
  );

  useEffect(() => {
    setActiveId((prev) => {
      if (!questionnaires.length) {
        return null;
      }
      if (prev && questionnaires.some((entry) => entry.variantId === prev)) {
        return prev;
      }
      const nextPreferred =
        questionnaires.find((entry) => entry.hasResponses)?.variantId ??
        questionnaires[0]?.variantId ??
        null;
      return nextPreferred;
    });
  }, [questionnaires]);

  const active = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return questionnaires.find((entry) => entry.variantId === activeId) ?? null;
  }, [activeId, questionnaires]);

  if (!active) {
    return (
      <div className={cardClass}>
        <span className={titleClass}>アンケート</span>
        <p className={emptyClass}>回答データが見つかりませんでした。</p>
      </div>
    );
  }

  const entries = Object.entries(active.answers ?? {});

  return (
    <div className={cardClass}>
      <span className={titleClass}>アンケート</span>
      <select
        className={selectClass}
        value={active.variantId}
        onChange={(event) => setActiveId(event.target.value)}
      >
        {questionnaires.map((entry) => (
          <option key={entry.variantId} value={entry.variantId}>
            {entry.variantLabel}
            {!entry.hasResponses ? " (未回答)" : ""}
          </option>
        ))}
      </select>
      {active.submittedAt ? (
        <span className={metaClass}>
          回答日時: {formatTimestamp(active.submittedAt)}
        </span>
      ) : null}
      {entries.length ? (
        <ul className={listClass}>
          {entries.map(([key, value]) => (
            <li key={key} className={listItemClass}>
              <strong>{key}</strong>
              <span>{renderValue(value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={emptyClass}>回答内容が空です。</p>
      )}
    </div>
  );
}

function renderValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "(不明)";
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
