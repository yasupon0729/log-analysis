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
          // ファイル出力
          {
            target: "pino/file",
            level: "debug",
            options: {
              destination: join(process.cwd(), "logs", "server", "app-dev.log"),
              mkdir: true,
            },
          },
        ],
      },
    })
  : // 本番環境: シンプルな設定（トランスポートなし）
    pino(
      {
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
      },
      // 本番環境では直接ファイル出力
      pino.destination({
        dest: join(process.cwd(), "logs", "server", "app-prod.log"),
        sync: false,
        mkdir: true,
      }),
    );

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
logger.info("Logger initialized", {
  logLevel: pinoLogger.level,
});
