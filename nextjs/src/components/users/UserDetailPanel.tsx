"use client";

import { useMemo } from "react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import type { UserInsightsDTO, UserOverviewDTO } from "@/lib/users/types";
import { css } from "@/styled-system/css";

import { QuestionnaireCard } from "./QuestionnaireCard";
import { UserTrendChart } from "./UserTrendChart";

interface UserDetailPanelProps {
  selectedUser?: UserOverviewDTO | null;
  insights?: UserInsightsDTO | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry(): void;
}

const containerClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const headingClass = css({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: 3,
  alignItems: "baseline",
});

const titleClass = css({
  fontSize: "xl",
  fontWeight: "semibold",
  color: "text.primary",
});

const companyClass = css({
  fontSize: "sm",
  color: "text.secondary",
});

const statsGridClass = css({
  display: "grid",
  gridTemplateColumns: {
    base: "repeat(1, minmax(0, 1fr))",
    md: "repeat(2, minmax(0, 1fr))",
    xl: "repeat(4, minmax(0, 1fr))",
  },
  gap: 4,
});

const statCardClass = css({
  backgroundColor: "rgba(21, 30, 45, 0.6)",
  border: "thin",
  borderColor: "border.default",
  borderRadius: "lg",
  padding: 4,
  display: "flex",
  flexDirection: "column",
  gap: 2,
});

const statLabelClass = css({
  fontSize: "xs",
  color: "text.muted",
});

const statValueClass = css({
  fontSize: "lg",
  fontWeight: "semibold",
  color: "text.primary",
});

const sectionClass = css({
  display: "grid",
  gridTemplateColumns: {
    base: "repeat(1, minmax(0, 1fr))",
    xl: "minmax(0, 2fr) minmax(0, 1fr)",
  },
  gap: 4,
});

const analysesCardClass = css({
  backgroundColor: "rgba(15, 23, 42, 0.6)",
  border: "thin",
  borderColor: "border.default",
  borderRadius: "lg",
  padding: 4,
  display: "flex",
  flexDirection: "column",
  gap: 3,
});

const analysesTitleClass = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "text.secondary",
});

const analysesListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  maxHeight: "260px",
  overflowY: "auto",
});

const analysesItemClass = css({
  border: "thin",
  borderColor: "border.subtle",
  borderRadius: "md",
  padding: 3,
  display: "flex",
  flexDirection: "column",
  gap: 1,
});

const analysisMetaClass = css({
  fontSize: "xs",
  color: "text.muted",
  display: "flex",
  gap: 2,
  flexWrap: "wrap",
});

const modelUsageListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 2,
});

const modelUsageItemClass = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "sm",
  color: "text.primary",
});

const modelListClass = css({
  display: "flex",
  flexWrap: "wrap",
  gap: 2,
});

const modelBadgeClass = css({
  display: "inline-flex",
  alignItems: "center",
  gap: 1,
  paddingX: 2,
  paddingY: 1,
  borderRadius: "full",
  backgroundColor: "rgba(56, 189, 248, 0.2)",
  color: "blue.100",
  fontSize: "xs",
});

const emptyMessageClass = css({
  fontSize: "sm",
  color: "text.muted",
});

export function UserDetailPanel({
  selectedUser,
  insights,
  isLoading,
  error,
  onRetry,
}: UserDetailPanelProps) {
  const displayCompany =
    insights?.user.companyName ?? selectedUser?.companyName ?? null;
  const topModels = useMemo(
    () => (insights?.modelUsage ?? []).slice(0, 5),
    [insights?.modelUsage],
  );

  const latestAnalysis = insights?.analyses?.[0] ?? null;
  const registeredAt =
    insights?.user.registeredAt ?? selectedUser?.registeredAt ?? null;

  if (!selectedUser) {
    return <p className={emptyMessageClass}>ユーザーを選択してください。</p>;
  }

  if (error) {
    return (
      <div className={containerClass}>
        <AlertBanner
          variant="error"
          title="ユーザー詳細の取得に失敗しました"
          description={error}
        />
        <Button variant="ghost" size="sm" onClick={onRetry}>
          再試行
        </Button>
      </div>
    );
  }

  if (isLoading || !insights) {
    return <p className={emptyMessageClass}>詳細情報を読み込み中です...</p>;
  }

  return (
    <div className={containerClass}>
      <div className={headingClass}>
        <div>
          <h2 className={titleClass}>ユーザー {insights.user.userId}</h2>
          {displayCompany ? (
            <p className={companyClass}>{displayCompany}</p>
          ) : null}
        </div>
        <div className={modelListClass}>
          {topModels.length ? (
            topModels.map((model) => (
              <span key={model.model} className={modelBadgeClass}>
                {model.model}
                <span>({model.count.toLocaleString("ja-JP")}枚)</span>
              </span>
            ))
          ) : (
            <span className={emptyMessageClass}>モデル情報なし</span>
          )}
        </div>
      </div>

      <div className={statsGridClass}>
        <div className={statCardClass}>
          <span className={statLabelClass}>総解析数</span>
          <span className={statValueClass}>{insights.user.totalAnalyses}</span>
        </div>
        <div className={statCardClass}>
          <span className={statLabelClass}>直近の解析日時</span>
          <span className={statValueClass}>
            {latestAnalysis?.lastModified
              ? new Date(latestAnalysis.lastModified).toLocaleString("ja-JP")
              : "-"}
          </span>
        </div>
        <div className={statCardClass}>
          <span className={statLabelClass}>アンケート</span>
          <span className={statValueClass}>
            {insights.questionnaire?.submittedAt
              ? `回答済 (${formatTimestamp(insights.questionnaire.submittedAt)})`
              : "未回答"}
          </span>
        </div>
        <div className={statCardClass}>
          <span className={statLabelClass}>登録日時</span>
          <span className={statValueClass}>
            {registeredAt ? formatTimestamp(registeredAt) : "-"}
          </span>
        </div>
      </div>

      <section className={sectionClass}>
        <div className={analysesCardClass}>
          <span className={analysesTitleClass}>最新の解析</span>
          {insights.analyses.length ? (
            <div className={analysesListClass}>
              {insights.analyses.slice(0, 20).map((analysis) => (
                <div key={analysis.analysisId} className={analysesItemClass}>
                  <strong>
                    {analysis.analysisType} / {analysis.analysisId}
                  </strong>
                  <div className={analysisMetaClass}>
                    <span>ファイル数: {analysis.fileCount}</span>
                    <span>合計サイズ: {formatBytes(analysis.totalSize)}</span>
                    {analysis.lastModified ? (
                      <span>
                        更新:{" "}
                        {new Date(analysis.lastModified).toLocaleString(
                          "ja-JP",
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={emptyMessageClass}>解析結果がありません。</p>
          )}
        </div>
        <div className={analysesCardClass}>
          <span className={analysesTitleClass}>AIモデル別解析枚数</span>
          {insights.modelUsage.length ? (
            <ul className={modelUsageListClass}>
              {insights.modelUsage.map((entry) => (
                <li key={entry.model} className={modelUsageItemClass}>
                  <span>{entry.model}</span>
                  <span>{entry.count.toLocaleString("ja-JP")}枚</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={emptyMessageClass}>解析枚数の情報がありません。</p>
          )}
        </div>
        <QuestionnaireCard questionnaire={insights.questionnaire} />
      </section>

      <UserTrendChart data={insights.timeline} />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(1)}${units[index]}`;
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
