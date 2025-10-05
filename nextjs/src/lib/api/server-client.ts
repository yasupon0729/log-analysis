import { cookies } from "next/headers";
import { logger as serverLogger } from "@/lib/logger/server";
import { ApiClient } from "./client";
import type { RequestConfig } from "./types";

export class ServerApiClient extends ApiClient {
  constructor(baseURL?: string) {
    super(
      baseURL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        process.env.API_BASE_URL ||
        "http://localhost:3729/api",
      serverLogger.child({ component: "ServerApiClient" }),
    );
  }

  /**
   * サーバーサイド専用: 認証トークン取得
   */
  protected async getAuthToken(): Promise<string | null> {
    try {
      const cookieStore = await cookies();
      const authToken = cookieStore.get("auth-token");

      if (authToken?.value) {
        this.logger.debug("Auth token found in cookies");
        return authToken.value;
      }

      // 環境変数からAPIキーを取得（S3アクセスなど用）
      if (process.env.API_KEY) {
        this.logger.debug("Using API key from environment");
        return process.env.API_KEY;
      }

      return null;
    } catch (error) {
      this.logger.error("Failed to get auth token", { error });
      return null;
    }
  }

  /**
   * リクエスト前処理（認証ヘッダー追加）
   */
  protected async beforeRequest(
    url: string,
    config: RequestConfig,
  ): Promise<RequestConfig> {
    // 親クラスの前処理を実行
    const processedConfig = await super.beforeRequest(url, config);

    const serverConfig: RequestConfig = {
      ...processedConfig,
      headers: {
        ...processedConfig.headers,
      },
    };

    // 認証トークンの追加
    const token = await this.getAuthToken();
    if (token) {
      serverConfig.headers = {
        ...serverConfig.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    // サーバーサイド専用ヘッダー
    serverConfig.headers = {
      ...serverConfig.headers,
      "X-Server-Request": "true",
      "X-Request-Id": crypto.randomUUID(),
    };

    // Next.js キャッシュ設定
    if (
      serverConfig.cache &&
      typeof serverConfig.cache === "object" &&
      "ttl" in serverConfig.cache
    ) {
      const cacheConfig = serverConfig.cache;

      // Next.js fetch キャッシュオプション
      serverConfig.next = {
        revalidate: cacheConfig.ttl ? Math.floor(cacheConfig.ttl / 1000) : 60,
        tags: cacheConfig.key ? [cacheConfig.key] : undefined,
      };
    }

    return serverConfig;
  }

  /**
   * サーバーアクション用メソッド
   */
  async serverAction<T>(
    action: string,
    data?: unknown,
    config?: Omit<RequestConfig, "method">,
  ): Promise<T> {
    return this.post<T>(`/actions/${action}`, data, {
      ...config,
      headers: {
        ...config?.headers,
        "X-Server-Action": "true",
      },
    });
  }

  /**
   * ストリーミングレスポンス取得
   */
  async stream(
    endpoint: string,
    config?: Omit<RequestConfig, "method">,
  ): Promise<ReadableStream> {
    const url = this.buildUrl(endpoint, config?.params);
    const finalConfig = await this.beforeRequest(url, {
      ...config,
      method: "GET",
      headers: {
        ...this.defaultHeaders,
        ...config?.headers,
        Accept: "text/event-stream",
      },
    });

    // fetchに渡す際にRequestInitに変換
    const fetchConfig: RequestInit = {
      ...finalConfig,
      cache:
        typeof finalConfig.cache === "string" ? finalConfig.cache : "no-store",
    };
    const response = await fetch(url, fetchConfig);

    if (!response.ok) {
      const error = await this.createError(response);
      this.logger.error("Stream request failed", { error: error.toJSON() });
      throw error;
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    return response.body;
  }
}

// シングルトンインスタンス（デフォルトAPI用）
let serverApiInstance: ServerApiClient | null = null;

export function getServerApi(): ServerApiClient {
  if (!serverApiInstance) {
    serverApiInstance = new ServerApiClient();
  }
  return serverApiInstance;
}

// エクスポート
export const serverApi = getServerApi();
