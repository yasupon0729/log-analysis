/**
 * ログラッパー - 共通のメタデータを自動追加
 */

import type { Logger } from "pino";

export type LogMetadata = Record<string, unknown>;

export class LoggerWrapper {
  private logger: Logger;
  private defaultMetadata: LogMetadata;

  constructor(logger: Logger, defaultMetadata: LogMetadata = {}) {
    this.logger = logger;
    this.defaultMetadata = defaultMetadata;
  }

  private formatLog(message: string, metadata?: LogMetadata) {
    return {
      message,
      ...this.defaultMetadata,
      ...metadata,
      // timestamp は pino が自動的に追加するため不要
    };
  }

  // ログレベル別メソッド
  info(message: string, metadata?: LogMetadata) {
    this.logger.info(this.formatLog(message, metadata));
  }

  error(message: string, metadata?: LogMetadata) {
    this.logger.error(this.formatLog(message, metadata));
  }

  warn(message: string, metadata?: LogMetadata) {
    this.logger.warn(this.formatLog(message, metadata));
  }

  debug(message: string, metadata?: LogMetadata) {
    this.logger.debug(this.formatLog(message, metadata));
  }

  success(message: string, metadata?: LogMetadata) {
    // successはpinoにはないので、infoレベルで出力
    this.logger.info(this.formatLog(message, { ...metadata, type: 'success' }));
  }

  fatal(message: string, metadata?: LogMetadata) {
    this.logger.fatal(this.formatLog(message, metadata));
  }

  trace(message: string, metadata?: LogMetadata) {
    this.logger.trace(this.formatLog(message, metadata));
  }

  // 子ロガーの作成（追加のコンテキストを持つ）
  child(bindings: LogMetadata): LoggerWrapper {
    return new LoggerWrapper(this.logger.child(bindings), {
      ...this.defaultMetadata,
      ...bindings,
    });
  }
}
