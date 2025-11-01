import { logger } from "@/lib/logger/server";
import { S3Client } from "@/lib/s3/client";
import type { QuestionnaireRecord } from "./types";

export type { QuestionnaireRecord } from "./types";

const questionnaireLogger = logger.child({ component: "questionnaire-client" });

const QUESTIONNAIRE_BUCKET =
  process.env.S3_QUESTIONNAIRE_BUCKET ||
  process.env.S3_ANALYSIS_BUCKET ||
  process.env.S3_BUCKET ||
  process.env.S3_LOG_BUCKET ||
  "gexel-secure-storage";

const QUESTIONNAIRE_REGION =
  process.env.S3_QUESTIONNAIRE_REGION ||
  process.env.S3_ANALYSIS_REGION ||
  process.env.S3_REGION ||
  process.env.AWS_REGION ||
  "ap-northeast-1";

const QUESTIONNAIRE_BASE_PREFIX = normalizePath(
  process.env.S3_QUESTIONNAIRE_BASE_PREFIX || "product/user",
);

const QUESTIONNAIRE_SEGMENT = normalizePath(
  process.env.S3_QUESTIONNAIRE_PATH_SEGMENT || "questionnaire/gexel",
);

const QUESTIONNAIRE_FILENAME = (
  process.env.S3_QUESTIONNAIRE_OBJECT_KEY || "answers.json"
).trim();

const GEXEL_HEADER_MAP: Record<string, string> = {
  q1: "1. GeXeLを知ったきっかけを教えてください",
  q2: "2. 画像を撮影している理由と、目的(何を知りたいのか)を教えてください",
  q3_1: "3. 月に何枚程度、画像を撮影していますか",
  q3_2: "そのうち解析したいのは何枚ですか",
  q4: "4. これまでの手法では出来なくて、GeXeLに期待していることを教えてください",
  q5_1: "5. 社内でAIを用いて性能向上条件の探索や製造条件の最適化を現在行っていますか。",
  q5_1_1:
    "5-1-1. どのような場面でAIを活用していますか。現状の成果や課題があれば教えてください。",
  q5_1_2:
    "5-1-2.AIを活用していない場合、どのような理由で活用していないのか教えてください。",
  q5_2: "5-2. 効果が期待できるAI製品の場合、どの程度の予算をお考えですか？",
  q6: "6. 社内の他のチームや部署では、画像解析でどのようなお困りごとがありますか。",
};

export class QuestionnaireClient {
  private readonly s3Client: S3Client;
  private readonly logger = questionnaireLogger;

  constructor(client?: S3Client) {
    this.s3Client =
      client ||
      new S3Client({
        bucket: QUESTIONNAIRE_BUCKET,
        region: QUESTIONNAIRE_REGION,
      });
  }

  async getAnswers(userId: string): Promise<QuestionnaireRecord | null> {
    if (!userId) {
      return null;
    }

    const key = buildQuestionnaireKey(userId);
    try {
      const object = await this.s3Client.getObject({ key });
      const text = object.body.toString("utf8");
      const parsed = safeParseJson(text);
      const normalised = normaliseAnswers(parsed);

      return {
        userId,
        key,
        submittedAt: normalised.submittedAt ?? object.lastModified,
        lastModified: object.lastModified,
        answers: normalised.answers,
        raw: parsed,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        this.logger.debug("Questionnaire not found", { userId, key });
        return null;
      }

      this.logger.error("Failed to fetch questionnaire", {
        userId,
        key,
        error,
      });
      throw error;
    }
  }
}

let questionnaireClientInstance: QuestionnaireClient | null = null;

export function getQuestionnaireClient(): QuestionnaireClient {
  if (!questionnaireClientInstance) {
    questionnaireClientInstance = new QuestionnaireClient();
  }
  return questionnaireClientInstance;
}

function buildQuestionnaireKey(userId: string): string {
  const segments: string[] = [];
  if (QUESTIONNAIRE_BASE_PREFIX) {
    segments.push(QUESTIONNAIRE_BASE_PREFIX);
  }
  segments.push(userId);
  if (QUESTIONNAIRE_SEGMENT) {
    segments.push(QUESTIONNAIRE_SEGMENT);
  }
  segments.push(QUESTIONNAIRE_FILENAME);
  return segments.join("/");
}

function normaliseAnswers(payload: unknown): {
  submittedAt?: string;
  answers: Record<string, unknown>;
} {
  if (!payload || typeof payload !== "object") {
    return { answers: {} };
  }

  const record = payload as Record<string, unknown>;
  const answersValue = record.answers;
  const answers: Record<string, unknown> = convertToRecord(answersValue);
  if (!Object.keys(answers).length) {
    for (const [key, value] of Object.entries(record)) {
      if (typeof key !== "string") {
        continue;
      }
      if (METADATA_KEYS.has(key)) {
        continue;
      }
      answers[key] = value as unknown;
    }
  }

  const submittedAt = pickTimestamp(record);

  return { answers: applyHeaderMap(answers), submittedAt };
}

const METADATA_KEYS = new Set([
  "userId",
  "submittedAt",
  "submitted_at",
  "updatedAt",
  "updated_at",
  "createdAt",
  "created_at",
  "answers",
  "metadata",
]);

function convertToRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (Array.isArray(value)) {
    return value.reduce<Record<string, unknown>>((acc, entry, index) => {
      acc[String(index)] = entry as unknown;
      return acc;
    }, {});
  }
  if (typeof value === "object") {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function applyHeaderMap(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    const header = GEXEL_HEADER_MAP[key] ?? key;
    mapped[header] = value;
  }
  return mapped;
}

function pickTimestamp(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.submittedAt,
    record.submitted_at,
    record.updatedAt,
    record.updated_at,
    record.createdAt,
    record.created_at,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    questionnaireLogger.warn("Failed to parse questionnaire JSON", {
      error,
    });
    return {};
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const metadata = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata;
  if (metadata?.httpStatusCode === 404) {
    return true;
  }

  const name = (error as { name?: string }).name;
  return name === "NoSuchKey" || name === "NotFound";
}

function normalizePath(value: string): string {
  return value
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/");
}
