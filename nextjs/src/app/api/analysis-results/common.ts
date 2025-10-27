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

export const ANALYSIS_SEGMENTS =
  ANALYSIS_PATH_SEGMENT.split("/").filter(Boolean);

export const ANALYSIS_ROOT_PREFIX = ensureTrailingSlash(ANALYSIS_BASE_PREFIX);
