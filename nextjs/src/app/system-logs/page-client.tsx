"use client";

import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { TanstackTable } from "@/components/tanstack-table";
import type { CustomColumnMeta } from "@/components/tanstack-table/types";
import { css } from "@/styled-system/css";
import { hstack, vstack } from "@/styled-system/patterns";

// ログエントリの型定義
interface LogEntry {
  level: number | { label: string; value: number } | string;
  time?: number | string;
  timestamp?: string;
  msg?: string;
  message?: string;
  source?: string;
  environment?: string;
  component?: string;
  messages?: Array<{
    message?: string;
    component?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

// ログデータの正規化用型
interface NormalizedLogEntry {
  id: string;
  timestamp: string;
  level: string;
  levelValue: number;
  message: string;
  component: string;
  source: string;
  environment: string;
  raw: LogEntry;
}

const getLevelInfo = (
  level: LogEntry["level"],
): { label: string; value: number } => {
  if (typeof level === "number") {
    if (level >= 60) return { label: "FATAL", value: 60 };
    if (level >= 50) return { label: "ERROR", value: 50 };
    if (level >= 40) return { label: "WARN", value: 40 };
    if (level >= 30) return { label: "INFO", value: 30 };
    if (level >= 20) return { label: "DEBUG", value: 20 };
    return { label: "TRACE", value: 10 };
  }
  if (typeof level === "object" && level !== null && "label" in level) {
    return { label: level.label.toUpperCase(), value: level.value };
  }
  if (typeof level === "string") {
    const label = level.toUpperCase();
    const map: Record<string, number> = {
      FATAL: 60,
      ERROR: 50,
      WARN: 40,
      INFO: 30,
      DEBUG: 20,
      TRACE: 10,
    };
    return { label, value: map[label] || 0 };
  }
  return { label: "UNKNOWN", value: 0 };
};

const getLevelColor = (levelLabel: string) => {
  switch (levelLabel) {
    case "FATAL":
    case "ERROR":
      return "red.500";
    case "WARN":
      return "yellow.500";
    case "INFO":
      return "blue.500";
    case "DEBUG":
      return "gray.500";
    default:
      return "gray.400";
  }
};

const normalizeLog = (log: LogEntry, index: number): NormalizedLogEntry => {
  const levelInfo = getLevelInfo(log.level);

  // タイムスタンプの抽出
  let timestampStr = "-";
  if (log.timestamp) timestampStr = log.timestamp;
  else if (log.time)
    timestampStr =
      typeof log.time === "number"
        ? new Date(log.time).toISOString()
        : log.time;
  else if (log.ts) timestampStr = new Date(Number(log.ts)).toISOString();

  // メッセージとコンポーネントの抽出
  let message = log.msg || log.message || "";
  let component = log.component || "";

  // messages配列がある場合（クライアントログなど）
  if (log.messages && Array.isArray(log.messages) && log.messages.length > 0) {
    const firstMsg = log.messages[0];
    if (!message && firstMsg.message) message = firstMsg.message;
    if (!component && firstMsg.component) component = firstMsg.component;
  }

  // フォールバック
  if (!message) message = "(No message)";
  if (!component) component = "-";

  return {
    id: `${timestampStr}-${index}`,
    timestamp: timestampStr,
    level: levelInfo.label,
    levelValue: levelInfo.value,
    message,
    component,
    source: log.source || "server",
    environment: log.environment || "production",
    raw: log,
  };
};

// JSTフォーマッター
const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
  timeZone: "Asia/Tokyo",
});

const formatTimestamp = (value: string) => {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    // "2025/12/09 19:59:08.349" -> "2025-12-09 19:59:08.349"
    return dateFormatter.format(date).replace(/\//g, "-");
  } catch {
    return value;
  }
};

const columnHelper = createColumnHelper<NormalizedLogEntry>();

