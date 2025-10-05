import { decodeEncryptedLog, ensureLogEncryptionKey } from "@/lib/logs/decoder";

import { S3Client } from "./client";
import type {
  LogRetrievalOptions,
  LogRetrievalResult,
  S3ClientConfig,
  S3GetObjectOptions,
} from "./types";

export class EncryptedLogClient extends S3Client {
  private readonly encryptionKey: Buffer;

  constructor(config: S3ClientConfig = {}, encryptionKey?: Buffer | string) {
    super(config);
    this.encryptionKey = ensureLogEncryptionKey(encryptionKey);
  }

  async getDecryptedLog(
    options: LogRetrievalOptions,
  ): Promise<LogRetrievalResult> {
    const request: S3GetObjectOptions = {
      key: options.key,
      range: options.range,
    };
    const object = await super.getObject(request);
    const encryptedBody = object.body;

    const encoding = options.encoding ?? "utf8";
    const effectiveKey = options.encryptionKey
      ? ensureLogEncryptionKey(options.encryptionKey)
      : this.encryptionKey;
    const decoded = decodeEncryptedLog(encryptedBody, {
      key: effectiveKey,
      decompress: options.decompress ?? true,
      encoding,
    });

    return {
      key: options.key,
      encryptedSize: encryptedBody.byteLength,
      decryptedSize: decoded.decryptedBuffer.byteLength,
      logSize: decoded.logBuffer.byteLength,
      logBuffer: decoded.logBuffer,
      logText: decoded.logText,
      metadata: object.metadata,
      etag: object.etag,
      lastModified: object.lastModified,
      contentType: object.contentType,
      contentLength: object.contentLength,
      didDecompress: decoded.didDecompress,
    };
  }
}

let logClientInstance: EncryptedLogClient | null = null;

export function getEncryptedLogClient(
  config?: S3ClientConfig,
  encryptionKey?: Buffer | string,
): EncryptedLogClient {
  if (!logClientInstance) {
    logClientInstance = new EncryptedLogClient(config, encryptionKey);
  }
  return logClientInstance;
}
