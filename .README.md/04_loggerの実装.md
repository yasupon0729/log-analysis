# 04. Logger の実装

## 概要

Next.js アプリケーションにおいて、クライアントサイドとサーバーサイドの両方でファイル出力可能なロガーシステムを構築します。

## 技術選定

### Pino を選択した理由

1. **高パフォーマンス**: Winston より約 5 倍高速
2. **低オーバーヘッド**: 本番環境での CPU・メモリ使用量が少ない
3. **構造化ログ**: JSON 形式のネイティブサポート
4. **Worker Thread**: Transport が別スレッドで動作し、メインプロセスをブロックしない
5. **Next.js 互換性**: Next.js 15 での動作実績多数

### Winston との比較

| 項目 | Pino | Winston |
|------|------|---------|
| パフォーマンス | 高速 (5x) | 普通 |
| メモリ使用量 | 少ない | 多い |
| 機能の豊富さ | 必要十分 | 豊富 |
| 学習曲線 | シンプル | 複雑 |
| ファイルローテーション | pino-roll | winston-daily-rotate-file |

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Application                 │
├─────────────────────────┬───────────────────────────┤
│     Client (Browser)     │      Server (Node.js)     │
├─────────────────────────┼───────────────────────────┤
│                         │                           │
│  ClientLogger           │  ServerLogger             │
│  ├─ Console Output     │  ├─ Console Transport     │
│  └─ API Transport ──────┼──→─ File Transport        │
│     (browser mode)      │     └─ pino-roll          │
│                         │        (ローテーション)    │
└─────────────────────────┴───────────────────────────┘
                               ↓
                    logs/
                    ├── server/
                    │   ├── 2024-01-15.log
                    │   └── 2024-01-16.log
                    └── client/
                        ├── 2024-01-15.log
                        └── 2024-01-16.log
```

## バンドル問題の解決策

### 問題の概要
Pino は Node.js 専用のライブラリで、`fs`、`path`、`thread-stream` などの Node.js モジュールを使用します。これらをクライアントサイドでバンドルしようとすると、以下のエラーが発生します：

```
Module not found: Can't resolve 'fs'
Module not found: Can't resolve 'path'
Module not found: Can't resolve 'thread-stream'
```

### 解決方法

#### 1. Next.js 設定（next.config.js）
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 15 では serverExternalPackages を使用
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'pino-roll',
    'thread-stream',
    'pino-worker',
    'pino-file'
  ],

  // Webpack 設定でクライアントサイドのバンドルを制御
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // クライアントサイドでは Node.js モジュールを無効化
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        net: false,
        tls: false,
        child_process: false,
        worker_threads: false,
      };
    } else {
      // サーバーサイドでは externals として扱う
      config.externals.push({
        'thread-stream': 'commonjs thread-stream',
        'pino-pretty': 'commonjs pino-pretty',
        'pino-roll': 'commonjs pino-roll',
        'encoding': 'commonjs encoding'
      });
    }

    return config;
  }
};

module.exports = nextConfig;
```

#### 2. 環境別インポートの分離
```typescript
// src/lib/logger/index.ts
// 条件付きエクスポートで環境を判定
export const logger = typeof window === 'undefined'
  ? require('./server').logger
  : require('./client').logger;
```

## 実装方針

### LoggerWrapper によるフォーマット統一

#### 概要
すべてのログ出力を統一されたフォーマットで管理するため、`LoggerWrapper`クラスを実装。
timestampやデフォルトメタデータ（source, environment）を自動的に付与。

```typescript
// src/lib/logger/wrapper.ts
export class LoggerWrapper {
  private logger: Logger;
  private defaultMetadata: LogMetadata;

  constructor(logger: Logger, defaultMetadata: LogMetadata = {}) {
    this.logger = logger;
    this.defaultMetadata = defaultMetadata;
  }

  info(message: string, metadata?: LogMetadata) {
    this.logger.info({
      message,
      ...this.defaultMetadata,
      ...metadata,
    });
  }
  // error, warn, debug, fatal, trace も同様
}
```

### 使用方法

```typescript
// 基本的な使い方
logger.info("メッセージ", { オプショナルなメタデータ });

// 実際の例
logger.info("Home page loaded", {
  page: "/",
  type: "page_load",
});

// 自動的に付与されるフィールド：
// - timestamp: ISO 8601形式のタイムスタンプ
// - source: "server" または "client"
// - environment: "development" または "production"
// - level: ログレベル
```

### 1. サーバーサイド Logger

