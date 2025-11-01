"use client";

import { useEffect, useMemo, useState } from "react";

import { AlertBanner } from "@/components/ui/AlertBanner";
import { UserDetailPanel } from "@/components/users/UserDetailPanel";
import { UserList } from "@/components/users/UserList";
import type {
  ApiErrorResponse,
  UserInsightsDTO,
  UserInsightsResponse,
  UserOverviewDTO,
  UsersOverviewResponse,
} from "@/lib/users/types";
import { css } from "@/styled-system/css";

interface UsersPageClientProps {
  initialUsers: UserOverviewDTO[];
}

type SortKey =
  | "latest-asc"
  | "latest-desc"
  | "user-id-asc"
  | "user-id-desc"
  | "registered-asc"
  | "registered-desc";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "latest-desc", label: "最新解析（新しい順）" },
  { value: "latest-asc", label: "最新解析（古い順）" },
  { value: "user-id-desc", label: "ユーザーID（降順）" },
  { value: "user-id-asc", label: "ユーザーID（昇順）" },
  { value: "registered-desc", label: "登録日（新しい順）" },
  { value: "registered-asc", label: "登録日（古い順）" },
];

const pageClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const layoutClass = css({
  display: "grid",
  gap: 6,
  gridTemplateColumns: {
    base: "1fr",
    xl: "minmax(280px, 360px) minmax(0, 1fr)",
  },
  alignItems: "stretch",
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

const controlsClass = css({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 3,
});

const controlGroupClass = css({
  display: "flex",
  alignItems: "center",
  gap: 2,
});

const selectClass = css({
  backgroundColor: "rgba(15, 23, 42, 0.6)",
  border: "thin",
  borderColor: "border.default",
  borderRadius: "md",
  color: "text.primary",
  paddingX: 3,
  paddingY: 2,
  minHeight: "36px",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "primary.500",
  },
});

const inputClass = css({
  backgroundColor: "rgba(15, 23, 42, 0.6)",
  border: "thin",
  borderColor: "border.default",
  borderRadius: "md",
  color: "text.primary",
  paddingX: 3,
  paddingY: 2,
  minHeight: "36px",
  minWidth: "220px",
  _placeholder: { color: "text.muted" },
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "primary.500",
  },
});

