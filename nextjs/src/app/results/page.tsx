import { Suspense } from "react";
import { logger } from "@/lib/logger/server";

import ResultsPageClient from "./page-client";

export default function ResultsPage() {
  logger.info("Analysis results page loaded", {
    page: "/results",
    type: "page_load",
  });

  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <ResultsPageClient />
    </Suspense>
  );
}