#### 基本設定（環境別の最適化）
```typescript
// src/lib/logger/server.ts
import { join } from "node:path";
import pino from "pino";

// 本番環境での動作を確実にするため、条件分岐で設定
const isDevelopment = process.env.NODE_ENV === "development";

// 環境に応じてloggerを作成
export const logger = isDevelopment
  ? // 開発環境: トランスポート使用（コンソール + ファイル）
    pino({
      level: process.env.LOG_LEVEL || "debug",
      transport: {
        targets: [
          // コンソール出力（カラー表示）
          {
            target: "pino-pretty",
            level: "debug",
            options: {
              colorize: true,
              ignore: "pid,hostname",
              translateTime: "yyyy-mm-dd HH:MM:ss.l",
            },
          },
          // ファイル出力（app-dev.log）
          {
            target: "pino/file",
            level: "debug",
            options: {
              destination: join(process.cwd(), "logs", "server", "app-dev.log"),
              mkdir: true,
            },
          },
        ],
      },
    })
  : // 本番環境: パフォーマンス重視（トランスポートなし）
    pino(
      {
        level: process.env.LOG_LEVEL || "info",
        formatters: {
          level: (label) => ({ level: label }),
          bindings: () => ({
            pid: process.pid,
            hostname: process.env.HOSTNAME || "localhost",
            environment: "production",
          }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      // 本番環境では直接ファイル出力（高速）
      pino.destination({
        dest: join(process.cwd(), "logs", "server", "app-prod.log"),
        sync: false,
        mkdir: true,
      })
    );

// ログレベルのエイリアス
export const serverLogger = pinoLogger;

// ラッパーをインポート
import { LoggerWrapper } from "./wrapper";

// デフォルトメタデータ付きのラッパーを作成（既存のloggerを上書き）
export const logger = new LoggerWrapper(pinoLogger, {
  source: "server",
  environment: process.env.NODE_ENV || "development",
});

// テスト用ログ（新しいフォーマット）
logger.info("Logger initialized", {
  logLevel: pinoLogger.level,
});
```

#### Next.js への統合
```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logger } = await import('./lib/logger/server');

    // グローバルエラーハンドリング
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught Exception');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled Rejection');
    });
  }
}
```

### 2. クライアントサイド Logger

#### 基本設定（Browser モード使用）
```typescript
// src/lib/logger/client.ts
import pino from 'pino';

// 開発環境かどうかを判定
const isDevelopment = process.env.NODE_ENV === 'development';

const logger = pino({
  browser: {
    // オブジェクト形式でログを出力
    asObject: true,

    // シリアライザーを有効化（エラーオブジェクトなど）
    serialize: true,

    // 開発環境ではコンソールにも出力
    write: isDevelopment ? {
      info: (o) => console.info('[INFO]', o),
      error: (o) => console.error('[ERROR]', o),
      debug: (o) => console.debug('[DEBUG]', o),
      warn: (o) => console.warn('[WARN]', o),
    } : undefined,

    // サーバーへの送信設定
    transmit: {
      level: isDevelopment ? 'debug' : 'info',
      send: async function (level, logEvent) {
        // バッファリングの実装（オプション）
        const buffer = [];
        buffer.push({
          ...logEvent,
          level: level.label,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        });

        // バッチ送信（1秒ごと or 10件ごと）
        if (buffer.length >= 10 || isDevelopment) {
          const body = JSON.stringify(buffer);
          buffer.length = 0; // クリア

          try {
            await fetch('/api/logs', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body,
            });
          } catch (error) {
            // 送信失敗時はコンソールに出力
            console.error('Failed to send logs:', error);
            // ローカルストレージにバックアップ（オプション）
            const failedLogs = JSON.parse(
              localStorage.getItem('failedLogs') || '[]'
            );
            failedLogs.push(...buffer);
            localStorage.setItem('failedLogs', JSON.stringify(failedLogs));
          }
        }
      }
    }
  }
});

export { logger };
```

