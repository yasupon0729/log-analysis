import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type {
  DeleteObjectsCommandOutput,
  GetObjectCommandOutput,
  _Object as S3Object,
} from "@aws-sdk/client-s3";
import {
  S3Client as AwsS3Client,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "@/lib/logger/server";

import type {
  S3ClientConfig,
  S3CommonPrefixSummary,
  S3DeleteObjectsResult,
  S3GetObjectOptions,
  S3GetObjectResult,
  S3HeadObjectResult,
  S3ListObjectsOptions,
  S3ListObjectsResult,
  S3ObjectSummary,
  S3PutObjectOptions,
} from "./types";

const DEFAULT_REGION = process.env.AWS_REGION || "ap-northeast-1";
const DEFAULT_BUCKET = process.env.S3_LOG_BUCKET || "logs";

type AwsErrorMetadata = {
  requestId?: string;
  extendedRequestId?: string;
  cfId?: string;
  httpStatusCode?: number;
  attempts?: number;
  totalRetryDelay?: number;
};

type AwsErrorLike = {
  name?: string;
  message?: string;
  code?: string;
  Code?: string;
  $fault?: string;
  $metadata?: AwsErrorMetadata;
  $retryable?: {
    throttling?: boolean;
  };
};

function buildAwsErrorMetadata(error: unknown): {
  name?: string;
  message?: string;
  code?: string;
  fault?: string;
  retryable?: { throttling?: boolean };
  metadata?: AwsErrorMetadata;
} {
  if (!error || typeof error !== "object") {
    return {};
  }

  const err = error as AwsErrorLike;
  return {
    name: err.name,
    message: err.message,
    code: err.code ?? err.Code,
    fault: err.$fault,
    retryable: err.$retryable,
    metadata: err.$metadata,
  };
}

export class S3Client {
  private readonly s3: AwsS3Client;
  private readonly logger = logger.child({ component: "S3Client" });
  private readonly bucket: string;
  private readonly region: string;
  private readonly prefix?: string;

  constructor(config: S3ClientConfig = {}) {
    this.bucket = config.bucket || DEFAULT_BUCKET;
    this.region = config.region || DEFAULT_REGION;
    this.prefix = this.normalizePrefix(config.prefix);

    this.s3 = new AwsS3Client({
      region: this.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
    });

    this.logger.info("S3 client initialized", {
      bucket: this.bucket,
      region: this.region,
      prefix: this.prefix,
      endpoint: config.endpoint,
    });
  }

  async listObjects(
    options: S3ListObjectsOptions = {},
  ): Promise<S3ListObjectsResult> {
    const prefix = this.resolvePrefix(options.prefix);
    try {
      const response = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: options.continuationToken,
          MaxKeys: options.maxKeys,
          Delimiter: options.delimiter,
        }),
      );

      const objects: S3ObjectSummary[] = (response.Contents || [])
        .filter(
          (object): object is S3Object & { Key: string } =>
            typeof object.Key === "string" && object.Key.length > 0,
        )
        .map((object) => this.toSummary(object));

      const commonPrefixes: S3CommonPrefixSummary[] = (
        response.CommonPrefixes || []
      )
        .filter(
          (entry): entry is { Prefix: string } =>
            typeof entry.Prefix === "string" && entry.Prefix.length > 0,
        )
        .map((entry) => ({
          prefix: this.stripPrefix(entry.Prefix),
          fullPrefix: entry.Prefix,
        }));

      this.logger.debug("S3 listObjects", {
        requestPrefix: prefix,
        count: objects.length,
        truncated: Boolean(response.IsTruncated),
        commonPrefixes: commonPrefixes.length,
      });

      return {
        objects,
        commonPrefixes,
        nextContinuationToken: response.NextContinuationToken,
        isTruncated: Boolean(response.IsTruncated),
      };
    } catch (error) {
      this.logAwsError(
        "S3 listObjects failed",
        {
          bucket: this.bucket,
          requestPrefix: prefix,
          continuationToken: options.continuationToken,
          maxKeys: options.maxKeys,
          delimiter: options.delimiter,
        },
        error,
      );
      throw error;
    }
  }

  async getObject(options: S3GetObjectOptions): Promise<S3GetObjectResult> {
    const key = this.resolveKey(options.key);
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: options.range,
        }),
      );

      const body = await this.toBuffer(response);

      this.logger.debug("S3 getObject succeeded", {
        key,
        size: body.byteLength,
      });

      return {
        key: options.key,
        body,
        contentType: response.ContentType || undefined,
        metadata: response.Metadata || undefined,
        etag: this.normalizeEtag(response.ETag),
        lastModified: response.LastModified?.toISOString(),
        contentLength: response.ContentLength ?? body.byteLength,
      };
    } catch (error) {
      this.logAwsError(
        "S3 getObject failed",
        {
          bucket: this.bucket,
          key,
          requestedKey: options.key,
          range: options.range,
        },
        error,
      );
      throw error;
    }
  }

  async getObjectStream(
    options: S3GetObjectOptions,
  ): Promise<GetObjectCommandOutput["Body"]> {
    const key = this.resolveKey(options.key);
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: options.range,
        }),
      );

      this.logger.debug("S3 getObjectStream prepared", { key });
      return response.Body;
    } catch (error) {
      this.logAwsError(
        "S3 getObjectStream failed",
        {
          bucket: this.bucket,
          key,
          requestedKey: options.key,
          range: options.range,
        },
        error,
      );
      throw error;
    }
  }

  async putObject(options: S3PutObjectOptions): Promise<{ etag?: string }> {
    const key = this.resolveKey(options.key);
    try {
      const response = await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: options.body,
          ContentType: options.contentType,
          Metadata: options.metadata,
          CacheControl: options.cacheControl,
          ACL: options.acl,
          ContentEncoding: options.contentEncoding,
        }),
      );

      this.logger.info("S3 putObject uploaded", {
        key,
        hasMetadata: Boolean(options.metadata),
      });

      return { etag: this.normalizeEtag(response.ETag) };
    } catch (error) {
      this.logAwsError(
        "S3 putObject failed",
        {
          bucket: this.bucket,
          key,
          requestedKey: options.key,
          hasMetadata: Boolean(options.metadata),
          contentType: options.contentType,
        },
        error,
      );
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const resolved = this.resolveKey(key);
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: resolved,
        }),
      );

      this.logger.info("S3 deleteObject completed", { key: resolved });
    } catch (error) {
      this.logAwsError(
        "S3 deleteObject failed",
        { bucket: this.bucket, key: resolved, requestedKey: key },
        error,
      );
      throw error;
    }
  }

  async deleteObjects(keys: string[]): Promise<S3DeleteObjectsResult> {
    if (!keys.length) {
      return { deleted: [], errors: [] };
    }
    try {
      const response = await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: this.resolveKey(key) })),
          },
        }),
      );

      const result = this.normalizeDeleteResult(keys, response);
      this.logger.warn("S3 deleteObjects completed", {
        deleted: result.deleted,
        errorCount: result.errors.length,
      });
      return result;
    } catch (error) {
      this.logAwsError(
        "S3 deleteObjects failed",
        {
          bucket: this.bucket,
          keyCount: keys.length,
        },
        error,
      );
      throw error;
    }
  }

  async headObject(key: string): Promise<S3HeadObjectResult> {
    const resolved = this.resolveKey(key);

    try {
      const response = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: resolved,
        }),
      );

      return {
        key,
        exists: true,
        contentLength: response.ContentLength ?? undefined,
        contentType: response.ContentType ?? undefined,
        etag: this.normalizeEtag(response.ETag),
        lastModified: response.LastModified?.toISOString(),
        metadata: response.Metadata ?? undefined,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) {
        return { key, exists: false };
      }

      this.logAwsError(
        "S3 headObject failed",
        { bucket: this.bucket, key: resolved, requestedKey: key },
        error,
      );
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    // biome-ignore lint/suspicious/noExplicitAny: 診断情報は用途により可変
    details: any;
  }> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return {
        status: "healthy",
        details: {
          bucket: this.bucket,
          region: this.region,
        },
      };
    } catch (error) {
      this.logAwsError(
        "S3 health check failed",
        { bucket: this.bucket, region: this.region },
        error,
      );
      return {
        status: "unhealthy",
        details: {
          bucket: this.bucket,
          region: this.region,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  private resolveKey(key: string): string {
    const normalized = key.replace(/^\/+/, "");
    if (!this.prefix) {
      return normalized;
    }
    return `${this.prefix}/${normalized}`.replace(/\/+/g, "/");
  }

  private resolvePrefix(prefix?: string): string | undefined {
    if (!this.prefix && !prefix) {
      return undefined;
    }

    if (prefix) {
      const normalized = this.normalizePrefix(prefix);
      if (!normalized) {
        return this.prefix;
      }
      if (!this.prefix) {
        return normalized;
      }
      return `${this.prefix}/${normalized}`.replace(/\/+/g, "/");
    }

    return this.prefix;
  }

  private normalizePrefix(prefix?: string): string | undefined {
    if (!prefix) {
      return undefined;
    }
    const trimmed = prefix.replace(/^\/+|\/+$/g, "");
    return trimmed || undefined;
  }

  private logAwsError(
    message: string,
    context: Record<string, unknown>,
    error: unknown,
  ): void {
    this.logger.error(message, {
      ...context,
      error,
      errorMetadata: buildAwsErrorMetadata(error),
    });
  }

  private toSummary(object: S3Object & { Key: string }): S3ObjectSummary {
    const fullKey = object.Key;
    return {
      key: this.stripPrefix(fullKey),
      fullKey,
      lastModified: object.LastModified?.toISOString(),
      size: object.Size ?? undefined,
      etag: this.normalizeEtag(object.ETag),
      storageClass: object.StorageClass,
    };
  }

  private normalizeEtag(etag?: string | null): string | undefined {
    if (!etag) {
      return undefined;
    }
    return etag.replace(/"/g, "");
  }

  private async toBuffer(response: GetObjectCommandOutput): Promise<Buffer> {
    const { Body } = response;

    if (!Body) {
      return Buffer.alloc(0);
    }

    if (Buffer.isBuffer(Body)) {
      return Body;
    }

    if (typeof Body === "string") {
      return Buffer.from(Body);
    }

    if (Body instanceof Uint8Array) {
      return Buffer.from(Body);
    }

    if (Body instanceof Readable) {
      return this.readStream(Body);
    }

    if (typeof (Body as Blob).arrayBuffer === "function") {
      const arrayBuffer = await (Body as Blob).arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    const webStream = Body as unknown as ReadableStream;
    if (
      typeof webStream === "object" &&
      webStream !== null &&
      "getReader" in webStream
    ) {
      return this.readWebStream(webStream);
    }

    return Buffer.alloc(0);
  }

  private async readStream(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks);
  }

  private async readWebStream(stream: ReadableStream): Promise<Buffer> {
    // Node.js 18+ exposes Readable.fromWeb, but older runtimes (or edge builds) may not,
    // so we feature-detect and fall back to manually draining the reader when unavailable.
    const fromWeb = (
      Readable as typeof Readable & {
        fromWeb?: (stream: ReadableStream) => Readable;
      }
    ).fromWeb;

    if (typeof fromWeb === "function") {
      return this.readStream(fromWeb(stream));
    }

    const reader = stream.getReader();
    const chunks: Buffer[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(Buffer.from(value));
      }
    }
    return Buffer.concat(chunks);
  }

  private normalizeDeleteResult(
    originalKeys: string[],
    response: DeleteObjectsCommandOutput,
  ): S3DeleteObjectsResult {
    const deleted = new Set<string>();

    for (const entry of response.Deleted || []) {
      if (entry.Key) {
        deleted.add(this.stripPrefix(entry.Key));
      }
    }

    const errors = (response.Errors || []).map((entry) => ({
      key: entry.Key ? this.stripPrefix(entry.Key) : "",
      message: entry.Message || "Unknown error",
    }));

    for (const key of originalKeys) {
      const hasError = errors.some((error) => error.key === key);
      if (!hasError) {
        deleted.add(key);
      }
    }

    return {
      deleted: Array.from(deleted).filter(Boolean),
      errors,
    };
  }

  private stripPrefix(key: string): string {
    const normalized = key.replace(/^\/+/, "");
    if (!this.prefix) {
      return normalized;
    }

    const expected = `${this.prefix}/`;
    if (normalized.startsWith(expected)) {
      return normalized.slice(expected.length);
    }

    return normalized;
  }
}

let s3ClientInstance: S3Client | null = null;

export function getS3Client(config?: S3ClientConfig): S3Client {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client(config);
  }
  return s3ClientInstance;
}

export const s3Client = getS3Client();
