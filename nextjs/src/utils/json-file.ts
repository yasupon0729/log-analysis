import { promises as fs, readFileSync, writeFileSync } from "node:fs";
import { Result } from "@/utils/result";

/**
 * JSON/JSONC ファイルを安全に読み書きするためのヘルパークラス。
 * - 行コメント (`// ...`) やブロックコメント (`/* ... *\/`) を含む JSONC 形式に対応。
 * - 末尾カンマ (`{ "foo": 1, }`) を許容し、読み込み前に自動除去。
 * - ファイル入出力と JSON パースのエラーハンドリングに Result 型を採用し、例外を飲み込まず呼び出し側で判定可能にする。
 */
interface WriteOptions {
  /**
   * `JSON.stringify` に渡すインデント幅。既定値は 2。
   */
  spaces?: number;
}

export class JsonFile {
  constructor(private readonly filePath: string) {}

  /**
   * 指定されたパスのファイルを読み込み、Result として返すユーティリティ。
   * 呼び出し側でインスタンス化せずに手早く使用したい場合に便利。
   */
  static async readFrom<T>(filePath: string): Promise<Result<T>> {
    const file = new JsonFile(filePath);
    return file.read<T>();
  }

  /**
   * JSON 文字列を直接パースする。コメント除去や末尾カンマ補正を内部で行う。
   */
  static parse<T>(content: string): Result<T> {
    try {
      const cleaned = removeTrailingCommas(stripJsonComments(content));
      const parsed = JSON.parse(cleaned) as T;
      return Result.ok(parsed);
    } catch (error) {
      return Result.err(error as Error);
    }
  }

  /**
   * ファイルを非同期で読み込み、Result 型で返す。
   */
  async read<T>(): Promise<Result<T>> {
    try {
      const content = await fs.readFile(this.filePath, "utf8");
      return JsonFile.parse<T>(content);
    } catch (error) {
      return Result.err(error as Error);
    }
  }

  /**
   * ファイルを同期的に読み込み、Result 型で返す。
   * CLI スクリプトの初期化など、同期 I/O の方が扱いやすい場面向け。
   */
  readSync<T>(): Result<T> {
    try {
      const content = readFileSync(this.filePath, "utf8");
      return JsonFile.parse<T>(content);
    } catch (error) {
      return Result.err(error as Error);
    }
  }

  /**
   * JSON を非同期で書き出す。成功/失敗は Result で返される。
   */
  async write(
    data: unknown,
    options: WriteOptions = {},
  ): Promise<Result<void>> {
    try {
      const spaces = options.spaces ?? 2;
      const serialized = `${JSON.stringify(data, null, spaces)}\n`;
      await fs.writeFile(this.filePath, serialized, "utf8");
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error as Error);
    }
  }

  /**
   * JSON を同期的に書き出す。CLI などで即時終了させたい場合に利用。
   */
  writeSync(data: unknown, options: WriteOptions = {}): Result<void> {
    try {
      const spaces = options.spaces ?? 2;
      const serialized = `${JSON.stringify(data, null, spaces)}\n`;
      writeFileSync(this.filePath, serialized, "utf8");
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error as Error);
    }
  }
}

/**
 * JSON 文字列から `//` や `/* *\/` 形式のコメントを除去する。
 * 文字列リテラル内の `//` を誤検知しないように状態を追跡する。
 */
function stripJsonComments(source: string): string {
  let insideString = false;
  let insideComment: "single" | "multi" | null = null;
  let result = "";

  for (let i = 0; i < source.length; i++) {
    const current = source[i];
    const next = source[i + 1];
    const previous = source[i - 1];

    if (insideComment === "single") {
      if (current === "\n") {
        insideComment = null;
        result += current;
      }
      continue;
    }

    if (insideComment === "multi") {
      if (current === "*" && next === "/") {
        insideComment = null;
        i++;
      }
      continue;
    }

    if (!insideString) {
      if (current === "/" && next === "/") {
        insideComment = "single";
        i++;
        continue;
      }
      if (current === "/" && next === "*") {
        insideComment = "multi";
        i++;
        continue;
      }
    }

    if (current === '"' && previous !== "\\") {
      insideString = !insideString;
    }

    result += current;
  }

  return result;
}

/**
 * オブジェクト/配列リテラルの末尾カンマを削除する。
 * 文字列リテラル内のカンマは無視し、閉じ括弧直前のもののみ対象。
 */
function removeTrailingCommas(source: string): string {
  let insideString = false;
  let result = "";

  for (let i = 0; i < source.length; i++) {
    const current = source[i];
    const previous = i > 0 ? source[i - 1] : "";

    if (current === '"' && previous !== "\\") {
      insideString = !insideString;
    }

    if (!insideString && current === ",") {
      let j = i + 1;
      while (j < source.length) {
        const lookahead = source[j];
        if (lookahead === undefined || !/\s/.test(lookahead)) {
          break;
        }
        j++;
      }
      const next = j < source.length ? source[j] : "";
      if (next === "}" || next === "]") {
        continue;
      }
    }

    result += current;
  }

  return result;
}
