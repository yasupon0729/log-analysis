import { join } from "node:path";
import pino from "pino";

// 本番環境での動作を確実にするため、条件分岐で設定
const isDevelopment = process.env.NODE_ENV === "development";

// 環境に応じてpinoLoggerを作成
const pinoLogger = isDevelopment
  ? // 開発環境: トランスポート使用
    pino({
      level: process.env.LOG_LEVEL || "debug",
      transport: {
        targets: [
          // コンソール出力
          {
            target: "pino-pretty",
            level: "debug",
            options: {
              colorize: true,
              ignore: "pid,hostname",
              translateTime: "yyyy-mm-dd HH:MM:ss.l",
            },
          },
          // ファイル出力 (ローテーション付き)
          {
            target: "pino-roll",
            level: "debug",
            options: {
              file: join(process.cwd(), "logs", "server", "app-dev"),
              frequency: "daily",
              mkdir: true,
              extension: ".log",
            },
          },
        ],
      },
    })
  : // 本番環境: ローテーション付きファイル出力
    pino({
      level: process.env.LOG_LEVEL || "info",
      formatters: {
        level: (label) => ({ level: label }),
        bindings: () => ({
          pid: process.pid,
          hostname: process.env.HOSTNAME || "localhost",
          environment: "production",
        }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: "pino-roll",
        options: {
          file: join(process.cwd(), "logs", "server", "app-prod"),
          frequency: "daily",
          size: "10m", // 10MB
          mkdir: true,
          extension: ".log",
          limit: {
            count: 14, // 14世代保持
          },
        },
      },
    });

// ログレベルのエイリアス
export const serverLogger = pinoLogger;

// ラッパーをインポート
import { LoggerWrapper } from "./wrapper";

// デフォルトメタデータ付きのラッパーを作成（既存のloggerを上書き）
export const logger = new LoggerWrapper(pinoLogger, {
  source: "server",
  environment: process.env.NODE_ENV || "development",
});

// テスト用ログ（新しいフォーマット）
logger.info("Logger initialized with rotation", {
  logLevel: pinoLogger.level,
});
