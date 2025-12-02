import { logger } from "@/lib/logger/server";
import { getAiModels } from "@/lib/recommendation/service";

import RecommendationPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function RecommendationPage() {
  logger.info("Recommendation page loaded", {
    page: "/recommendation",
    type: "page_load",
  });

  const aiModels = await getAiModels();

  return <RecommendationPageClient aiModels={aiModels} />;
}
