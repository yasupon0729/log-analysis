/**
 * APIエラークラス定義
 */

export class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: string;
  public readonly url: string;
  public readonly timestamp: Date;

  constructor(status: number, statusText: string, body: string, url: string) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.url = url;
    this.timestamp = new Date();

    // スタックトレースを保持
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * エラータイプ判定ヘルパー
   */
  isNotFound(): boolean {
    return this.status === 404;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isBadRequest(): boolean {
    return this.status === 400;
  }

  isConflict(): boolean {
    return this.status === 409;
  }

  isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }

  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  isNetworkError(): boolean {
    return this.status === 0;
  }

  isTimeout(): boolean {
    return this.message.includes("aborted") || this.message.includes("timeout");
  }

  /**
   * エラー情報をJSON形式で取得
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      body: this.body,
      url: this.url,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * ユーザー向けエラーメッセージ生成
   */
  getUserMessage(): string {
    switch (true) {
      case this.isNotFound():
        return "リクエストされたリソースが見つかりませんでした。";
      case this.isUnauthorized():
        return "認証が必要です。ログインしてください。";
      case this.isForbidden():
        return "このリソースへのアクセス権限がありません。";
      case this.isBadRequest():
        return "リクエストが不正です。入力内容を確認してください。";
      case this.isConflict():
        return "競合が発生しました。しばらく待ってから再試行してください。";
      case this.isServerError():
        return "サーバーエラーが発生しました。しばらく待ってから再試行してください。";
      case this.isTimeout():
        return "リクエストがタイムアウトしました。接続を確認してください。";
      case this.isNetworkError():
        return "ネットワークエラーが発生しました。接続を確認してください。";
      default:
        return "エラーが発生しました。しばらく待ってから再試行してください。";
    }
  }
}

/**
 * ネットワークエラークラス
 */
export class NetworkError extends ApiError {
  constructor(message: string, url: string) {
    super(0, "Network Error", message, url);
    this.name = "NetworkError";
  }
}

/**
 * タイムアウトエラークラス
 */
export class TimeoutError extends ApiError {
  constructor(url: string, timeout: number) {
    super(0, "Timeout", `Request timeout after ${timeout}ms`, url);
    this.name = "TimeoutError";
  }
}
