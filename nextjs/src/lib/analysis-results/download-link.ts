interface DerivedAnalysisIdentifiers {
  userId: string;
  analysisId: string;
  analysisType: string;
  prefix: string;
}

const DOWNLOAD_LINK_PATTERN =
  /product\/user\/(?<userId>\d+)\/analysis_result\/(?<analysisType>[a-zA-Z0-9_-]+)\/(?<analysisId>\d+)\/.+$/i;

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

  const { userId, analysisId, analysisType } = match.groups;
  if (!userId || !analysisId || !analysisType) {
    return null;
  }

  const normalizedType = analysisType.trim().toLowerCase();
  if (!normalizedType) {
    return null;
  }

  return {
    userId,
    analysisId,
    analysisType: normalizedType,
    prefix: `product/user/${userId}/analysis_result/${normalizedType}/${analysisId}/`,
  };
}

export type { DerivedAnalysisIdentifiers };
