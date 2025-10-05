import type { Buffer } from "node:buffer";
import type { Readable } from "node:stream";

export type S3Body = string | Uint8Array | Buffer | Readable | Blob;

export interface S3ClientConfig {
  /** 既定で操作対象とするバケット名 */
  bucket?: string;
  /** 接続先リージョン（未指定時は環境変数 AWS_REGION を使用） */
  region?: string;
  /** 既定で付与するキーのプレフィックス（フォルダ相当） */
  prefix?: string;
  /** カスタムエンドポイント（ローカルスタック等） */
  endpoint?: string;
  /** パススタイルアクセスを強制するかどうか */
  forcePathStyle?: boolean;
}

export interface S3ListObjectsOptions {
  /** プレフィックスで絞り込み */
  prefix?: string;
  /** 続きを取得する際のトークン */
  continuationToken?: string;
  /** 取得件数の上限 */
  maxKeys?: number;
}

export interface S3ObjectSummary {
  /** デフォルトのプレフィックスを除いたキー */
  key: string;
  /** 実際のS3キー（バケット内絶対パス） */
  fullKey: string;
  /** 最終更新日時（ISO文字列） */
  lastModified?: string;
  /** サイズ（バイト） */
  size?: number;
  /** ETag（引用符は取り除いた値） */
  etag?: string;
  /** ストレージクラス */
  storageClass?: string;
}

export interface S3ListObjectsResult {
  objects: S3ObjectSummary[];
  nextContinuationToken?: string;
  isTruncated: boolean;
}

export interface S3GetObjectOptions {
  key: string;
  /** Range ヘッダー相当の指定が必要な場合に使用 */
  range?: string;
}

export interface S3GetObjectResult {
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  etag?: string;
  lastModified?: string;
  contentLength?: number;
}

export interface S3PutObjectOptions {
  key: string;
  body: S3Body;
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  acl?: import("@aws-sdk/client-s3").ObjectCannedACL;
  contentEncoding?: string;
}

export interface S3DeleteObjectsResult {
  deleted: string[];
  errors: Array<{
    key: string;
    message: string;
  }>;
}

export interface S3HeadObjectResult {
  key: string;
  exists: boolean;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  metadata?: Record<string, string>;
}

export interface LogRetrievalOptions extends S3GetObjectOptions {
  encoding?: BufferEncoding;
  decompress?: boolean;
  encryptionKey?: Buffer | string;
}

export interface LogRetrievalResult {
  key: string;
  encryptedSize: number;
  decryptedSize: number;
  logSize: number;
  logBuffer: Buffer;
  logText: string;
  metadata?: Record<string, string>;
  etag?: string;
  lastModified?: string;
  contentType?: string;
  contentLength?: number;
  didDecompress: boolean;
}
