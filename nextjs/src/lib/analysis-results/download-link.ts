interface DerivedAnalysisIdentifiers {
  userId: string;
  analysisId: string;
  prefix: string;
}

const DOWNLOAD_LINK_PATTERN =
  /product\/user\/(?<userId>\d+)\/analysis_result\/main\/(?<analysisId>\d+)\/.+$/;

function normalizeDownloadLink(raw?: string | null): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.pathname.replace(/^\/+/, "");
  } catch {
    return trimmed.replace(/^\/+/, "");
  }
}

export function deriveAnalysisIdentifiersFromDownloadLink(
  downloadLink?: string | null,
): DerivedAnalysisIdentifiers | null {
  const normalized = normalizeDownloadLink(downloadLink);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(DOWNLOAD_LINK_PATTERN);
  if (!match || !match.groups) {
    return null;
  }

  const { userId, analysisId } = match.groups;
  if (!userId || !analysisId) {
    return null;
  }

  return {
    userId,
    analysisId,
    prefix: `product/user/${userId}/analysis_result/main/${analysisId}/`,
  };
}

export type { DerivedAnalysisIdentifiers };
