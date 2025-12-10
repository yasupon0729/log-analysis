import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const source = searchParams.get("source") || "server"; // "server" or "client"
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const level = searchParams.get("level") || "all";

    const isDevelopment = process.env.NODE_ENV === "development";
    const logDir = join(process.cwd(), "logs", source);
    const logFile = join(
      logDir,
      `app-${isDevelopment ? "dev" : "prod"}.log`
    );

    if (!existsSync(logFile)) {
      return NextResponse.json({ logs: [] });
    }

    // ファイルを読み込んで行ごとに分割
    // 注意: 大きなファイルの場合は効率が悪いため、本番運用ではstreamやread-last-linesの使用を検討すべき
    const fileContent = readFileSync(logFile, "utf-8");
    const allLines = fileContent.trim().split("\n");

    // 末尾からlimit行を取得
    const lines = allLines.slice(-limit);

    const logs = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter((log) => log !== null)
      .filter((log) => {
        if (level === "all") return true;
        // Pino log level: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
        const levelVal = typeof log.level === 'number' ? log.level : 30; // default info
        
        switch (level) {
          case "error": return levelVal >= 50;
          case "warn": return levelVal >= 40;
          case "info": return levelVal >= 30;
          case "debug": return levelVal >= 20;
          default: return true;
        }
      })
      .reverse(); // 新しい順にする

    return NextResponse.json({ logs });
  } catch (error) {
    logger.error("Failed to fetch system logs", { error });
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
