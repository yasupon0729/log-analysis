"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useRef, useState } from "react";

import { LogEntriesTable } from "@/components/logs/LogEntriesTable";
import { Button } from "@/components/ui/Button";
import { logger } from "@/lib/logger/client";
import { css } from "@/styled-system/css";
import {
  uploadDescriptionCodeRecipe,
  uploadDescriptionRecipe,
  uploadDropZoneRecipe,
  uploadDropZoneSubtitleRecipe,
  uploadDropZoneTitleRecipe,
  uploadErrorAlertRecipe,
  uploadHiddenInputRecipe,
  uploadIntroSectionRecipe,
  uploadLogViewerRecipe,
  uploadPageContainerRecipe,
  uploadResultHeaderRecipe,
  uploadResultMetadataGridRecipe,
  uploadResultSectionRecipe,
  uploadResultTitleRecipe,
  uploadTitleRecipe,
} from "@/styles/recipes/components/upload-log-client.recipe";

interface DecodeSuccess {
  ok: true;
  logText: string;
  encryptedSize: number;
  decryptedSize: number;
  logSize: number;
  didDecompress: boolean;
}

interface DecodeError {
  ok: false;
  error: string;
}

type DecodeResponse = DecodeSuccess | DecodeError;

interface DecodeResult {
  filename: string;
  logText: string;
  encryptedSize: number;
  decryptedSize: number;
  logSize: number;
  didDecompress: boolean;
}

type SupportedFileType = "encrypted" | "gzip" | "zip" | "plain";

const SUPPORTED_EXTENSIONS_DESCRIPTION =
  "対応形式: .log.gz.enc / .zip / .gz / .log / .json";

export default function UploadLogClient() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setErrorMessage(null);
    setResult(null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      resetState();
      setIsLoading(true);

      try {
        const fileType = detectFileType(file.name);
        if (!fileType) {
          const message = "サポートされていないファイル形式です";
          setErrorMessage(message);
          logger.error("Unsupported log file type", {
            component: "UploadLogClient",
            filename: file.name,
          });
          return;
        }

        logger.info("Log file selected", {
          component: "UploadLogClient",
          filename: file.name,
          size: file.size,
          fileType,
        });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("encoding", "utf8");
        formData.append("fileType", fileType);
        formData.append(
          "decompress",
          fileType === "encrypted" || fileType === "gzip" ? "true" : "false",
        );

        const response = await fetch("/api/logs/decode", {
          method: "POST",
          body: formData,
        });

        const data = (await response.json()) as DecodeResponse;
        if (!response.ok) {
          const message = `復号APIでエラーが発生しました (${response.status})`;
          setErrorMessage(message);
          logger.error("Log decode failed", {
            component: "UploadLogClient",
            filename: file.name,
            status: response.status,
            error: message,
          });
          return;
        }

        if (!data.ok) {
          const message = data.error;
          setErrorMessage(message);
          logger.error("Log decode failed", {
            component: "UploadLogClient",
            filename: file.name,
            status: response.status,
            error: message,
          });
          return;
        }

        const success = data;
        const decodeResult: DecodeResult = {
          filename: file.name,
          logText: success.logText,
          encryptedSize: success.encryptedSize,
          decryptedSize: success.decryptedSize,
          logSize: success.logSize,
          didDecompress: success.didDecompress,
        };

        setResult(decodeResult);
        logger.info("Log decode succeeded", {
          component: "UploadLogClient",
          filename: file.name,
          fileType,
          encryptedSize: data.encryptedSize,
          decryptedSize: data.decryptedSize,
          logSize: data.logSize,
          didDecompress: data.didDecompress,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "不明なエラーが発生しました";
        setErrorMessage(message);
        logger.error("Log decode request threw", {
          component: "UploadLogClient",
          error: message,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [resetState],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) {
        setErrorMessage("ファイルが選択されませんでした");
        return;
      }
      void handleFile(file);
    },
    [handleFile],
  );

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files);
      event.target.value = "";
    },
    [handleFiles],
  );

  const onDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      handleFiles(event.dataTransfer?.files ?? null);
    },
    [handleFiles],
  );

  const triggerFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className={uploadPageContainerRecipe()}>
      <section className={uploadIntroSectionRecipe()}>
        <h1 className={uploadTitleRecipe()}>暗号化ログのアップロード検証</h1>
        <p className={uploadDescriptionRecipe()}>
          <span>
            ファイルをドラッグ＆ドロップするか、ファイル選択から読み込むと内容を表示します。
          </span>
          <code className={uploadDescriptionCodeRecipe()}>
            {SUPPORTED_EXTENSIONS_DESCRIPTION}
          </code>
        </p>
      </section>

      <Button
        type="button"
        onClick={triggerFileDialog}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={uploadDropZoneRecipe({
          dragging: isDragging,
          loading: isLoading,
        })}
        variant="unstyled"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".enc,.gz,.log,.json,.zip"
          className={uploadHiddenInputRecipe()}
          onChange={onInputChange}
        />
        <p className={uploadDropZoneTitleRecipe()}>
          {isLoading ? "復号処理中..." : "ここにファイルをドロップ"}
        </p>
        <p className={uploadDropZoneSubtitleRecipe()}>
          クリックでファイル選択もできます
        </p>
      </Button>

      {errorMessage ? (
        <div className={uploadErrorAlertRecipe()}>
          <strong>エラー:</strong> {errorMessage}
        </div>
      ) : null}

      {result ? (
        <section className={uploadResultSectionRecipe()}>
          <header className={uploadResultHeaderRecipe()}>
            <h2 className={uploadResultTitleRecipe()}>{result.filename}</h2>
            <div className={uploadResultMetadataGridRecipe()}>
              <span>暗号化サイズ: {formatBytes(result.encryptedSize)}</span>
              <span>復号後サイズ: {formatBytes(result.decryptedSize)}</span>
              <span>ログサイズ: {formatBytes(result.logSize)}</span>
              <span>
                解凍状態: {result.didDecompress ? "解凍済み" : "未解凍"}
              </span>
            </div>
          </header>

          <LogEntriesTable logText={result.logText} />
          <details className={rawLogDetailsClass}>
            <summary className={rawLogSummaryClass}>
              生のJSONテキストを表示
            </summary>
            <pre className={uploadLogViewerRecipe()}>{result.logText}</pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}

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

function detectFileType(filename: string): SupportedFileType | null {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".log.gz.enc") || lower.endsWith(".gz.enc")) {
    return "encrypted";
  }

  if (lower.endsWith(".enc")) {
    return "encrypted";
  }

  if (lower.endsWith(".zip")) {
    return "zip";
  }

  if (lower.endsWith(".gz")) {
    return "gzip";
  }

  if (lower.endsWith(".log") || lower.endsWith(".json")) {
    return "plain";
  }

  return null;
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
