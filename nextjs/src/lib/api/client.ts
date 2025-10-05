/**
 * 基底APIクライアントクラス
 */

import type { LoggerWrapper } from "@/lib/logger/wrapper";
import { ApiError, NetworkError, TimeoutError } from "./error";
import type { InternalRequestConfig, RequestConfig } from "./types";

export abstract class ApiClient {
  protected readonly baseURL: string;
  protected readonly logger: LoggerWrapper;
  protected readonly defaultHeaders: HeadersInit;
  // biome-ignore lint/suspicious/noExplicitAny: Cache can store various response types
  private requestCache: Map<string, Promise<any>>;
  // biome-ignore lint/suspicious/noExplicitAny: Deduplication needs to handle various response types
  private requestDeduplication: Map<string, Promise<any>>;

  constructor(baseURL: string, logger: LoggerWrapper) {
    this.baseURL = baseURL;
    this.logger = logger;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    this.requestCache = new Map();
    this.requestDeduplication = new Map();
  }

  /**
   * リクエスト前処理
   */
  protected async beforeRequest(
    url: string,
    config: RequestConfig,
  ): Promise<RequestConfig> {
    this.logger.debug("API Request", {
      url,
      method: config.method || "GET",
      headers: config.headers,
      params: config.params,
    });

    // タイムアウト設定
    if (config.timeout) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      // 元のsignalがある場合は両方を監視
      if (config.signal) {
        const originalSignal = config.signal;
        config.signal = controller.signal;
        originalSignal.addEventListener("abort", () => controller.abort());
      } else {
        config.signal = controller.signal;
      }

      // タイムアウトのクリーンアップ
      controller.signal.addEventListener("abort", () =>
        clearTimeout(timeoutId),
      );
    }