#### API エンドポイント（バッチ処理対応）
```typescript
// src/app/api/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger/server';
import pino from 'pino';
import { join } from 'path';
import { z } from 'zod';

// クライアントログ用の専用 logger インスタンス（シングルトン）
const isDevelopment = process.env.NODE_ENV === "development";
const clientFileLogger = pino(
  {
    // timeフィールドを適切にフォーマット
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.transport({
    targets: [
      // クライアントログ専用ファイル（シンプルなファイル出力）
      {
        target: "pino/file",
        level: isDevelopment ? "debug" : "info",
        options: {
          destination: join(
            process.cwd(),
            "logs",
            "client",
            `app-${isDevelopment ? "dev" : "prod"}.log`
          ),
          mkdir: true,
        },
      },
    ],
  }),
);

// ログスキーマ（バリデーション）
const logSchema = z.object({
  level: z.object({
    label: z.string(),
    value: z.number(),
  }),
  messages: z.array(z.any()).optional(),
  bindings: z.array(z.record(z.any())).optional(),
  ts: z.number().optional(),
  timestamp: z.string(),
  userAgent: z.string().optional(),
  url: z.string().optional(),
});

// バッチ処理対応
const batchLogSchema = z.array(logSchema);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 単一ログ or バッチログを判定
    const logs = Array.isArray(body)
      ? batchLogSchema.parse(body)
      : [logSchema.parse(body)];

    // IP アドレスを取得
    const ip = req.headers.get('x-forwarded-for') ||
               req.headers.get('x-real-ip') ||
               'unknown';

    // 各ログを処理
    for (const log of logs) {
      const enrichedLog = {
        ...log,
        source: 'client',
        ip,
      };

      // レベルに応じて適切なメソッドを使用
      const level = log.level.label.toLowerCase();
      const logMethod = clientFileLogger[level] || clientFileLogger.info;

      // ファイルに出力
      logMethod.bind(clientFileLogger)(enrichedLog);

      // サーバーログにも記録（監視用）
      if (level === 'error' || level === 'fatal') {
        logger.error("Client error logged", { clientLog: enrichedLog });
      }
    }

    return NextResponse.json({
      success: true,
      processed: logs.length
    });
  } catch (error) {
    logger.error("Failed to process client logs", { error });
    return NextResponse.json(
      { error: 'Invalid log format' },
      { status: 400 }
    );
  }
}

// Rate Limiting（オプション）
export const runtime = 'nodejs';
export const maxDuration = 10; // 10秒でタイムアウト
```

### 3. ログ管理

#### 現在の実装
```typescript
// ファイル名形式（固定）
// 開発環境: app-dev.log
// 本番環境: app-prod.log

// 注意事項:
// - pino-rollの日付フォーマット問題により、シンプルな固定ファイル名方式を採用
// - timestampフィールドは pino.stdTimeFunctions.isoTime で自動付与
// - ログローテーションが必要な場合は、外部ツール（logrotate等）を使用

// ログファイルの場所
logs/
├── server/
│   ├── app-dev.log   # 開発環境サーバーログ
│   └── app-prod.log  # 本番環境サーバーログ
└── client/
    ├── app-dev.log   # 開発環境クライアントログ
    └── app-prod.log  # 本番環境クライアントログ
```

#### プロセス管理コマンド
```json
// package.json
{
  "scripts": {
    "kill": "lsof -t -i:3000 | xargs kill -9 2>/dev/null || echo 'No process found on port 3000'"
  }
}
```

使用方法:
```bash
bun run kill  # ポート3000のプロセスを終了
```

#### 自動削除スクリプト
```typescript
// scripts/clean-logs.ts
import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';

const LOG_RETENTION_DAYS = 30;

async function cleanOldLogs() {
  const logDirs = ['logs/server', 'logs/client'];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);

  for (const dir of logDirs) {
    const files = await readdir(dir);

    for (const file of files) {
      const filePath = join(dir, file);
      const stats = await stat(filePath);

      if (stats.mtime < cutoffDate) {
        await unlink(filePath);
        console.log(`Deleted old log: ${filePath}`);
      }
    }
  }
}

// cron job として実行
cleanOldLogs().catch(console.error);
```

### 4. 使用方法

#### サーバーサイド
```typescript
// src/app/page.tsx
import { logger } from '@/lib/logger/server';

export default function Home() {
  // 新しいフォーマット: メッセージ + オプショナルなメタデータ
  logger.info("Home page loaded (server-side)", {
    page: "/",
    type: "page_load",
  });

  logger.debug("Server environment info", {
    nodeVersion: process.version,
  });

  return <HomeClient />;
}
```

#### クライアントサイド
```typescript
// src/app/page-client.tsx
'use client';

import { logger } from '@/lib/logger/client';

export default function HomeClient() {
  useEffect(() => {
    // 新しいフォーマット: メッセージ + オプショナルなメタデータ
    logger.info("Home page loaded (client-side)", {
      page: "/",
      type: "page_load",
    });

    logger.debug("Component mounted", {
      component: "HomePage",
      debugInfo: {
        renderCount: 1,
      },
    });
  }, []);

  const handleCardClick = (cardType: string) => {
    logger.info(`User clicked ${cardType} card`, {
      event: "card_click",
      cardType,
    });
  };

  return (
    <button onClick={() => handleCardClick("primary")}>
      Click me
    </button>
  );
}
```

## 環境変数設定

```env
# .env.local
LOG_LEVEL=debug        # development
LOG_MAX_FILES=30       # 保持する最大ファイル数
LOG_FILE_SIZE=10m      # ファイルサイズ上限
LOG_COMPRESS=true      # 古いログの圧縮
```

## パッケージインストール

```bash
# 必要なパッケージ
bun add pino pino-roll pino-pretty
bun add -D @types/pino

# オプション（クライアントログのバリデーション）
bun add zod
```

## 設定ファイル

