import { LogEntriesTable } from "@/components/logs/LogEntriesTable";
import type { SupportedFileType } from "@/lib/logs/file-types";
import { css } from "@/styled-system/css";
import {
  uploadLogViewerRecipe,
  uploadResultHeaderRecipe,
  uploadResultMetadataGridRecipe,
  uploadResultSectionRecipe,
  uploadResultTitleRecipe,
} from "@/styles/recipes/components/upload-log-client.recipe";

export interface LogDecodeSource {
  name: string;
  fileType: SupportedFileType;
  originalSize: number;
  processedSize: number;
  logSize: number;
  didDecompress: boolean;
}

export interface LogDecodeResult {
  filename: string;
  logText: string;
  encryptedSize: number;
  decryptedSize: number;
  logSize: number;
  didDecompress: boolean;
  sources?: LogDecodeSource[];
}

interface LogDecodeResultViewProps {
  result: LogDecodeResult;
  showRawLog?: boolean;
}

export function LogDecodeResultView({
  result,
  showRawLog = true,
}: LogDecodeResultViewProps) {
  return (
    <section className={uploadResultSectionRecipe()}>
      <header className={uploadResultHeaderRecipe()}>
        <h2 className={uploadResultTitleRecipe()}>{result.filename}</h2>
        <div className={uploadResultMetadataGridRecipe()}>
          <span>暗号化サイズ: {formatBytes(result.encryptedSize)}</span>
          <span>復号後サイズ: {formatBytes(result.decryptedSize)}</span>
          <span>ログサイズ: {formatBytes(result.logSize)}</span>
          <span>解凍状態: {result.didDecompress ? "解凍済み" : "未解凍"}</span>
        </div>
      </header>

      {result.sources && result.sources.length > 0 ? (
        <div className={sourceListClass}>
          <h3 className={sourceTitleClass}>ファイル詳細</h3>
          <ul className={sourceItemsClass}>
            {result.sources.map((source) => (
              <li key={`${source.name}-${source.processedSize}`}>
                <span className={sourceNameClass}>{source.name}</span>
                <span>種別: {source.fileType}</span>
                <span>元サイズ: {formatBytes(source.originalSize)}</span>
                <span>
                  処理後サイズ: {formatBytes(source.processedSize)} / ログ:
                  {formatBytes(source.logSize)}
                </span>
                <span>
                  解凍: {source.didDecompress ? "解凍済み" : "未解凍"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <LogEntriesTable logText={result.logText} />

      {showRawLog ? (
        <details className={rawLogDetailsClass}>
          <summary className={rawLogSummaryClass}>生のテキストを表示</summary>
          <pre className={uploadLogViewerRecipe()}>{result.logText}</pre>
        </details>
      ) : null}
    </section>
  );
}

const rawLogDetailsClass = css({
  marginTop: 4,
  borderTop: "thin",
  borderColor: "border.subtle",
  paddingTop: 4,
  color: "text.secondary",
});

const rawLogSummaryClass = css({
  cursor: "pointer",
  fontWeight: "medium",
  color: "primary.200",
  marginBottom: 3,
  _hover: {
    color: "primary.100",
  },
});

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let size = value;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const sourceListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  marginBottom: 4,
});

const sourceTitleClass = css({
  fontSize: "md",
  fontWeight: "semibold",
});

const sourceItemsClass = css({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 2,
});

const sourceNameClass = css({
  fontWeight: "medium",
});