export default function UsersPageClient({
  initialUsers,
}: UsersPageClientProps) {
  const [users, setUsers] = useState<UserOverviewDTO[]>(initialUsers);
  const [selectedUserId, setSelectedUserId] = useState<string>(
    initialUsers[0]?.userId ?? "",
  );
  const [usersError, setUsersError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("latest-desc");
  const [searchTerm, setSearchTerm] = useState("");

  const [insights, setInsights] = useState<UserInsightsDTO | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsRequestKey, setInsightsRequestKey] = useState(0);

  const filteredUsers = useMemo(
    () => filterAndSortUsers(users, searchTerm, sortKey),
    [users, searchTerm, sortKey],
  );

  useEffect(() => {
    if (!filteredUsers.length) {
      if (selectedUserId) {
        setSelectedUserId("");
      }
      return;
    }
    if (!selectedUserId) {
      setSelectedUserId(filteredUsers[0].userId);
      return;
    }
    if (!filteredUsers.some((user) => user.userId === selectedUserId)) {
      setSelectedUserId(filteredUsers[0].userId);
    }
  }, [filteredUsers, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) {
      setInsights(null);
      return;
    }

    const controller = new AbortController();
    const requestKey = insightsRequestKey;
    setInsightsLoading(true);
    setInsightsError(null);

    fetch(`/api/users/${encodeURIComponent(selectedUserId)}/insights`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as UserInsightsResponse;
        if (!data.ok) {
          throw new Error((data as ApiErrorResponse).message);
        }
        if (requestKey !== insightsRequestKey) {
          return;
        }
        setInsights(data);
      })
      .catch((error: unknown) => {
        if ((error as DOMException)?.name === "AbortError") {
          return;
        }
        if (requestKey !== insightsRequestKey) {
          return;
        }
        setInsightsError(
          error instanceof Error
            ? error.message
            : "ユーザー詳細の取得に失敗しました",
        );
        setInsights(null);
      })
      .finally(() => {
        if (requestKey === insightsRequestKey) {
          setInsightsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedUserId, insightsRequestKey]);

  const selectedUser = useMemo(
    () => users.find((user) => user.userId === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const handleRefreshUsers = async () => {
    setIsRefreshing(true);
    setUsersError(null);
    try {
      const response = await fetch("/api/users");
      const data = (await response.json()) as UsersOverviewResponse;
      if (!data.ok) {
        setUsersError((data as ApiErrorResponse).message);
        return;
      }
      setUsers(data.users);
      if (data.users.length) {
        if (!data.users.some((user) => user.userId === selectedUserId)) {
          setSelectedUserId(data.users[0].userId);
          setInsightsRequestKey((value) => value + 1);
        }
      } else {
        setSelectedUserId("");
        setInsights(null);
      }
    } catch (error) {
      setUsersError(
        error instanceof Error
          ? error.message
          : "ユーザー一覧の取得に失敗しました",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetryInsights = () => {
    setInsightsRequestKey((value) => value + 1);
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
  };

  return (
    <div className={pageClass}>
      <header>
        <h1 className={titleClass}>ユーザー動向ダッシュボード</h1>
        <p className={messageClass}>
          ユーザーごとの解析状況とアンケート回答を確認できます。
        </p>
      </header>

      <div className={controlsClass}>
        <div className={controlGroupClass}>
          <select
            className={selectClass}
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            aria-label="並び替え"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <input
          className={inputClass}
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="ユーザーID・企業名で検索"
          aria-label="ユーザー検索"
        />
      </div>

      {usersError ? (
        <AlertBanner
          variant="error"
          title="ユーザー一覧の取得に失敗しました"
          description={usersError}
        />
      ) : null}

      <div className={layoutClass}>
        <UserList
          users={filteredUsers}
          selectedUserId={selectedUserId}
          onSelect={handleSelectUser}
          onRefresh={handleRefreshUsers}
          isRefreshing={isRefreshing}
        />
        <UserDetailPanel
          selectedUser={selectedUser}
          insights={insights}
          isLoading={insightsLoading}
          error={insightsError}
          onRetry={handleRetryInsights}
        />
      </div>
    </div>
  );
}

function filterAndSortUsers(
  users: UserOverviewDTO[],
  searchTerm: string,
  sortKey: SortKey,
): UserOverviewDTO[] {
  const normalized = searchTerm.trim().toLowerCase();
  const filtered = normalized
    ? users.filter((user) => {
        const userId = user.userId.toString().toLowerCase();
        const company = user.companyName?.toLowerCase() ?? "";
        return userId.includes(normalized) || company.includes(normalized);
      })
    : users;

  return [...filtered].sort((a, b) => {
    switch (sortKey) {
      case "latest-desc":
      case "latest-asc": {
        const aTime = toTimestamp(a.latestAnalysisAt);
        const bTime = toTimestamp(b.latestAnalysisAt);
        const aValid = Number.isFinite(aTime);
        const bValid = Number.isFinite(bTime);
        const direction = sortKey === "latest-desc" ? -1 : 1;
        if (aValid && bValid && aTime !== bTime) {
          return direction * (aTime - bTime);
        }
        if (aValid && !bValid) {
          return -1;
        }
        if (!aValid && bValid) {
          return 1;
        }
        return compareUserId(a, b);
      }
      case "registered-desc":
      case "registered-asc": {
        const aTime = toTimestamp(a.registeredAt);
        const bTime = toTimestamp(b.registeredAt);
        const aValid = Number.isFinite(aTime);
        const bValid = Number.isFinite(bTime);
        const direction = sortKey === "registered-desc" ? -1 : 1;
        if (aValid && bValid && aTime !== bTime) {
          return direction * (aTime - bTime);
        }
        if (aValid && !bValid) {
          return -1;
        }
        if (!aValid && bValid) {
          return 1;
        }
        return compareUserId(a, b);
      }
      case "user-id-desc":
        return compareUserId(b, a);
      default:
        return compareUserId(a, b);
    }
  });
}

function compareUserId(a: UserOverviewDTO, b: UserOverviewDTO): number {
  const numA = Number(a.userId);
  const numB = Number(b.userId);
  const isNumA = Number.isFinite(numA);
  const isNumB = Number.isFinite(numB);
  if (isNumA && isNumB && numA !== numB) {
    return numA - numB;
  }
  if (isNumA && !isNumB) {
    return -1;
  }
  if (!isNumA && isNumB) {
    return 1;
  }
  return a.userId.localeCompare(b.userId, "ja");
}

function toTimestamp(value?: string | null): number {
  if (!value) {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}
