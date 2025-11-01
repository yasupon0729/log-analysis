"use client";

import { Button } from "@/components/ui/Button";
import type { UserOverviewDTO } from "@/lib/users/types";
import { css, cx } from "@/styled-system/css";

interface UserListProps {
  users: UserOverviewDTO[];
  selectedUserId?: string;
  onSelect(userId: string): void;
  onRefresh(): void;
  isRefreshing?: boolean;
}

const containerClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  height: "100%",
});

const headerClass = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
});

const titleClass = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "text.secondary",
});

const listClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 3,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingRight: 2,
});

const itemClass = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  border: "thin",
  borderColor: "border.default",
  borderRadius: "lg",
  padding: 4,
  backgroundColor: "rgba(15, 23, 42, 0.5)",
  textAlign: "left",
  transition: "background 0.2s ease",
  cursor: "pointer",
  _hover: {
    backgroundColor: "rgba(30, 41, 59, 0.7)",
  },
});

const activeItemClass = css({
  borderColor: "accent.default",
  boxShadow: "0 0 0 1px rgba(56, 189, 248, 0.4)",
  backgroundColor: "rgba(30, 64, 175, 0.35)",
});

const userIdClass = css({
  fontWeight: "semibold",
  color: "text.primary",
});

const companyClass = css({
  fontSize: "sm",
  color: "text.secondary",
});

const metaClass = css({
  display: "flex",
  flexWrap: "wrap",
  gap: 2,
  fontSize: "xs",
  color: "text.muted",
});

const badgeClass = css({
  display: "inline-flex",
  alignItems: "center",
  gap: 1,
  paddingX: 2,
  paddingY: 1,
  borderRadius: "full",
  backgroundColor: "rgba(37, 99, 235, 0.2)",
  color: "blue.200",
  fontSize: "xs",
});

const questionnaireBadgeClass = css({
  backgroundColor: "rgba(16, 185, 129, 0.2)",
  color: "green.200",
});

export function UserList({
  users,
  selectedUserId,
  onSelect,
  onRefresh,
  isRefreshing,
}: UserListProps) {
  return (
    <div className={containerClass}>
      <div className={headerClass}>
        <span className={titleClass}>ユーザー一覧 ({users.length})</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          isLoading={isRefreshing}
        >
          更新
        </Button>
      </div>
      <div className={listClass}>
        {users.map((user) => {
          const isActive = user.userId === selectedUserId;
          const topModels = user.modelUsage.slice(0, 2);
          const companyName = user.companyName ?? null;
          const latestAnalysisAt = user.latestAnalysisAt
            ? formatDateTime(user.latestAnalysisAt)
            : null;
          const registeredAt = user.registeredAt
            ? formatDateTime(user.registeredAt)
            : null;
          return (
            <button
              key={user.userId}
              type="button"
              className={cx(itemClass, isActive && activeItemClass)}
              onClick={() => onSelect(user.userId)}
            >
              <span className={userIdClass}>{user.userId}</span>
              {companyName ? (
                <span className={companyClass}>{companyName}</span>
              ) : null}
              <div className={metaClass}>
                <span>解析数: {user.totalAnalyses}</span>
                {latestAnalysisAt ? (
                  <span>最終解析: {latestAnalysisAt}</span>
                ) : null}
                {registeredAt ? <span>登録: {registeredAt}</span> : null}
              </div>
              <div className={metaClass}>
                {topModels.length ? (
                  topModels.map((model) => (
                    <span key={model.model} className={badgeClass}>
                      {model.model}
                      <span>({model.count.toLocaleString("ja-JP")}枚)</span>
                    </span>
                  ))
                ) : (
                  <span className={badgeClass}>モデル情報なし</span>
                )}
                {user.hasQuestionnaire ? (
                  <span className={cx(badgeClass, questionnaireBadgeClass)}>
                    アンケート済
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
        {!users.length ? (
          <p className={metaClass}>ユーザー情報がまだありません。</p>
        ) : null}
      </div>
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
