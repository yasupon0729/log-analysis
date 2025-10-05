"use client";

import { useCallback, useState } from "react";

import {
  type LogDecodeResult,
  LogDecodeResultView,
} from "@/components/logs/LogDecodeResultView";
import { LogFileDropZone } from "@/components/upload/LogFileDropZone";
import { UploadIntro } from "@/components/upload/UploadIntro";
import { logger } from "@/lib/logger/client";
import {
  uploadErrorAlertRecipe,
  uploadPageContainerRecipe,
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

type SupportedFileType = "encrypted" | "gzip" | "zip" | "plain";

const SUPPORTED_EXTENSIONS_DESCRIPTION =
  "対応形式: .log.gz.enc / .zip / .gz / .log / .json";

export default function UploadLogClient() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<LogDecodeResult | null>(null);

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
        const decodeResult: LogDecodeResult = {
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

  return (
    <div className={uploadPageContainerRecipe()}>
      <UploadIntro
        title="暗号化ログのアップロード検証"
        description={
          <>
            <span>
              ファイルをドラッグ＆ドロップするか、ファイル選択から読み込むと内容を表示します。
            </span>
            <code>{SUPPORTED_EXTENSIONS_DESCRIPTION}</code>
          </>
        }
      />

      <LogFileDropZone
        accept=".enc,.gz,.log,.json,.zip"
        isLoading={isLoading}
        onFilesSelected={handleFiles}
      />

      {errorMessage ? (
        <div className={uploadErrorAlertRecipe()}>
          <strong>エラー:</strong> {errorMessage}
        </div>
      ) : null}

      {result ? <LogDecodeResultView result={result} /> : null}
    </div>
  );
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
