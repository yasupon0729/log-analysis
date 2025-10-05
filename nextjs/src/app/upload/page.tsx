import { logger } from "@/lib/logger/server";

import UploadLogClient from "./page-client";

export default function UploadPage() {
  logger.info("Upload page loaded (server-side)", {
    page: "/upload",
    type: "page_load",
  });

  return <UploadLogClient />;
}
