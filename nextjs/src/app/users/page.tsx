import { Suspense } from "react";

import { logger } from "@/lib/logger/server";
import { getUsersOverview } from "@/lib/users/dashboard-service";

import UsersPageClient from "./page-client";

export default async function UsersPage() {
  logger.info("Users dashboard page loaded", {
    page: "/users",
    type: "page_load",
  });

  const initialUsers = await getUsersOverview();

  return (
    <Suspense fallback={<div>ユーザーデータを読み込み中...</div>}>
      <UsersPageClient initialUsers={initialUsers} />
    </Suspense>
  );
}
