import type {
  AnalysisResultFileEntry,
  AnalysisResultSummary,
  AnalysisTimelinePoint,
  ModelUsageEntry,
} from "@/lib/analysis-results/service";
import type { QuestionnaireRecord } from "@/lib/questionnaire/types";

export interface UserOverviewDTO {
  userId: string;
  totalAnalyses: number;
  latestAnalysisAt?: string;
  modelUsage: ModelUsageEntry[];
  questionnaireSubmittedAt?: string;
  hasQuestionnaire: boolean;
  companyName?: string | null;
  registeredAt?: string | null;
}

export interface UsersOverviewApiResponse {
  ok: true;
  users: UserOverviewDTO[];
  meta: {
    count: number;
  };
}

export interface UserInsightsDTO {
  ok: true;
  user: {
    userId: string;
    totalAnalyses: number;
    latestAnalysisAt?: string;
    questionnaireSubmittedAt?: string;
    companyName?: string | null;
    registeredAt?: string | null;
  };
  analyses: AnalysisResultSummary[];
  files: AnalysisResultFileEntry[];
  timeline: AnalysisTimelinePoint[];
  modelUsage: ModelUsageEntry[];
  questionnaire: QuestionnaireRecord | null;
}

export interface ApiErrorResponse {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
}

export type UsersOverviewResponse = UsersOverviewApiResponse | ApiErrorResponse;
export type UserInsightsResponse = UserInsightsDTO | ApiErrorResponse;
