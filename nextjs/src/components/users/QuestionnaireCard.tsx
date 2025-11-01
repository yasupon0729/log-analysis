"use client";

import type { QuestionnaireRecord } from "@/lib/questionnaire/types";
import { css } from "@/styled-system/css";

interface QuestionnaireCardProps {
  questionnaire: QuestionnaireRecord | null | undefined;
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

export function QuestionnaireCard({ questionnaire }: QuestionnaireCardProps) {
  if (!questionnaire) {
    return (
      <div className={cardClass}>
        <span className={titleClass}>アンケート</span>
        <p className={emptyClass}>回答データが見つかりませんでした。</p>
      </div>
    );
  }

  const entries = Object.entries(questionnaire.answers ?? {});

  return (
    <div className={cardClass}>
      <span className={titleClass}>アンケート</span>
      {questionnaire.submittedAt ? (
        <span className={metaClass}>
          回答日時: {formatTimestamp(questionnaire.submittedAt)}
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