### Next.js 設定
```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 15 では serverExternalPackages を使用
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'pino-roll',
    'thread-stream',
    'pino-worker',
    'pino-file'
  ],

  // Webpack 設定でクライアントサイドのバンドルを制御
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // クライアントサイドでは Node.js モジュールを無効化
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        net: false,
        tls: false,
        child_process: false,
        worker_threads: false,
      };
    } else {
      // サーバーサイドでは externals として扱う
      config.externals.push({
        'thread-stream': 'commonjs thread-stream',
        'pino-pretty': 'commonjs pino-pretty',
        'pino-roll': 'commonjs pino-roll',
        'encoding': 'commonjs encoding'
      });
    }

    return config;
  }
};

module.exports = nextConfig;
```

## セキュリティ考慮事項

1. **クライアントログの検証**: 必ず zod などでバリデーション
2. **Rate Limiting**: `/api/logs` エンドポイントにレート制限
3. **認証**: 必要に応じて認証を追加
4. **機密情報**: ログに含めない（パスワード、トークンなど）
5. **GDPR/個人情報**: IP アドレスなどの取り扱いに注意

## パフォーマンス最適化

1. **Worker Thread 使用**: pino.transport で自動的に別スレッド
2. **バッファリング**: クライアントでバッファして一括送信
3. **非同期処理**: ログ処理でメインプロセスをブロックしない
4. **条件付きログ**: 本番環境では debug レベルを無効化

## モニタリング

1. **ログレベル分布**: error/warn/info の割合を監視
2. **ディスク使用量**: ログディレクトリのサイズ監視
3. **エラーレート**: error ログの増加を検知
4. **パフォーマンス**: ログ処理の遅延を測定

## トラブルシューティング

### よくある問題と解決策

#### 1. バンドルエラー
**問題**: `Module not found: Can't resolve 'fs'` エラー
```
Module not found: Can't resolve 'fs'
Module not found: Can't resolve 'path'
Module not found: Can't resolve 'thread-stream'
```

**解決策**:
- next.config.js の `serverExternalPackages` と `webpack` 設定を確認
- クライアントコンポーネントで直接 pino をインポートしていないか確認
- 条件付きインポート（`typeof window === 'undefined'`）を使用

#### 2. クライアントサイドでのエラー
**問題**: クライアントで pino が動作しない

**解決策**:
```typescript
// ❌ Bad: 直接インポート
import { logger } from '@/lib/logger/server';

// ✅ Good: 環境別インポート
import { logger } from '@/lib/logger'; // index.ts で環境判定
```

#### 3. ログファイルが作成されない
**問題**: logs ディレクトリやファイルが生成されない

**解決策**:
- 書き込み権限の確認: `chmod -R 755 logs/`
- `mkdir: true` オプションが設定されているか確認
- 相対パスではなく `process.cwd()` を使用

#### 4. メモリリーク
**問題**: Transport が適切に終了しない

**解決策**:
```typescript
// アプリケーション終了時
process.on('SIGTERM', () => {
  logger.flush(); // バッファをフラッシュ
  logger.end();   // Transport を閉じる
});
```

#### 5. タイムゾーン問題
**問題**: ログの timestamp が UTC になる

**解決策**:
```typescript
// JST で出力する設定
timestamp: () => `,"time":"${new Date().toLocaleString('ja-JP')}"`,
```

## まとめ

### 実装のポイント

1. **高パフォーマンス**: Pino による低オーバーヘッドなロギング
2. **統一フォーマット**: LoggerWrapper による一貫性のあるログ出力
3. **自動メタデータ**: timestamp, source, environment を自動付与
4. **シンプルなAPI**: `logger.info(message, metadata?)` 形式
5. **環境別最適化**: 開発環境と本番環境で異なる設定
6. **バンドル問題の解決**: Next.js 15 対応の設定で fs エラーを回避
7. **プロセス管理**: `bun run kill` でポート3000のプロセスを簡単に終了

### 重要な設定

- **serverExternalPackages**: Pino 関連パッケージをサーバー専用として扱う
- **webpack.resolve.fallback**: クライアントで Node.js モジュールを無効化
- **LoggerWrapper**: メッセージとメタデータを分離した統一API
- **固定ファイル名**: pino-rollの問題回避のため、app-dev.log / app-prod.log 形式を採用
- **timestamp設定**: `pino.stdTimeFunctions.isoTime` で ISO 8601 形式に統一

### Next.js 15 との互換性

- `serverExternalPackages` の使用（experimental 不要）
- App Router との完全な互換性
- RSC（React Server Components）対応
- Edge Runtime での制限を考慮した設計

この実装方針により、Next.js 15 環境でクライアント・サーバー両方のログを確実にファイル出力できる、堅牢なロギングシステムを構築できます。