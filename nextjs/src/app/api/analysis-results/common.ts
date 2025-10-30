export function normalizePrefix(value: string): string {
  return value
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
}

export function ensureTrailingSlash(value: string): string {
  if (!value) {
    return "";
  }
  return value.endsWith("/") ? value : `${value}/`;
}

export const ANALYSIS_BUCKET =
  process.env.S3_ANALYSIS_BUCKET ||
  process.env.S3_BUCKET ||
  process.env.S3_LOG_BUCKET ||
  "gexel-secure-storage";

export const ANALYSIS_REGION =
  process.env.S3_ANALYSIS_REGION ||
  process.env.S3_REGION ||
  process.env.AWS_REGION ||
  "ap-northeast-1";

export const ANALYSIS_BASE_PREFIX = normalizePrefix(
  process.env.S3_ANALYSIS_BASE_PREFIX || "product/user",
);

export const ANALYSIS_PATH_SEGMENT = normalizePrefix(
  process.env.S3_ANALYSIS_PATH_SEGMENT || "analysis_result/main",
);

const ANALYSIS_PATH_SEGMENTS = ANALYSIS_PATH_SEGMENT.split("/").filter(
  (segment) => segment.length > 0,
);

const deriveBaseSegments = (): string[] => {
  if (ANALYSIS_PATH_SEGMENTS.length >= 2) {
    return ANALYSIS_PATH_SEGMENTS.slice(0, -1);
  }
  if (ANALYSIS_PATH_SEGMENTS.length === 1) {
    return [...ANALYSIS_PATH_SEGMENTS];
  }
  return ["analysis_result"];
};

const deriveDefaultType = (): string => {
  if (ANALYSIS_PATH_SEGMENTS.length >= 2) {
    const lastSegment =
      ANALYSIS_PATH_SEGMENTS[ANALYSIS_PATH_SEGMENTS.length - 1];
    return lastSegment ? lastSegment : "main";
  }
  return "main";
};

export const ANALYSIS_PATH_BASE_SEGMENTS = deriveBaseSegments();
export const ANALYSIS_DEFAULT_TYPE_SEGMENT = deriveDefaultType().toLowerCase();

export const ANALYSIS_SEGMENTS = ANALYSIS_PATH_BASE_SEGMENTS;

export const ANALYSIS_ROOT_PREFIX = ensureTrailingSlash(ANALYSIS_BASE_PREFIX);
