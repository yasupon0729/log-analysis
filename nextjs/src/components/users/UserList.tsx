"use client";

import { Button } from "@/components/ui/Button";
import { CardList } from "@/components/ui/CardList";
import type { UserOverviewDTO } from "@/lib/users/types";
import { css } from "@/styled-system/css";

interface UserListProps {
  users: UserOverviewDTO[];
  selectedUserId?: string;
  onSelect(userId: string): void;
  onRefresh(): void;
  isRefreshing?: boolean;
}

const titleStackClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 1,
  textAlign: "left",
});

const userIdClass = css({
  fontWeight: "semibold",
  color: "text.primary",
  fontSize: "md",
});

const companyClass = css({
  fontSize: "sm",
  color: "text.secondary",
});

const metaListClass = css({
  display: "grid",
  gap: 1,
  fontSize: "xs",
  color: "text.muted",
  textAlign: "left",
});

const emptyStateClass = css({
  fontSize: "sm",
  color: "text.muted",
  padding: 2,
});

const cardListClass = css({
  height: "100%",
});

export function UserList({
  users,
  selectedUserId,
  onSelect,
  onRefresh,
  isRefreshing,
}: UserListProps) {
  return (
    <CardList
      className={cardListClass}
      items={users}
      getKey={(item) => item.userId}
      renderTitle={(item) => (
        <div className={titleStackClass}>
          <span className={userIdClass}>{item.userId}</span>
          {item.companyName ? (
            <span className={companyClass}>{item.companyName}</span>
          ) : null}
        </div>
      )}
      renderMeta={(item) => (
        <dl className={metaListClass}>
          <div>
            <dt>解析数</dt>
            <dd>{item.totalAnalyses.toLocaleString("ja-JP")}</dd>
          </div>
          <div>
            <dt>最終解析</dt>
            <dd>{formatDateTime(item.latestAnalysisAt)}</dd>
          </div>
          <div>
            <dt>登録日</dt>
            <dd>{formatDateTime(item.registeredAt)}</dd>
          </div>
        </dl>
      )}
      headerTitle={
        <span>{`ユーザー一覧 (${users.length.toLocaleString("ja-JP")})`}</span>
      }
      headerActions={
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          isLoading={isRefreshing}
        >
          更新
        </Button>
      }
      selectedKey={selectedUserId}
      onSelect={(item) => onSelect(item.userId)}
      emptyState={<p className={emptyStateClass}>ユーザー情報がありません。</p>}
    />
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
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
