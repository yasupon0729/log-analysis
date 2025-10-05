export type SupportedFileType = "encrypted" | "gzip" | "zip" | "plain";

const extensionMapping: Array<{ suffixes: string[]; type: SupportedFileType }> =
  [
    { suffixes: [".log.gz.enc", ".gz.enc"], type: "encrypted" },
    { suffixes: [".enc"], type: "encrypted" },
    { suffixes: [".zip"], type: "zip" },
    { suffixes: [".gz"], type: "gzip" },
    { suffixes: [".log", ".json"], type: "plain" },
  ];

export const SUPPORTED_FILE_ACCEPT = ".enc,.gz,.log,.json,.zip";
export const SUPPORTED_EXTENSIONS_DESCRIPTION =
  "対応形式: .log.gz.enc / .zip / .gz / .log / .json";

export function detectFileTypeFromName(
  filename: string,
): SupportedFileType | null {
  const lower = filename.toLowerCase();
  for (const mapping of extensionMapping) {
    if (mapping.suffixes.some((suffix) => lower.endsWith(suffix))) {
      return mapping.type;
    }
  }
  return null;
}

export function isSupportedFile(filename: string): boolean {
  return detectFileTypeFromName(filename) !== null;
}
