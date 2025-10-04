import { logger } from "@/lib/logger/server";
import HomeClient from "./page-client";

export default function Home() {
  // サーバーサイドでログを出力
  logger.info("Home page loaded (server-side)", {
    page: "/",
    type: "page_load",
    message: "xxxxx",
  });

  logger.debug("Server environment info", {
    nodeVersion: process.version,
  });

  return <HomeClient />;
}
