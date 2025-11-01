import "server-only";

import { performance } from "node:perf_hooks";
import {
  createPool,
  type Pool,
  type PoolOptions,
  type RowDataPacket,
} from "mysql2/promise";
import { logger } from "@/lib/logger/server";

const log = logger.child({ component: "MySqlClient" });

type QueryValues = Parameters<Pool["query"]>[1];

const READ_ONLY_PREFIXES = ["select", "with", "show", "describe", "explain"];

let pool: Pool | null = null;

function ensureServerContext() {
  if (typeof window !== "undefined") {
    throw new Error("MySQLクライアントはサーバー環境のみで利用してください");
  }
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}

function isEnvPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 3306;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("MYSQL_PORT は正の整数を指定してください");
  }
  return parsed;
}

function parsePoolSize(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("MYSQL_POOL_SIZE は正の整数を指定してください");
  }
  return parsed;
}

function sanitizeQuery(sql: string): string {
  return (
    sql
      // ブロックコメントの除去
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      // 行コメントの除去
      .replace(/--.*$/gm, " ")
      .trim()
      .replace(/\s+/g, " ")
  );
}

function assertReadOnly(sql: string) {
  const normalized = sanitizeQuery(sql).toLowerCase();
  if (!READ_ONLY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error("読み取り専用クエリのみ実行できます");
  }
}

function buildPoolOptions(): PoolOptions {
  const host = getEnv("MYSQL_HOST");
  const user = getEnv("MYSQL_USER");
  const password = getEnv("MYSQL_PASSWORD");
  const database = getEnv("MYSQL_DATABASE");
  const port = parsePort(process.env.MYSQL_PORT);
  const connectionLimit = parsePoolSize(process.env.MYSQL_POOL_SIZE) ?? 10;

  return {
    host,
    user,
    password,
    database,
    port,
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    namedPlaceholders: true,
    decimalNumbers: true,
    timezone: process.env.MYSQL_TIMEZONE ?? "Z",
  };
}

function getPool(): Pool {
  ensureServerContext();

  if (!pool) {
    const options = buildPoolOptions();
    log.info("MySQLプールを初期化しました", {
      host: options.host,
      database: options.database,
      port: options.port,
      connectionLimit: options.connectionLimit,
    });
    pool = createPool(options);
  }

  return pool;
}

export async function selectRows<T extends RowDataPacket>(
  sql: string,
  values?: QueryValues,
): Promise<T[]> {
  assertReadOnly(sql);

  const sanitized = sanitizeQuery(sql);
  const client = getPool();
  const startedAt = performance.now();

  try {
    const [rows] = await client.query<T[]>(sql, values);
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    log.debug("読み取りクエリを実行しました", {
      sql: sanitized,
      durationMs,
      rowCount: rows.length,
    });
    return rows;
  } catch (error) {
    log.error("読み取りクエリの実行に失敗しました", {
      sql: sanitized,
      error,
    });
    throw error;
  }
}

export async function selectOne<T extends RowDataPacket>(
  sql: string,
  values?: QueryValues,
): Promise<T | null> {
  const rows = await selectRows<T>(sql, values);
  return rows[0] ?? null;
}

export function getMysqlPool(): Pool {
  return getPool();
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    log.info("MySQLプールをクローズしました");
    pool = null;
  }
}

export function hasMysqlConfiguration(): boolean {
  return (
    isEnvPresent("MYSQL_HOST") &&
    isEnvPresent("MYSQL_USER") &&
    isEnvPresent("MYSQL_PASSWORD") &&
    isEnvPresent("MYSQL_DATABASE")
  );
}
