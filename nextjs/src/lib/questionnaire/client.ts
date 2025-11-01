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

const BASE_PREFIX = normalizePath(
  process.env.S3_QUESTIONNAIRE_BASE_PREFIX || "product/user",
);

const DEFAULT_GEXEL_SEGMENT = normalizePath(
  process.env.S3_QUESTIONNAIRE_PATH_SEGMENT || "questionnaire/gexel",
);

const DEFAULT_QUESTION_FILENAME = "answers.json";

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

const PI_HEADER_MAP: Record<string, string> = {
  q1: "1. 該当する分野に近いものを1つお選びください。",
  q2: "2. お立場に最も近いものを1つお選びください。",
  q3: "3. サービスの利用目的・解決したい課題は何ですか？",
  q4: "4. 現在お使いの要因解析／シミュレーションの方法やツール、抱えている不満点があれば教えてください。",
  q5: "5. AI の導き出す結果を業務利用する際、信頼する基準を教えてください。",
  q6: "6. 導入を検討する際に最も重視するポイントと、おおよその許容価格帯があればご記入ください。",
};

interface QuestionnaireVariant {
  id: string;
  label: string;
  segment: string;
  filenames: string[];
  headerMap: Record<string, string>;
}

const QUESTIONNAIRE_VARIANTS: QuestionnaireVariant[] = [
  {
    id: "gexel",
    label: "GeXeL アンケート",
    segment: DEFAULT_GEXEL_SEGMENT,
    filenames: [DEFAULT_QUESTION_FILENAME],
    headerMap: GEXEL_HEADER_MAP,
  },
  {
    id: "pi",
    label: "PI アンケート",
    segment: normalizePath("questionnaire/pi"),
    filenames: [DEFAULT_QUESTION_FILENAME],
    headerMap: PI_HEADER_MAP,
  },
];

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
    const all = await this.getAllAnswers(userId);
    return all.find((entry) => entry.hasResponses) ?? null;
  }

  async getAllAnswers(userId: string): Promise<QuestionnaireRecord[]> {
    if (!userId) {
      return [];
    }

    const results: QuestionnaireRecord[] = [];

    for (const variant of QUESTIONNAIRE_VARIANTS) {
      const record = await this.fetchVariant(userId, variant);
      if (record) {
        results.push(record);
      }
    }

    return results;
  }

  private async fetchVariant(
    userId: string,
    variant: QuestionnaireVariant,
  ): Promise<QuestionnaireRecord | null> {
    for (const filename of variant.filenames) {
      const key = buildQuestionnaireKey(userId, variant, filename);
      try {
        const object = await this.s3Client.getObject({ key });
        const text = object.body.toString("utf8");
        const parsed = safeParseJson(text);
        const normalised = normaliseAnswersWithMap(parsed, variant.headerMap);
        const hasResponses = Object.keys(normalised.answers).length > 0;

        return {
          variantId: variant.id,
          variantLabel: variant.label,
          userId,
          key,
          submittedAt: normalised.submittedAt ?? object.lastModified,
          lastModified: object.lastModified,
          answers: normalised.answers,
          raw: parsed,
          hasResponses,
        } satisfies QuestionnaireRecord;
      } catch (error) {
        if (isNotFoundError(error)) {
          continue;
        }

        this.logger.error("Failed to fetch questionnaire", {
          userId,
          key,
          variant: variant.id,
          error,
        });
        throw error;
      }
    }

    const fallbackKey = buildQuestionnaireKey(
      userId,
      variant,
      variant.filenames[0],
    );

    this.logger.debug("Questionnaire variant not found", {
      userId,
      variant: variant.id,
      key: fallbackKey,
    });

    return {
      variantId: variant.id,
      variantLabel: variant.label,
      userId,
      key: fallbackKey,
      submittedAt: undefined,
      lastModified: undefined,
      answers: {},
      raw: null,
      hasResponses: false,
    } satisfies QuestionnaireRecord;
  }
}

let questionnaireClientInstance: QuestionnaireClient | null = null;

export function getQuestionnaireClient(): QuestionnaireClient {
  if (!questionnaireClientInstance) {
    questionnaireClientInstance = new QuestionnaireClient();
  }
  return questionnaireClientInstance;
}

function buildQuestionnaireKey(
  userId: string,
  variant: QuestionnaireVariant,
  filename: string,
): string {
  const segments: string[] = [];
  if (BASE_PREFIX) {
    segments.push(BASE_PREFIX);
  }
  segments.push(userId);
  if (variant.segment) {
    segments.push(variant.segment);
  }
  segments.push(filename);
  return segments.join("/");
}

function normaliseAnswersWithMap(
  payload: unknown,
  headerMap: Record<string, string>,
): {
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

  return { answers: applyHeaderMap(answers, headerMap), submittedAt };
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
  headerMap: Record<string, string>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    const header = headerMap[key] ?? key;
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
