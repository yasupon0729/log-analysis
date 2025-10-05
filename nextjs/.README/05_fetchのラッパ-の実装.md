# Fetch Wrapper実装分析レポート

## 📊 現状分析

### 既存コードベースの評価
- **LoggerWrapper実装**: 優れたラッパーパターンの実装済み（クラスベース、型安全、拡張可能）
- **TypeScript環境**: 完全に設定済み、型定義の基盤あり
- **Panda CSS**: Zero-runtime CSSで軽量化実現
- **不足要素**: APIクライアント、エラーハンドリング、認証管理

## 🏗️ 推奨アーキテクチャ

### 1. コア設計原則
```typescript
// ベストプラクティスに基づく設計
- ✅ クラスベースアプローチ（LoggerWrapperと一貫性）
- ✅ TypeScript完全対応
- ✅ Server/Client分離実装
- ✅ エラーハンドリングの一元化
- ✅ 自動リトライ機能
- ✅ リクエストインターセプター
```

### 2. ディレクトリ構造提案
```
nextjs/src/lib/api/
├── client.ts          # APIクライアント基底クラス
├── error.ts           # カスタムエラークラス
├── types.ts           # 型定義
├── interceptors.ts    # リクエスト/レスポンス処理
├── server-client.ts   # サーバーサイド用クライアント
├── browser-client.ts  # ブラウザ用クライアント
└── s3/
    ├── client.ts      # S3専用クライアント
    └── types.ts       # S3ログ型定義
```

## 📝 実装提案

### 基底APIクライアントクラス
```typescript
// src/lib/api/client.ts
import { LoggerWrapper } from '@/lib/logger/wrapper';

export interface RequestConfig extends RequestInit {
  timeout?: number;
  retry?: {
    count: number;
    delay: number;
  };
  cache?: {
    ttl?: number;
    key?: string;
  };
}

export class ApiClient {
  private baseURL: string;
  private logger: LoggerWrapper;
  private defaultHeaders: HeadersInit;
  private requestCache: Map<string, Promise<any>>;

  constructor(baseURL: string, logger: LoggerWrapper) {
    this.baseURL = baseURL;
    this.logger = logger;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
    this.requestCache = new Map();
  }

  // リクエスト前処理
  private async beforeRequest(url: string, config: RequestConfig): Promise<RequestConfig> {
    this.logger.debug('API Request', { 
      url, 
      method: config.method || 'GET',
      headers: config.headers 
    });
    
    // タイムアウト設定
    if (config.timeout) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), config.timeout);
      config.signal = controller.signal;
    }

    return config;
  }

  // エラーハンドリング
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await this.createError(response);
      this.logger.error('API Error', {
        status: response.status,
        message: error.message,
        url: response.url
      });
      throw error;
    }

    return response.json();
  }

  // カスタムエラー生成
  private async createError(response: Response): Promise<ApiError> {
    const body = await response.text();
    return new ApiError(
      response.status,
      response.statusText,
      body,
      response.url
    );
  }

  // 汎用リクエストメソッド
  async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    // キャッシュチェック
    if (config.cache?.key && this.requestCache.has(config.cache.key)) {
      return this.requestCache.get(config.cache.key)!;
    }

    const finalConfig = await this.beforeRequest(url, {
      ...config,
      headers: {
        ...this.defaultHeaders,
        ...config.headers,
      },
    });

    const requestPromise = fetch(url, finalConfig)
      .then(res => this.handleResponse<T>(res))
      .catch(error => {
        if (config.retry && config.retry.count > 0) {
          return this.retryRequest<T>(endpoint, {
            ...config,
            retry: {
              ...config.retry,
              count: config.retry.count - 1
            }
          });
        }
        throw error;
      });

    // キャッシュ保存
    if (config.cache?.key) {
      this.requestCache.set(config.cache.key, requestPromise);
      if (config.cache.ttl) {
        setTimeout(() => {
          this.requestCache.delete(config.cache.key!);
        }, config.cache.ttl);
      }
    }

    return requestPromise;
  }

  // リトライ処理
  private async retryRequest<T>(endpoint: string, config: RequestConfig): Promise<T> {
    await new Promise(resolve => setTimeout(resolve, config.retry?.delay || 1000));
    return this.request<T>(endpoint, config);
  }

  // 便利メソッド
  get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }

  post<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }
}
```

### カスタムエラークラス
```typescript
// src/lib/api/error.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string,
    public url: string
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }

  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}
```

### Server/Client分離実装
```typescript
// src/lib/api/server-client.ts
import { ApiClient } from './client';
import { serverLogger } from '@/lib/logger/server';
import { cookies } from 'next/headers';

export class ServerApiClient extends ApiClient {
  constructor(baseURL?: string) {
    super(
      baseURL || process.env.API_BASE_URL || 'http://localhost:3729/api',
      serverLogger
    );
  }

  // サーバーサイド専用: 認証トークン取得
  protected async getAuthToken(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get('auth-token')?.value || null;
  }

  // オーバーライド: 認証ヘッダー追加
  async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const token = await this.getAuthToken();
    
    if (token) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${token}`,
      };
    }

    return super.request<T>(endpoint, config);
  }
}

// シングルトンインスタンス
export const serverApi = new ServerApiClient();
```

```typescript
// src/lib/api/browser-client.ts
'use client';

