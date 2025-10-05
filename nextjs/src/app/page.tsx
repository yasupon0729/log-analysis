import UploadLogClient from "@/app/upload/page-client";
import { logger } from "@/lib/logger/server";

export default function Home() {
  logger.info("Upload landing page loaded", {
    page: "/",
    type: "page_load",
  });

  return <UploadLogClient />;
}
