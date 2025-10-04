import pino from "pino";

// 開発環境かどうかを判定
const isDevelopment = process.env.NODE_ENV === "development";

// バッファリング用の配列
// biome-ignore lint/suspicious/noExplicitAny: ログバッファは様々な型を扱うため
let logBuffer: any[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// ログバッファをサーバーに送信する関数
const flushLogs = async () => {
  if (logBuffer.length === 0) return;

  const logsToSend = [...logBuffer];
  logBuffer = []; // バッファをクリア

  try {
    await fetch("/api/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(logsToSend),
    });
  } catch (error) {
    // 送信失敗時はコンソールに出力
    console.error("Failed to send logs:", error);

    // ローカルストレージにバックアップ
    try {
      const failedLogs = JSON.parse(localStorage.getItem("failedLogs") || "[]");
      failedLogs.push(...logsToSend);
      // 最新100件のみ保持
      const trimmedLogs = failedLogs.slice(-100);
      localStorage.setItem("failedLogs", JSON.stringify(trimmedLogs));
    } catch (storageError) {
      console.error("Failed to backup logs to localStorage:", storageError);
    }
  }
};

// タイマーをセットアップする関数
const setupFlushTimer = () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushLogs();
  }, 1000); // 1秒後に送信
};

// クライアントサイド用のlogger（内部用）
const pinoLogger = pino({
  browser: {
    // オブジェクト形式でログを出力
    asObject: true,

    // シリアライザーを有効化（エラーオブジェクトなど）
    serialize: true,

    // 開発環境ではコンソールにも出力
    write: isDevelopment
      ? {
          // biome-ignore lint/suspicious/noExplicitAny: ログバッファは様々な型を扱うため
          info: (o: any) => console.info("[INFO]", o.msg || o, o),
          // biome-ignore lint/suspicious/noExplicitAny: ログバッファは様々な型を扱うため
          error: (o: any) => console.error("[ERROR]", o.msg || o, o),
          // biome-ignore lint/suspicious/noExplicitAny: ログバッファは様々な型を扱うため
          debug: (o: any) => console.debug("[DEBUG]", o.msg || o, o),
          // biome-ignore lint/suspicious/noExplicitAny: ログバッファは様々な型を扱うため
          warn: (o: any) => console.warn("[WARN]", o.msg || o, o),
          // biome-ignore lint/suspicious/noExplicitAny: ログバッファは様々な型を扱うため
          fatal: (o: any) => console.error("[FATAL]", o.msg || o, o),
          // biome-ignore lint/suspicious/noExplicitAny: ログバッファは様々な型を扱うため
          trace: (o: any) => console.trace("[TRACE]", o.msg || o, o),
        }
      : undefined,

    // サーバーへの送信設定
    transmit: {
      level: isDevelopment ? "debug" : "info",
      send: (level, logEvent) => {
        // ログをバッファに追加
        logBuffer.push({
          ...logEvent,
          level:
            typeof level === "object" && level !== null && "label" in level
              ? // biome-ignore lint/suspicious/noExplicitAny: ログバッファは様々な型を扱うため
                (level as any).label
              : level,
          timestamp: new Date().toISOString(),
          userAgent:
            typeof window !== "undefined" ? navigator.userAgent : "unknown",
          url: typeof window !== "undefined" ? window.location.href : "unknown",
        });

        // バッチ送信（10件ごと or タイマー）
        if (logBuffer.length >= 10) {
          flushLogs();
        } else {
          setupFlushTimer();
        }
      },
    },
  },
});

// ページアンロード時にログを送信
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushLogs();
  });
}

// ラッパーをインポート
import { LoggerWrapper } from "./wrapper";

// デフォルトメタデータ付きのラッパーを作成してエクスポート
export const logger = new LoggerWrapper(pinoLogger, {
  source: "client",
  environment: process.env.NODE_ENV || "development",
});

// エイリアス
export const clientLogger = logger;
