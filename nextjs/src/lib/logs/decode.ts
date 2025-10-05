import { gunzipSync } from "node:zlib";

import JSZip from "jszip";

import { decodeEncryptedLog, ensureLogEncryptionKey } from "@/lib/logs/decoder";

import type { SupportedFileType } from "./file-types";

export interface DecodeLogEntry {
  name: string;
  fileType: SupportedFileType;
  originalSize: number;
  processedSize: number;
  logSize: number;
  didDecompress: boolean;
  logText: string;
}

export interface DecodeLogResult {
  logText: string;
  encryptedSize: number;
  decryptedSize: number;
  logSize: number;
  didDecompress: boolean;
  entries: DecodeLogEntry[];
}

export interface DecodeLogOptions {
  buffer: Buffer;
  fileType: SupportedFileType;
  encoding: BufferEncoding;
  encryptionKey?: Buffer | string;
  decompress?: boolean;
  filename?: string;
}

export async function decodeLogBuffer({
  buffer,
  fileType,
  encoding,
  encryptionKey,
  decompress = true,
  filename,
}: DecodeLogOptions): Promise<DecodeLogResult> {
  switch (fileType) {
    case "encrypted":
      return decodeEncryptedBuffer(buffer, {
        encoding,
        encryptionKey,
        decompress,
        filename,
      });
    case "gzip":
      return decodeGzipBuffer(buffer, { encoding, filename });
    case "plain":
      return decodePlainBuffer(buffer, { encoding, filename });
    case "zip":
      return decodeZipBuffer(buffer, { encoding });
    default:
      throw new Error(`Unsupported file type: ${fileType satisfies never}`);
  }
}

function decodeEncryptedBuffer(
  buffer: Buffer,
  options: {
    encoding: BufferEncoding;
    encryptionKey?: Buffer | string;
    decompress: boolean;
    filename?: string;
  },
): DecodeLogResult {
  const key = ensureLogEncryptionKey(options.encryptionKey);
  const decoded = decodeEncryptedLog(buffer, {
    key,
    encoding: options.encoding,
    decompress: options.decompress,
  });

  const entry: DecodeLogEntry = {
    name: options.filename ?? "uploaded.enc",
    fileType: "encrypted",
    originalSize: buffer.byteLength,
    processedSize: decoded.decryptedBuffer.byteLength,
    logSize: decoded.logBuffer.byteLength,
    didDecompress: decoded.didDecompress,
    logText: decoded.logText,
  };

  return {
    logText: decoded.logText,
    encryptedSize: buffer.byteLength,
    decryptedSize: decoded.decryptedBuffer.byteLength,
    logSize: decoded.logBuffer.byteLength,
    didDecompress: decoded.didDecompress,
    entries: [entry],
  };
}

function decodeGzipBuffer(
  buffer: Buffer,
  options: { encoding: BufferEncoding; filename?: string },
): DecodeLogResult {
  let decompressed: Buffer;
  try {
    decompressed = gunzipSync(buffer);
  } catch (_error) {
    throw new Error("gzipファイルの解凍に失敗しました");
  }

  const logText = decompressed.toString(options.encoding);
  const entry: DecodeLogEntry = {
    name: options.filename ?? "uploaded.gz",
    fileType: "gzip",
    originalSize: buffer.byteLength,
    processedSize: decompressed.byteLength,
    logSize: Buffer.byteLength(logText, options.encoding),
    didDecompress: true,
    logText,
  };

  return {
    logText,
    encryptedSize: buffer.byteLength,
    decryptedSize: decompressed.byteLength,
    logSize: entry.logSize,
    didDecompress: true,
    entries: [entry],
  };
}

function decodePlainBuffer(
  buffer: Buffer,
  options: { encoding: BufferEncoding; filename?: string },
): DecodeLogResult {
  const logText = buffer.toString(options.encoding);
  const entry: DecodeLogEntry = {
    name: options.filename ?? "uploaded.log",
    fileType: "plain",
    originalSize: buffer.byteLength,
    processedSize: buffer.byteLength,
    logSize: Buffer.byteLength(logText, options.encoding),
    didDecompress: false,
    logText,
  };

  return {
    logText,
    encryptedSize: buffer.byteLength,
    decryptedSize: buffer.byteLength,
    logSize: entry.logSize,
    didDecompress: false,
    entries: [entry],
  };
}

async function decodeZipBuffer(
  buffer: Buffer,
  options: { encoding: BufferEncoding },
): Promise<DecodeLogResult> {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter((file) => !file.dir);

  if (files.length === 0) {
    throw new Error("ZIPアーカイブにファイルが含まれていません");
  }

  const parts: string[] = [];
  const entries: DecodeLogEntry[] = [];
  let totalProcessed = 0;

  for (const file of files) {
    const entryBuffer = await file.async("nodebuffer");
    const text = entryBuffer.toString(options.encoding);
    const logSize = Buffer.byteLength(text, options.encoding);

    parts.push(`----- ${file.name} -----\n${text}`);
    totalProcessed += entryBuffer.byteLength;

    entries.push({
      name: file.name,
      fileType: "plain",
      originalSize: entryBuffer.byteLength,
      processedSize: entryBuffer.byteLength,
      logSize,
      didDecompress: false,
      logText: text,
    });
  }

  const logText = parts.join("\n\n");
  const combinedLogSize = Buffer.byteLength(logText, options.encoding);

  return {
    logText,
    encryptedSize: buffer.byteLength,
    decryptedSize: totalProcessed,
    logSize: combinedLogSize,
    didDecompress: true,
    entries,
  };
}
