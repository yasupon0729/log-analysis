import { gunzipSync } from "node:zlib";

import JSZip from "jszip";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { decodeEncryptedLog, ensureLogEncryptionKey } from "@/lib/logs/decoder";

type FileType = "encrypted" | "gzip" | "zip" | "plain";

const SUPPORTED_FILE_TYPES: ReadonlySet<FileType> = new Set([
  "encrypted",
  "gzip",
  "zip",
  "plain",
]);

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "ファイルが送信されていません" },
        { status: 400 },
      );
    }

    const encodingValue = formData.get("encoding");
    const encoding =
      typeof encodingValue === "string" && Buffer.isEncoding(encodingValue)
        ? (encodingValue as BufferEncoding)
        : "utf8";

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const fileType = parseFileType(formData.get("fileType"));

    if (fileType === "encrypted") {
      const decompressValue = formData.get("decompress");
      const shouldDecompress =
        decompressValue === null ? true : decompressValue !== "false";

      const overrideValue = formData.get("encryptionKey");
      const key = ensureLogEncryptionKey(
        typeof overrideValue === "string" ? overrideValue : undefined,
      );

      const decoded = decodeEncryptedLog(inputBuffer, {
        key,
        encoding,
        decompress: shouldDecompress,
      });

      logger.info("Encrypted log decode completed", {
        component: "decode-route",
        encryptedSize: inputBuffer.byteLength,
        decryptedSize: decoded.decryptedBuffer.byteLength,
        logSize: decoded.logBuffer.byteLength,
        didDecompress: decoded.didDecompress,
      });

      return NextResponse.json({
        ok: true,
        encryptedSize: inputBuffer.byteLength,
        decryptedSize: decoded.decryptedBuffer.byteLength,
        logSize: decoded.logBuffer.byteLength,
        didDecompress: decoded.didDecompress,
        logText: decoded.logText,
      });
    }

    if (fileType === "gzip") {
      let decompressed: Buffer;
      try {
        decompressed = gunzipSync(inputBuffer);
      } catch (_error) {
        throw new Error("gzipファイルの解凍に失敗しました");
      }

      const logText = decompressed.toString(encoding);
      const logSize = Buffer.byteLength(logText, encoding);

      logger.info("Gzip log decode completed", {
        component: "decode-route",
        originalSize: inputBuffer.byteLength,
        decompressedSize: decompressed.byteLength,
        logSize,
      });

      return NextResponse.json({
        ok: true,
        encryptedSize: inputBuffer.byteLength,
        decryptedSize: decompressed.byteLength,
        logSize,
        didDecompress: true,
        logText,
      });
    }

    if (fileType === "plain") {
      const logText = inputBuffer.toString(encoding);
      const logSize = Buffer.byteLength(logText, encoding);

      logger.info("Plain log processed", {
        component: "decode-route",
        size: inputBuffer.byteLength,
      });

      return NextResponse.json({
        ok: true,
        encryptedSize: inputBuffer.byteLength,
        decryptedSize: inputBuffer.byteLength,
        logSize,
        didDecompress: false,
        logText,
      });
    }

    // zip
    const zipResult = await decodeZipArchive(inputBuffer, encoding);

    logger.info("Zip log processed", {
      component: "decode-route",
      originalSize: inputBuffer.byteLength,
      aggregatedSize: zipResult.totalSize,
      fileCount: zipResult.fileCount,
    });

    return NextResponse.json({
      ok: true,
      encryptedSize: inputBuffer.byteLength,
      decryptedSize: zipResult.totalSize,
      logSize: Buffer.byteLength(zipResult.logText, encoding),
      didDecompress: true,
      logText: zipResult.logText,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Log decode failed", {
      component: "decode-route",
      error: message,
    });

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

function parseFileType(value: FormDataEntryValue | null): FileType {
  if (
    typeof value === "string" &&
    SUPPORTED_FILE_TYPES.has(value as FileType)
  ) {
    return value as FileType;
  }
  return "encrypted";
}

async function decodeZipArchive(buffer: Buffer, encoding: BufferEncoding) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  if (entries.length === 0) {
    throw new Error("ZIPアーカイブにファイルが含まれていません");
  }

  const parts: string[] = [];
  let totalSize = 0;

  for (const entry of entries) {
    const contentBuffer = await entry.async("nodebuffer");
    const text = contentBuffer.toString(encoding);
    totalSize += contentBuffer.length;
    parts.push(`----- ${entry.name} -----\n${text}`);
  }

  return {
    logText: parts.join("\n\n"),
    totalSize,
    fileCount: entries.length,
  };
}
