import type { RowDataPacket } from "mysql2";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { selectRows } from "@/lib/mysql/client";

const routeLogger = logger.child({ component: "mysql-accounts-route" });

export async function GET() {
  routeLogger.info("accounts_customeuser の取得を開始しました");

  try {
    const rows = await selectRows<RowDataPacket & Record<string, unknown>>(
      "SELECT * FROM accounts_customuser",
    );
    const serializedRows = rows.map((row) => ({ ...row }));

    return NextResponse.json(
      {
        ok: true,
        rows: serializedRows,
        count: serializedRows.length,
      },
      { status: 200 },
    );
  } catch (error) {
    routeLogger.error("accounts_customeuser の取得に失敗しました", { error });
    return NextResponse.json(
      {
        ok: false,
        error:
          "accounts_customeuser を取得できませんでした。ログを確認してください。",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
