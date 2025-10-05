/**
 * API共通型定義
 */

export interface RequestConfig extends Omit<RequestInit, "body" | "cache"> {
  /** タイムアウト時間（ミリ秒） */
  timeout?: number;

  /** リトライ設定 */
  retry?: {
    /** リトライ回数 */
    count: number;
    /** リトライ間隔（ミリ秒） */
    delay: number;
    /** リトライ対象のステータスコード */
    retryOn?: number[];
  };

  /** キャッシュ設定 */
  cache?:
    | {
        /** キャッシュTTL（ミリ秒） */
        ttl?: number;
        /** キャッシュキー */
        key?: string;
      }
    | RequestCache;

  /** クエリパラメータ */
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * 内部で使用するリクエスト設定（bodyを含む）
 */
export interface InternalRequestConfig extends RequestConfig {
  body?: BodyInit | null;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  status: number;
  timestamp: string;
}