export default function SystemLogsClient() {
  const [source, setSource] = useState<"server" | "client">("server");
  const [logs, setLogs] = useState<NormalizedLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const sourceSelectId = useId();
  const autoRefreshId = useId();

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/system-logs?source=${source}&limit=500`);
      if (res.ok) {
        const data = await res.json();
        const normalized = data.logs.map((log: LogEntry, i: number) =>
          normalizeLog(log, i),
        );
        setLogs(normalized);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch logs", error);
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  useEffect(() => {
    fetchLogs();

    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 5000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  // biome-ignore lint/suspicious/noExplicitAny: <>
  const columns = useMemo<ColumnDef<NormalizedLogEntry, any>[]>(
    () => [
      columnHelper.accessor("timestamp", {
        header: "Time (JST)",
        cell: (info) => formatTimestamp(info.getValue()),
        meta: {
          cellType: "text",
          enableGlobalFilter: true,
        } as CustomColumnMeta,
        size: 200,
      }),
      columnHelper.accessor("level", {
        header: "Level",
        cell: (info) => (
          <span
            className={css({
              px: 2,
              py: 0.5,
              borderRadius: "full",
              fontSize: "xs",
              fontWeight: "bold",
              color: "white",
            })}
            style={{
              backgroundColor: `token(colors.${getLevelColor(info.getValue())})`,
            }}
          >
            {info.getValue()}
          </span>
        ),
        meta: {
          cellType: "status",
          filterVariant: "select",
          filterOptions: [
            { label: "INFO", value: "INFO" },
            { label: "WARN", value: "WARN" },
            { label: "ERROR", value: "ERROR" },
            { label: "DEBUG", value: "DEBUG" },
            { label: "FATAL", value: "FATAL" },
          ],
        } as CustomColumnMeta,
        size: 100,
      }),
      columnHelper.accessor("source", {
        header: "Source",
        cell: (info) => info.getValue(),
        meta: {
          cellType: "text",
          filterVariant: "select",
          filterOptions: [
            { label: "server", value: "server" },
            { label: "client", value: "client" },
          ],
        } as CustomColumnMeta,
        size: 100,
      }),
      columnHelper.accessor("component", {
        header: "Component",
        cell: (info) => info.getValue(),
        meta: {
          cellType: "text",
          enableGlobalFilter: true,
        } as CustomColumnMeta,
        size: 150,
      }),
      columnHelper.accessor("message", {
        header: "Message",
        cell: (info) => (
          <div
            className={css({
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            })}
            title={info.getValue()}
          >
            {info.getValue()}
          </div>
        ),
        meta: {
          cellType: "text",
          enableGlobalFilter: true,
        } as CustomColumnMeta,
        size: 400,
      }),
      columnHelper.display({
        id: "details",
        header: "Details",
        cell: (info) => (
          <details>
            <summary
              className={css({
                cursor: "pointer",
                color: "primary.400",
                fontSize: "xs",
                _hover: { textDecoration: "underline" },
              })}
            >
              JSON
            </summary>
            <pre
              className={css({
                fontSize: "xs",
                mt: 2,
                p: 2,
                bg: "dark.bgSubtle",
                borderRadius: "md",
                overflowX: "auto",
                color: "text.secondary",
                border: "thin",
                borderColor: "dark.borderSubtle",
                maxHeight: "200px",
              })}
            >
              {JSON.stringify(info.row.original.raw, null, 2)}
            </pre>
          </details>
        ),
        size: 100,
      }),
    ],
    [],
  );

  return (
    <div
      className={vstack({
        gap: 6,
        alignItems: "stretch",
        p: 6,
        color: "text.primary",
      })}
    >
      <div className={hstack({ justify: "space-between" })}>
        <h1
          className={css({
            fontSize: "2xl",
            fontWeight: "bold",
            color: "text.primary",
          })}
        >
          システムログ
        </h1>
        <div className={hstack({ gap: 4 })}>
          <div className={hstack({ gap: 2 })}>
            <label
              htmlFor={sourceSelectId}
              className={css({
                fontSize: "sm",
                fontWeight: "medium",
                color: "text.secondary",
              })}
            >
              ソース:
            </label>
            <select
              id={sourceSelectId}
              className={css({
                p: 2,
                borderRadius: "md",
                border: "thin",
                borderColor: "dark.border",
                bg: "dark.surface",
                color: "text.primary",
                cursor: "pointer",
                _focus: { borderColor: "primary.500", outline: "none" },
              })}
              value={source}
              onChange={(e) => setSource(e.target.value as "server" | "client")}
            >
              <option value="server">Server (Backend)</option>
              <option value="client">Client (Frontend)</option>
            </select>
          </div>

          <div className={hstack({ gap: 2 })}>
            <input
              id={autoRefreshId}
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className={css({ cursor: "pointer" })}
            />
            <label
              htmlFor={autoRefreshId}
              className={css({
                fontSize: "sm",
                cursor: "pointer",
                color: "text.secondary",
              })}
            >
              自動更新 (5s)
            </label>
          </div>

          <button
            type="button"
            onClick={() => fetchLogs()}
            disabled={isLoading}
            className={css({
              px: 3,
              py: 1,
              bg: "primary.600",
              color: "white",
              borderRadius: "md",
              cursor: "pointer",
              transition: "background 0.2s",
              _hover: { bg: "primary.500" },
              _disabled: {
                opacity: 0.5,
                cursor: "not-allowed",
                bg: "gray.600",
              },
            })}
          >
            {isLoading ? "更新中..." : "更新"}
          </button>
        </div>
      </div>

      <div
        className={css({
          fontSize: "sm",
          color: "text.tertiary",
          textAlign: "right",
        })}
      >
        最終更新: {lastUpdated.toLocaleTimeString()}
      </div>

      <TanstackTable
        data={logs}
        columns={columns}
        isLoading={isLoading}
        pageSize={50}
        globalFilterPlaceholder="ログを検索 (メッセージ, コンポーネント...)"
      />
    </div>
  );
}
