export interface QuestionnaireRecord {
  userId: string;
  key: string;
  submittedAt?: string;
  lastModified?: string;
  answers: Record<string, unknown>;
  raw: unknown;
}