    return config;
  }

  /**
   * レスポンス処理
   */
  protected async handleResponse<T>(response: Response): Promise<T> {
    // エラーレスポンスの処理
    if (!response.ok) {
      const error = await this.createError(response);
      this.logger.error("API Error", {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        error: error.toJSON(),
      });
      throw error;
    }

    // 成功レスポンスの処理
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      return response.json();
    }
    if (contentType?.includes("text/")) {
      // biome-ignore lint/suspicious/noExplicitAny: Text response type varies by endpoint
      return response.text() as any;
    }
    if (response.status === 204) {
      // biome-ignore lint/suspicious/noExplicitAny: Null response for 204 status
      return null as any; // No Content
    }
    // biome-ignore lint/suspicious/noExplicitAny: Blob response type varies
    return response.blob() as any;
  }

  /**
   * エラーオブジェクト生成
   */
  protected async createError(response: Response): Promise<ApiError> {
    let body = "";

    try {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const json = await response.json();
        body = JSON.stringify(json);
      } else {
        body = await response.text();
      }
    } catch (e) {
      this.logger.warn("Failed to parse error response", { error: e });
    }

    return new ApiError(
      response.status,
      response.statusText,
      body,
      response.url,
    );
  }

  /**
   * URLとパラメータを結合
   */

  // biome-ignore lint/suspicious/noExplicitAny: Query params can have various types
  protected buildUrl(endpoint: string, params?: Record<string, any>): string {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseURL}${endpoint}`;

    if (!params) return url;

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  /**
   * リトライ処理
   */
  protected async retryRequest<T>(
    endpoint: string,
    config: RequestConfig,
    attempt = 1,
  ): Promise<T> {
    const retryConfig = config.retry;

    if (!retryConfig || attempt > retryConfig.count) {
      throw new Error("Max retry attempts reached");
    }

    const delay = retryConfig.delay * 2 ** (attempt - 1); // 指数バックオフ

    this.logger.info("Retrying request", {
      endpoint,
      attempt,
      delay,
      maxAttempts: retryConfig.count,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    return this.request<T>(endpoint, {
      ...config,
      retry: {
        ...retryConfig,
        count: retryConfig.count - attempt,
      },
    });
  }

  /**
   * 汎用リクエストメソッド
   */
  async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const url = this.buildUrl(endpoint, config.params);

    // キャッシュチェック
    const cacheConfig =
      typeof config.cache === "object" &&
      config.cache !== null &&
      "ttl" in config.cache
        ? config.cache
        : null;
    const cacheKey = cacheConfig?.key || `${config.method || "GET"}-${url}`;

    if (cacheConfig?.key && this.requestCache.has(cacheKey)) {
      this.logger.debug("Cache hit", { cacheKey });
      const cachedResult = this.requestCache.get(cacheKey);
      if (!cachedResult) {
        throw new Error("Cache key exists but value is undefined");
      }
      return cachedResult as T;
    }

    // リクエスト重複排除
    if (this.requestDeduplication.has(cacheKey)) {
      this.logger.debug("Request deduplication", { cacheKey });
      const dedupResult = this.requestDeduplication.get(cacheKey);
      if (!dedupResult) {
        throw new Error("Deduplication key exists but value is undefined");
      }
      return dedupResult;
    }

    // リクエスト設定準備
    const finalConfig = await this.beforeRequest(url, {
      ...config,
      headers: {
        ...this.defaultHeaders,
        ...config.headers,
      },
    });

    // リクエスト実行（fetchに渡す際にRequestInitに変換）
    const fetchConfig: RequestInit = {
      ...finalConfig,
      cache:
        typeof finalConfig.cache === "string" ? finalConfig.cache : undefined,
    };
    const requestPromise = fetch(url, fetchConfig)
      .then((res) => this.handleResponse<T>(res))
      .catch(async (error) => {
        // ネットワークエラーやタイムアウトの処理
        if (error.name === "AbortError") {
          throw new TimeoutError(url, config.timeout || 0);
        }
        if (error instanceof TypeError && error.message.includes("fetch")) {
          throw new NetworkError(error.message, url);
        }

        // リトライ判定
        const shouldRetry =
          config.retry &&
          config.retry.count > 0 &&
          error instanceof ApiError &&
          (error.isServerError() ||
            error.isTimeout() ||
            config.retry.retryOn?.includes(error.status));

        if (shouldRetry) {
          return this.retryRequest<T>(endpoint, config);
        }

        throw error;
      })
      .finally(() => {
        // 重複排除のクリーンアップ
        this.requestDeduplication.delete(cacheKey);
      });

    // 重複排除に登録
    this.requestDeduplication.set(cacheKey, requestPromise);

    // キャッシュ保存
    if (cacheConfig?.ttl) {
      this.requestCache.set(cacheKey, requestPromise);
      setTimeout(() => {
        this.requestCache.delete(cacheKey);
        this.logger.debug("Cache expired", { cacheKey });
      }, cacheConfig.ttl);
    }

    return requestPromise;
  }

  /**
   * 便利メソッド
   */
  get<T>(
    endpoint: string,
    config?: Omit<RequestConfig, "method" | "body">,
  ): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "GET" });
  }

  post<T>(
    endpoint: string,
    // biome-ignore lint/suspicious/noExplicitAny: Request body data can be of various types
    data?: any,
    config?: Omit<RequestConfig, "method">,
  ): Promise<T> {
    const requestConfig: InternalRequestConfig = {
      ...config,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    };
    return this.request<T>(endpoint, requestConfig as RequestConfig);
  }

  put<T>(
    endpoint: string,
    // biome-ignore lint/suspicious/noExplicitAny: Request body data can be of various types
    data?: any,
    config?: Omit<RequestConfig, "method">,
  ): Promise<T> {
    const requestConfig: InternalRequestConfig = {
      ...config,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    };
    return this.request<T>(endpoint, requestConfig as RequestConfig);
  }

  patch<T>(
    endpoint: string,
    // biome-ignore lint/suspicious/noExplicitAny: Request body data can be of various types
    data?: any,
    config?: Omit<RequestConfig, "method">,
  ): Promise<T> {
    const requestConfig: InternalRequestConfig = {
      ...config,
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    };
    return this.request<T>(endpoint, requestConfig as RequestConfig);
  }

  delete<T>(
    endpoint: string,
    config?: Omit<RequestConfig, "method">,
  ): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "DELETE" });
  }

  /**
   * キャッシュクリア
   */
  clearCache(key?: string): void {
    if (key) {
      this.requestCache.delete(key);
      this.logger.debug("Cache cleared", { key });
    } else {
      this.requestCache.clear();
      this.logger.debug("All cache cleared");
    }
  }
}