import { ApiClient } from './client';
import { clientLogger } from '@/lib/logger/client';

export class BrowserApiClient extends ApiClient {
  constructor(baseURL?: string) {
    super(
      baseURL || '/api',
      clientLogger
    );
  }

  // ブラウザ用: localStorage/sessionStorageからトークン取得
  protected getAuthToken(): string | null {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('auth-token');
    }
    return null;
  }

  async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const token = this.getAuthToken();
    
    if (token) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${token}`,
      };
    }

    // CSRF対策
    config.headers = {
      ...config.headers,
      'X-Requested-With': 'XMLHttpRequest',
    };

    return super.request<T>(endpoint, config);
  }
}

// シングルトンインスタンス
export const browserApi = new BrowserApiClient();
```

## 🔧 S3統合実装

### S3専用クライアント
```typescript
// src/lib/api/s3/client.ts
import { ServerApiClient } from '../server-client';
import type { S3LogEntry, S3QueryParams } from './types';

export class S3LogClient extends ServerApiClient {
  constructor() {
    super(process.env.S3_API_ENDPOINT);
  }

  // S3ログ取得（ストリーミング対応）
  async fetchLogs(params: S3QueryParams): Promise<S3LogEntry[]> {
    return this.get<S3LogEntry[]>('/logs', {
      params,
      timeout: 30000, // 30秒タイムアウト
      retry: {
        count: 3,
        delay: 2000
      },
      cache: {
        key: `logs-${JSON.stringify(params)}`,
        ttl: 60000 // 1分キャッシュ
      }
    });
  }

  // ストリーミング取得（大量データ用）
  async *streamLogs(params: S3QueryParams): AsyncGenerator<S3LogEntry> {
    const response = await fetch(`${this.baseURL}/logs/stream?${new URLSearchParams(params)}`);
    
    if (!response.ok || !response.body) {
      throw new ApiError(response.status, response.statusText, '', response.url);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            yield JSON.parse(line);
          } catch (e) {
            this.logger.warn('Failed to parse log line', { line, error: e });
          }
        }
      }
    }
  }
}
```

### 型定義
```typescript
// src/lib/api/s3/types.ts
export interface S3LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
  source: string;
  requestId?: string;
}

export interface S3QueryParams {
  startDate?: string;
  endDate?: string;
  level?: string[];
  source?: string;
  limit?: number;
  offset?: number;
  search?: string;
}
```

## 🚀 使用例

### Server Component
```typescript
// app/logs/page.tsx
import { S3LogClient } from '@/lib/api/s3/client';

export default async function LogsPage() {
  const s3Client = new S3LogClient();
  
  const logs = await s3Client.fetchLogs({
    startDate: new Date(Date.now() - 86400000).toISOString(),
    limit: 100
  });

  return <LogTable logs={logs} />;
}
```

### Client Component
```typescript
// app/components/LogViewer.tsx
'use client';

import { useState, useEffect } from 'react';
import { browserApi } from '@/lib/api/browser-client';

export function LogViewer() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    browserApi.get('/api/logs')
      .then(setLogs)
      .catch(error => console.error('Failed to fetch logs:', error));
  }, []);

  return <div>{/* ログ表示 */}</div>;
}
```

## ✅ ベストプラクティス準拠状況

| 要件 | 実装状況 | 説明 |
|------|---------|------|
| TypeScript型安全性 | ✅ | 完全な型定義、ジェネリクス使用 |
| エラーハンドリング | ✅ | カスタムエラークラス、一元管理 |
| Server/Client分離 | ✅ | 環境別クライアント実装 |
| 認証管理 | ✅ | トークン自動付与、CSRF対策 |
| キャッシング | ✅ | TTL付きメモリキャッシュ |
| リトライ機能 | ✅ | 設定可能な自動リトライ |
| ロギング統合 | ✅ | 既存LoggerWrapperと統合 |
| ストリーミング | ✅ | 大量データ対応 |
| タイムアウト | ✅ | AbortController使用 |

## 🎯 推奨実装順序

1. **Phase 1: 基盤構築**
   - ApiClientクラス実装
   - エラーハンドリング実装
   - 型定義整備

2. **Phase 2: 環境別実装**
   - ServerApiClient実装
   - BrowserApiClient実装
   - 認証機能追加

3. **Phase 3: S3統合**
   - S3LogClient実装
   - ストリーミング機能
   - キャッシュ最適化

4. **Phase 4: 最適化**
   - パフォーマンスチューニング
   - エラー回復機能強化
   - モニタリング追加

## 🔍 注意点

1. **セキュリティ**
   - 環境変数でAPIエンドポイント管理
   - トークンはhttpOnlyクッキー推奨
   - CORS設定の適切な実装

2. **パフォーマンス**
   - 適切なキャッシュTTL設定
   - 並列リクエストの制限
   - メモリリーク防止

3. **保守性**
   - 単体テストの実装
   - エラー境界の設定
   - ドキュメント整備

## 📚 参考実装

記事のベストプラクティスを完全に網羅し、さらに以下を追加：
- LoggerWrapperとの統合
- S3専用の最適化
- ストリーミング対応
- より詳細な型定義
- キャッシュ戦略の改善
