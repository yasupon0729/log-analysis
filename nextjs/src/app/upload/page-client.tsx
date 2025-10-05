"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useRef, useState } from "react";

import { logger } from "@/lib/logger/client";
import { css } from "@/styled-system/css";

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
      logger.info("Log file selected", {
        component: "UploadLogClient",
        filename: file.name,
        size: file.size,
      });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("decompress", "true");
        formData.append("encoding", "utf8");

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
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 8,
        minHeight: "100%",
      })}
    >
      <section
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: 4,
        })}
      >
        <h1
          className={css({
            fontSize: "2xl",
            fontWeight: "bold",
          })}
        >
          暗号化ログのアップロード検証
        </h1>
        <p
          className={css({
            color: "text.secondary",
            fontSize: "md",
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
          })}
        >
          <span>S3から取得した</span>
          <code
            className={css({
              backgroundColor: "neutral.900",
              borderRadius: "sm",
              paddingInline: 1,
              fontSize: "sm",
            })}
          >
            .log.gz.enc
          </code>
          <span>
            ファイルをドラッグ＆ドロップするか、ファイル選択から読み込むと復号して内容を表示します。
          </span>
        </p>
      </section>

      <button
        type="button"
        onClick={triggerFileDialog}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={css({
          border: "dashed",
          borderRadius: "xl",
          padding: 8,
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s",
          borderColor: isDragging ? "primary.400" : "border.default",
          backgroundColor: isDragging ? "dark.surface" : "transparent",
          opacity: isLoading ? 0.7 : 1,
        })}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".enc,.gz,.log"
          className={css({ display: "none" })}
          onChange={onInputChange}
        />
        <p
          className={css({
            fontSize: "lg",
            fontWeight: "semibold",
            mb: 2,
          })}
        >
          {isLoading ? "復号処理中..." : "ここにファイルをドロップ"}
        </p>
        <p
          className={css({
            color: "text.secondary",
            fontSize: "sm",
          })}
        >
          クリックでファイル選択もできます
        </p>
      </button>

      {errorMessage ? (
        <div
          className={css({
            borderRadius: "md",
            border: "thin",
            borderColor: "error.500",
            backgroundColor: "rgba(220, 38, 38, 0.1)",
            color: "error.100",
            padding: 4,
          })}
        >
          <strong>エラー:</strong> {errorMessage}
        </div>
      ) : null}

      {result ? (
        <section
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: 4,
            border: "thin",
            borderColor: "border.default",
            borderRadius: "lg",
            padding: 6,
            backgroundColor: "dark.surface",
          })}
        >
          <header
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: 2,
            })}
          >
            <h2
              className={css({
                fontSize: "xl",
                fontWeight: "semibold",
              })}
            >
              {result.filename}
            </h2>
            <div
              className={css({
                display: "grid",
                gridTemplateColumns: {
                  base: "repeat(1, minmax(0, 1fr))",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
                color: "text.secondary",
                fontSize: "sm",
              })}
            >
              <span>暗号化サイズ: {formatBytes(result.encryptedSize)}</span>
              <span>復号後サイズ: {formatBytes(result.decryptedSize)}</span>
              <span>ログサイズ: {formatBytes(result.logSize)}</span>
              <span>
                解凍状態: {result.didDecompress ? "解凍済み" : "未解凍"}
              </span>
            </div>
          </header>

          <pre
            className={css({
              maxHeight: "70vh",
              overflow: "auto",
              padding: 4,
              borderRadius: "md",
              backgroundColor: "neutral.900",
              color: "neutral.100",
              fontSize: "sm",
              whiteSpace: "pre-wrap",
              textAlign: "left",
            })}
          >
            {result.logText}
          </pre>
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
