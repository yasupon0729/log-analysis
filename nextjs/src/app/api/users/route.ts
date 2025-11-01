import { NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { getUsersOverview } from "@/lib/users/dashboard-service";

const usersLogger = logger.child({ component: "users-overview-route" });

interface UsersOverviewSuccessResponse {
  ok: true;
  users: Awaited<ReturnType<typeof getUsersOverview>>;
  meta: {
    count: number;
  };
}

interface UsersOverviewErrorResponse {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
}

type UsersOverviewResponse =
  | UsersOverviewSuccessResponse
  | UsersOverviewErrorResponse;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  usersLogger.info("Users overview requested", {
    limit,
  });

  try {
    const users = await getUsersOverview({
      limit: limit && Number.isFinite(limit) && limit > 0 ? limit : undefined,
    });
    return NextResponse.json<UsersOverviewResponse>({
      ok: true,
      users,
      meta: {
        count: users.length,
      },
    });
  } catch (error) {
    usersLogger.error("Failed to fetch users overview", { error });
    return NextResponse.json<UsersOverviewResponse>(
      {
        ok: false,
        code: "UnexpectedError",
        message: "ユーザー一覧の取得に失敗しました",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
