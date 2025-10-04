import { join } from "node:path";
import { logger } from "@/lib/logger/server";
import { type NextRequest, NextResponse } from "next/server";
import pino from "pino";

// クライアントログ用の専用 logger インスタンス（シングルトン）
const isDevelopment = process.env.NODE_ENV === "development";
const clientFileLogger = pino(
  {
    // timeフィールドを適切にフォーマット
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.transport({
    targets: [
      // クライアントログ専用ファイル（シンプルなファイル出力）
      {
        target: "pino/file",
        level: isDevelopment ? "debug" : "info",
        options: {
          destination: join(
            process.cwd(),
            "logs",
            "client",
            `app-${isDevelopment ? "dev" : "prod"}.log`,
          ),
          mkdir: true,
        },
      },
    ],
  }),
);

interface ClientLog {
  level: {
    label: string;
    value: number;
  };
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  messages?: any[];
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  bindings?: Record<string, any>[];
  ts?: number;
  timestamp: string;
  userAgent?: string;
  url?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 単一ログ or バッチログを判定
    const logs: ClientLog[] = Array.isArray(body) ? body : [body];

    // IP アドレスを取得（オプション）
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // 各ログを処理
    for (const log of logs) {
      const enrichedLog = {
        ...log,
        source: "client",
        ip,
      };

      // レベルに応じて適切なメソッドを使用
      const level = log.level?.label?.toLowerCase() || "info";
      const logMethod =
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        (clientFileLogger as any)[level] || clientFileLogger.info;

      // ファイルに出力（開発環境でも）
      logMethod.bind(clientFileLogger)(enrichedLog);

      // サーバーログにも記録（エラーの監視用）
      if (level === "error" || level === "fatal") {
        logger.error("Client error logged", { clientLog: enrichedLog });
      }
    }

    return NextResponse.json({
      success: true,
      processed: logs.length,
    });
  } catch (error) {
    logger.error("Failed to process client logs", { error });
    return NextResponse.json({ error: "Invalid log format" }, { status: 400 });
  }
}

// Rate Limiting（オプション）
export const runtime = "nodejs";
export const maxDuration = 10; // 10秒でタイムアウト
