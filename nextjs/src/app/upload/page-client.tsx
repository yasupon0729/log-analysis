"use client";

import { useCallback, useState } from "react";

import {
  type LogDecodeResult,
  LogDecodeResultView,
  type LogDecodeSource,
} from "@/components/logs/LogDecodeResultView";
import { LogFileDropZone } from "@/components/upload/LogFileDropZone";
import {
  S3LogFetcher,
  type S3LogEnvironment,
} from "@/components/upload/S3LogFetcher";
import { UploadIntro } from "@/components/upload/UploadIntro";
import { logger } from "@/lib/logger/client";
import {
  detectFileTypeFromName,
  SUPPORTED_EXTENSIONS_DESCRIPTION,
  SUPPORTED_FILE_ACCEPT,
} from "@/lib/logs/file-types";
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
  sources?: LogDecodeSource[];
}

interface DecodeError {
  ok: false;
  error: string;
}

type DecodeResponse = DecodeSuccess | DecodeError;

interface S3SuccessResponse {
  ok: true;
  startDate: string;
  endDate: string;
  requestedDates: string[];
  fetchedDates: string[];
  missingDates: string[];
  logText: string;
  encryptedSize: number;
  decryptedSize: number;
  logSize: number;
  didDecompress: boolean;
  sources: LogDecodeSource[];
}

interface S3ErrorResponse {
  ok: false;
  error: string;
}

type S3Response = S3SuccessResponse | S3ErrorResponse;

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
        const fileType = detectFileTypeFromName(file.name);
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

        const decodeResult: LogDecodeResult = {
          filename: file.name,
          logText: data.logText,
          encryptedSize: data.encryptedSize,
          decryptedSize: data.decryptedSize,
          logSize: data.logSize,
          didDecompress: data.didDecompress,
          sources: data.sources,
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

  const fetchFromS3 = useCallback(
    async ({
      startDate,
      endDate,
      environment,
    }: {
      startDate: string;
      endDate: string;
      environment: S3LogEnvironment;
    }) => {
      resetState();
      setIsLoading(true);

      try {
        const search = new URLSearchParams({
          startDate,
          endDate,
          environment,
        });
        const response = await fetch(`/api/logs/s3?${search.toString()}`);
        const data = (await response.json()) as S3Response;

        if (!response.ok || !data.ok) {
          const message = data.ok
            ? `S3ログ取得でエラーが発生しました (${response.status})`
            : data.error;
          setErrorMessage(message);
          logger.error("S3 log fetch failed", {
            component: "UploadLogClient",
            startDate,
            endDate,
            environment,
            status: response.status,
            error: message,
          });
          return;
        }

        const rangeLabel =
          data.startDate === data.endDate
            ? data.startDate
            : `${data.startDate}〜${data.endDate}`;
        const decodeResult: LogDecodeResult = {
          filename: `S3 ${rangeLabel}`,
          logText: data.logText,
          encryptedSize: data.encryptedSize,
          decryptedSize: data.decryptedSize,
          logSize: data.logSize,
          didDecompress: data.didDecompress,
          sources: data.sources,
        };

        setResult(decodeResult);
        logger.info("S3 log fetch succeeded", {
          component: "UploadLogClient",
          startDate: data.startDate,
          endDate: data.endDate,
          environment,
          requestedDates: data.requestedDates,
          fetchedDates: data.fetchedDates,
          missingDates: data.missingDates,
          objectCount: data.sources.length,
        });

        if (data.missingDates.length > 0) {
          setErrorMessage(
            `${data.missingDates.join(", ")} のログは見つかりませんでした`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "S3ログ取得でエラーが発生しました";
        setErrorMessage(message);
        logger.error("S3 log fetch threw", {
          component: "UploadLogClient",
          error: message,
          startDate,
          endDate,
          environment,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [resetState],
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
        accept={SUPPORTED_FILE_ACCEPT}
        isLoading={isLoading}
        onFilesSelected={handleFiles}
      />

      <S3LogFetcher isLoading={isLoading} onFetch={fetchFromS3} />

      {errorMessage ? (
        <div className={uploadErrorAlertRecipe()}>
          <strong>エラー:</strong> {errorMessage}
        </div>
      ) : null}

      {result ? <LogDecodeResultView result={result} /> : null}
    </div>
  );
}
