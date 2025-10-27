/**
 * ブラウザ用APIクライアント
 */
"use client";

import { clientLogger } from "@/lib/logger/client";
import { ApiClient } from "./client";
import type { RequestConfig } from "./types";

export class BrowserApiClient extends ApiClient {
  private csrfToken: string | null = null;

  constructor(baseURL?: string) {
    super(
      baseURL ||
        `${typeof window !== "undefined" ? window.location.origin : ""}/api`,
      clientLogger.child({ component: "BrowserApiClient" }),
    );

    // CSRFトークンの初期化
    if (typeof window !== "undefined") {
      this.initializeCsrfToken();
    }
  }

  /**
   * CSRFトークンの初期化
   */
  private initializeCsrfToken(): void {
    // metaタグから取得
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) {
      this.csrfToken = metaTag.getAttribute("content");
    }

    // Cookieから取得
    if (!this.csrfToken) {
      const match = document.cookie.match(/csrf-token=([^;]+)/);
      if (match) {
        this.csrfToken = match[1];
      }
    }
  }

  /**
   * ブラウザ用: 認証トークン取得
   */
  protected getAuthToken(): string | null {
    if (typeof window === "undefined") {
      return null;
    }

    // 優先順位: sessionStorage > localStorage > cookie
    let token = sessionStorage.getItem("auth-token");

    if (!token) {
      token = localStorage.getItem("auth-token");
    }

    if (!token) {
      const match = document.cookie.match(/auth-token=([^;]+)/);
      if (match) {
        token = match[1];
      }
    }

    if (token) {
      this.logger.debug("Auth token found");
    }

    return token;
  }

  /**
   * 認証トークンの保存
   */
  setAuthToken(token: string, persistent = false): void {
    if (typeof window === "undefined") {
      return;
    }

    if (persistent) {
      localStorage.setItem("auth-token", token);
      sessionStorage.removeItem("auth-token");
    } else {
      sessionStorage.setItem("auth-token", token);
      localStorage.removeItem("auth-token");
    }

    this.logger.info("Auth token saved", { persistent });
  }

  /**
   * 認証トークンの削除
   */
  clearAuthToken(): void {
    if (typeof window === "undefined") {
      return;
    }

    sessionStorage.removeItem("auth-token");
    localStorage.removeItem("auth-token");

    const cookieStore = (
      window as Window & {
        cookieStore?: { delete(name: string): Promise<void> };
      }
    ).cookieStore;

    if (cookieStore?.delete) {
      void cookieStore.delete("auth-token");
    } else {
      const cookieSetter = Object.getOwnPropertyDescriptor(
        Document.prototype,
        "cookie",
      )?.set;

      if (cookieSetter) {
        cookieSetter.call(
          document,
          "auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;",
        );
      }
    }

    this.logger.info("Auth token cleared");
  }

  /**
   * リクエスト前処理（認証・CSRF対策）
   */
  protected async beforeRequest(
    url: string,
    config: RequestConfig,
  ): Promise<RequestConfig> {
    // 親クラスの前処理を実行
    const processedConfig = await super.beforeRequest(url, config);

    // 認証トークンの追加
    const token = this.getAuthToken();
    if (token) {
      processedConfig.headers = {
        ...processedConfig.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    // CSRF対策
    if (
      this.csrfToken &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(processedConfig.method || "")
    ) {
      processedConfig.headers = {
        ...processedConfig.headers,
        "X-CSRF-Token": this.csrfToken,
      };
    }

    // ブラウザ専用ヘッダー
    processedConfig.headers = {
      ...processedConfig.headers,
      "X-Requested-With": "XMLHttpRequest",
      "X-Client-Version": process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
    };

    // credentials設定（Cookie送信）
    processedConfig.credentials = processedConfig.credentials || "same-origin";

    return processedConfig;
  }

  /**
   * ファイルアップロード
   */
  async uploadFile(
    endpoint: string,
    file: File,
    // biome-ignore lint/suspicious/noExplicitAny: FormData can contain various value types
    additionalData?: Record<string, any>,
    config?: Omit<RequestConfig, "method" | "body">,
  ): Promise<unknown> {
    const formData = new FormData();
    formData.append("file", file);

    if (additionalData) {
      for (const [key, value] of Object.entries(additionalData)) {
        formData.append(
          key,
          typeof value === "object" ? JSON.stringify(value) : String(value),
        );
      }
    }

    // Content-Typeを削除してブラウザに任せる
    const { "Content-Type": _, ...headersWithoutContentType } =
      (config?.headers || {}) as Record<string, string>;
    const headers = headersWithoutContentType;

    const url = this.buildUrl(endpoint, config?.params);
    const finalConfig = await this.beforeRequest(url, {
      ...config,
      method: "POST",
      headers,
    });

    const response = await fetch(url, {
      ...finalConfig,
      body: formData,
    } as RequestInit);

    return this.handleResponse(response);
  }

  /**
   * プログレス付きファイルアップロード
   */
  async uploadFileWithProgress(
    endpoint: string,
    file: File,
    onProgress?: (progress: number) => void,
    additionalData?: Record<string, unknown>,
    config?: Omit<RequestConfig, "method" | "body">,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();

        // プログレスイベント
        if (onProgress) {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const progress = (e.loaded / e.total) * 100;
              onProgress(progress);
            }
          });
        }

        // 完了イベント
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch {
              resolve(xhr.responseText);
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        });

        // エラーイベント
        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed"));
        });

        // リクエスト準備
        const url = this.buildUrl(endpoint, config?.params);

        // beforeRequestを先に実行
        this.beforeRequest(url, {
          ...config,
          method: "POST",
        })
          .then((finalConfig) => {
            xhr.open("POST", url);

            // ヘッダー設定
            for (const [key, value] of Object.entries(
              finalConfig.headers || {},
            )) {
              if (key !== "Content-Type") {
                xhr.setRequestHeader(key, String(value));
              }
            }

            // FormData準備
            const formData = new FormData();
            formData.append("file", file);

            if (additionalData) {
              for (const [key, value] of Object.entries(additionalData)) {
                formData.append(
                  key,
                  typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value),
                );
              }
            }

            // 送信
            xhr.send(formData);
          })
          .catch((error) => {
            reject(error);
          });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * EventSource接続（Server-Sent Events）
   */
  createEventSource(
    endpoint: string,
    config?: {
      params?: Record<string, string | number>;
      onMessage?: (event: MessageEvent) => void;
      onError?: (error: Event) => void;
      onOpen?: (event: Event) => void;
    },
  ): EventSource {
    const url = this.buildUrl(endpoint, config?.params);
    const token = this.getAuthToken();

    // EventSourceはヘッダーを送れないので、トークンはURLパラメータで送る
    const finalUrl = token
      ? `${url}${url.includes("?") ? "&" : "?"}token=${token}`
      : url;

    const eventSource = new EventSource(finalUrl);

    if (config?.onMessage) {
      eventSource.onmessage = config.onMessage;
    }

    if (config?.onError) {
      eventSource.onerror = config.onError;
    }

    if (config?.onOpen) {
      eventSource.onopen = config.onOpen;
    }

    this.logger.info("EventSource created", { url });

    return eventSource;
  }
}

// シングルトンインスタンス
let browserApiInstance: BrowserApiClient | null = null;

export function getBrowserApi(): BrowserApiClient {
  if (!browserApiInstance) {
    browserApiInstance = new BrowserApiClient();
  }
  return browserApiInstance;
}

// エクスポート
export const browserApi = getBrowserApi();
