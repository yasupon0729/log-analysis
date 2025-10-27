import { NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { selectOne } from "@/lib/mysql/client";

const routeLogger = logger.child({ component: "mysql-connection-check" });

export async function GET() {
  const startedAt = Date.now();
  routeLogger.info("MySQL接続チェックを開始しました");

  try {
    const row = await selectOne<{ ok: number }>("SELECT 1 AS ok");

    return NextResponse.json(
      {
        ok: true,
        connected: row?.ok === 1,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 200 },
    );
  } catch (error) {
    routeLogger.error("MySQL接続チェックに失敗しました", { error });
    return NextResponse.json(
      {
        ok: false,
        error: "MySQL接続に失敗しました。ログを確認してください。",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
