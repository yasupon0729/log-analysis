import { logger } from "@/lib/logger/server";
import RecommendationPageClient from "./page-client";

export default function RecommendationPage() {
  logger.info("Recommendation page loaded", {
    page: "/recommendation",
    type: "page_load",
  });

  return <RecommendationPageClient />;
}
