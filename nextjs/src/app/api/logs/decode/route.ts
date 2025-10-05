import { NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { decodeLogBuffer } from "@/lib/logs/decode";
import { ensureLogEncryptionKey } from "@/lib/logs/decoder";
import {
  detectFileTypeFromName,
  type SupportedFileType,
} from "@/lib/logs/file-types";

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

    const overrideValue = formData.get("encryptionKey");
    const decryptKey =
      typeof overrideValue === "string"
        ? ensureLogEncryptionKey(overrideValue)
        : undefined;

    const providedType = parseFileTypeParam(formData.get("fileType"));
    const detectedType =
      providedType ?? detectFileTypeFromName("name" in file ? file.name : "");

    if (!detectedType) {
      throw new Error("ファイル形式を判別できませんでした");
    }

    const shouldDecompressParam = formData.get("decompress");
    const shouldDecompress =
      shouldDecompressParam === null ? true : shouldDecompressParam !== "false";

    const decoded = await decodeLogBuffer({
      buffer: inputBuffer,
      fileType: detectedType,
      encoding,
      encryptionKey: decryptKey,
      decompress: shouldDecompress,
      filename: "name" in file ? file.name : undefined,
    });

    logger.info("Log decode completed", {
      component: "decode-route",
      fileType: detectedType,
      encryptedSize: decoded.encryptedSize,
      decryptedSize: decoded.decryptedSize,
      logSize: decoded.logSize,
      didDecompress: decoded.didDecompress,
      entryCount: decoded.entries.length,
    });

    return NextResponse.json({
      ok: true,
      encryptedSize: decoded.encryptedSize,
      decryptedSize: decoded.decryptedSize,
      logSize: decoded.logSize,
      didDecompress: decoded.didDecompress,
      logText: decoded.logText,
      sources: decoded.entries.map((entry) => ({
        name: entry.name,
        fileType: entry.fileType,
        originalSize: entry.originalSize,
        processedSize: entry.processedSize,
        logSize: entry.logSize,
        didDecompress: entry.didDecompress,
      })),
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
function parseFileTypeParam(
  value: FormDataEntryValue | null,
): SupportedFileType | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (
    normalized === "encrypted" ||
    normalized === "gzip" ||
    normalized === "zip" ||
    normalized === "plain"
  ) {
    return normalized as SupportedFileType;
  }
  return null;
}
