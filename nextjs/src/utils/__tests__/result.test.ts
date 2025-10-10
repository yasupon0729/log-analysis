import { describe, expect, test } from "bun:test";
import { Result } from "../result";

/**
 * Result型のテスト（Pythonのユースケースを忠実に再現）
 */

// Python _complex_operation と同等の関数
interface ComplexData {
  key?: number;
  wrong_key?: number;
}

interface ProcessedResult {
  status: string;
  data: {
    processed_key: number;
    details: {
      nested_key: number;
      more_details: {
        even_more: number;
      };
    };
  };
}

const complexOperation = (data: ComplexData): Result<ProcessedResult> => {
  try {
    // 複雑な計算をシミュレート
    if (!("key" in data) || data.key === undefined) {
      throw new Error("Key 'key' not found in data");
    }

    const result: ProcessedResult = {
      status: "success",
      data: {
        processed_key: data.key * 2,
        details: {
          nested_key: data.key + 10,
          more_details: {
            even_more: data.key * 3,
          },
        },
      },
    };

    return Result.ok(result);
  } catch (error) {
    return Result.err(error as Error);
  }
};

describe("Result type", () => {
  describe("Python equivalent usage", () => {
    test("should work exactly like Python main section", () => {
      // Python: success_data = {"key": 5}
      const successData = { key: 5 };

      // Python: result_1 = _complex_operation(success_data)
      const result1 = complexOperation(successData);

      // Python: if result_1:
      // TypeScript: if (result1.success) {
      if (result1.success) {
        // Python: print(f"成功: {result_1.value}")
        expect(result1.value).toEqual({
          status: "success",
          data: {
            processed_key: 10,
            details: {
              nested_key: 15,
              more_details: {
                even_more: 15,
              },
            },
          },
        });
      } else {
        // この分岐には入らないはず
        throw new Error("成功ケースで失敗判定になった");
      }

      // Python: failure_data = {"wrong_key": 5}
      const failureData = { wrong_key: 5 };

      // Python: result_2 = _complex_operation(failure_data)
      const result2 = complexOperation(failureData);

      // Python: if result_2:
      // TypeScript: if (result2.success) {
      if (result2.success) {
        // この分岐には入らないはず
        throw new Error("失敗ケースで成功判定になった");
      }

      // Python: print(f"エラー: {result_2.error}")
      // Python: print(f"スタックトレース: {result_2.stack_trace}")
      expect(result2.error).toBeInstanceOf(Error);
      expect(result2.error?.message).toBe("Key 'key' not found in data");
      expect(result2.stackTrace).toBeDefined();
      expect(result2.stackTrace).toContain("Key 'key' not found in data");

      // Python: print(f"success_result: {result_1.success}")
      expect(result1.success).toBe(true);

      // Python: print(f"success_result: {result_1.value}")
      // 成功ならvalueを取り出せる
      expect(result1.value.status).toBe("success");
      expect(result1.value.data.processed_key).toBe(10);

      // Python: print(f"failure_result: {result_2.success}")
      expect(result2.success).toBe(false);

      // Python: print(f"failure_result: {result_2.error}\n{result_2.stack_trace}")
      // 失敗ならエラーとスタックトレースを取り出せる
      expect(result2.error).toBeInstanceOf(Error);
      expect(result2.stackTrace).toBeDefined();
    });
  });

  describe("Result.ok", () => {
    test("should create a successful result", () => {
      const result = Result.ok(42);
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
      expect(result.error).toBeUndefined();
      expect(result.stackTrace).toBeUndefined();
    });

    test("should create successful result with complex object", () => {
      const data = { name: "test", value: 123 };
      const result = Result.ok(data);
      expect(result.success).toBe(true);
      expect(result.value).toEqual(data);
      expect(result.error).toBeUndefined();
    });
  });

  describe("Result.err", () => {
    test("should create a failed result with Error", () => {
      const error = new Error("Something went wrong");
      const result = Result.err(error);
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.stackTrace).toBeDefined();
      expect(result.stackTrace).toContain("Something went wrong");
    });

    test("should create a failed result with custom error", () => {
      const customError = {
        type: "validation",
        message: "Invalid input",
      };
      const result = Result.err(customError);
      expect(result.success).toBe(false);
      expect(result.error).toEqual(customError);
      expect(result.stackTrace).toBeDefined();
    });
  });

  describe("success property", () => {
    test("should return true for successful results", () => {
      const result = Result.ok("success");
      expect(result.success).toBe(true);
    });

    test("should return false for failed results", () => {
      const result = Result.err(new Error("failure"));
      expect(result.success).toBe(false);
    });
  });

  describe("value property", () => {
    test("should return the value for successful results", () => {
      const result = Result.ok("test value");
      expect(result.value).toBe("test value");
    });

    test("should throw error for failed results", () => {
      const result = Result.err(new Error("failure"));
      expect(() => result.value).toThrow(
        "Cannot access value on failed Result",
      );
    });
  });

  describe("error property", () => {
    test("should return undefined for successful results", () => {
      const result = Result.ok("success");
      expect(result.error).toBeUndefined();
    });

    test("should return the error for failed results", () => {
      const error = new Error("test error");
      const result = Result.err(error);
      expect(result.error).toBe(error);
    });
  });

  describe("stackTrace property", () => {
    test("should return undefined for successful results", () => {
      const result = Result.ok("success");
      expect(result.stackTrace).toBeUndefined();
    });

    test("should return stack trace for failed results", () => {
      const error = new Error("test error");
      const result = Result.err(error);
      expect(result.stackTrace).toBeDefined();
      expect(result.stackTrace).toContain("test error");
    });

    test("should capture actual error location in stack trace", () => {
      const createError = (): Result<string> => {
        try {
          throw new Error("nested error");
        } catch (error) {
          return Result.err(error as Error);
        }
      };

      const result = createError();
      expect(result.stackTrace).toContain("nested error");
      // スタックトレースに実際のエラー発生場所が含まれることを確認
      expect(result.stackTrace).toContain("result.test.ts");
    });
  });

  describe("Result.isOk", () => {
    test("should return true for successful results", () => {
      const result = Result.ok("success");
      expect(Result.isOk(result)).toBe(true);
    });

    test("should return false for failed results", () => {
      const result = Result.err(new Error("failure"));
      expect(Result.isOk(result)).toBe(false);
    });

    test("should work as type guard", () => {
      const result: Result<string> = Result.ok("test");
      if (Result.isOk(result)) {
        // TypeScriptの型推論により、ここではresult.valueに安全にアクセス可能
        expect(result.value).toBe("test");
      }
    });
  });

  describe("Result.isErr", () => {
    test("should return false for successful results", () => {
      const result = Result.ok("success");
      expect(Result.isErr(result)).toBe(false);
    });

    test("should return true for failed results", () => {
      const result = Result.err(new Error("failure"));
      expect(Result.isErr(result)).toBe(true);
    });

    test("should work as type guard", () => {
      const result: Result<string> = Result.err(new Error("test error"));
      if (Result.isErr(result)) {
        // TypeScriptの型推論により、ここではresult.errorに安全にアクセス可能
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe("Real-world usage patterns", () => {
    test("early return pattern", () => {
      const processUser = (userData: Record<string, unknown>): string => {
        const validationResult = validateUser(userData);
        if (!validationResult.success) {
          return `バリデーションエラー: ${validationResult.error}`;
        }

        const saveResult = saveUser(validationResult.value);
        if (!saveResult.success) {
          return `保存エラー: ${saveResult.error}`;
        }

        return `処理完了: ${saveResult.value}`;
      };

      const validUser = {
        id: 1,
        name: "太郎",
        email: "taro@example.com",
      };
      const invalidUser = {
        id: null,
        name: "太郎",
        email: "taro@example.com",
      };

      expect(processUser(validUser)).toBe(
        "処理完了: ユーザー 太郎 を保存しました",
      );
      expect(processUser(invalidUser)).toBe(
        "バリデーションエラー: Error: IDが必要です",
      );
    });

    test("default value pattern", () => {
      const getConfigValue = (key: string): string => {
        const result = loadConfig(key);
        return result.success ? result.value : "デフォルト値";
      };

      expect(getConfigValue("api_url")).toBe("https://api.example.com");
      expect(getConfigValue("nonexistent")).toBe("デフォルト値");
    });

    test("chained operations", () => {
      const processNumber = (input: string): Result<string> => {
        const parseResult = parseNumber(input);
        if (!parseResult.success) {
          return Result.err<string, Error>(
            parseResult.error || new Error("Unknown parse error"),
          );
        }

        const doubleResult = doubleNumber(parseResult.value);
        if (!doubleResult.success) {
          return Result.err<string, Error>(
            doubleResult.error || new Error("Unknown double error"),
          );
        }

        return Result.ok(`結果: ${doubleResult.value}`);
      };

      const successResult = processNumber("21");
      expect(successResult.success).toBe(true);
      expect(successResult.value).toBe("結果: 42");

      const parseErrorResult = processNumber("abc");
      expect(parseErrorResult.success).toBe(false);
      expect(parseErrorResult.error?.message).toBe("数値として解析できません");

      const rangeErrorResult = processNumber("150");
      expect(rangeErrorResult.success).toBe(false);
      expect(rangeErrorResult.error?.message).toBe("値が大きすぎます");
    });
  });

  describe("Custom error types", () => {
    interface ValidationError {
      type: "validation";
      field: string;
      message: string;
    }

    test("should work with custom error types", () => {
      const validateEmail = (
        email: string,
      ): Result<string, ValidationError> => {
        if (!email.includes("@")) {
          return Result.err({
            type: "validation",
            field: "email",
            message: "無効なメールアドレス",
          });
        }
        return Result.ok(email);
      };

      const successResult = validateEmail("test@example.com");
      expect(successResult.success).toBe(true);
      expect(successResult.value).toBe("test@example.com");

      const errorResult = validateEmail("invalid");
      expect(errorResult.success).toBe(false);
      if (!errorResult.success) {
        expect(errorResult.error?.type).toBe("validation");
        expect(errorResult.error?.field).toBe("email");
        expect(errorResult.error?.message).toBe("無効なメールアドレス");
      }
    });
  });
});

// ヘルパー関数
interface User {
  id: number;
  name: string;
  email: string;
}

const validateUser = (userData: Record<string, unknown>): Result<User> => {
  if (!userData.id || typeof userData.id !== "number") {
    return Result.err(new Error("IDが必要です"));
  }
  if (!userData.name || typeof userData.name !== "string") {
    return Result.err(new Error("名前が必要です"));
  }
  if (!userData.email || typeof userData.email !== "string") {
    return Result.err(new Error("メールアドレスが必要です"));
  }
  return Result.ok({
    id: userData.id,
    name: userData.name,
    email: userData.email,
  });
};

const saveUser = (user: User): Result<string> => {
  if (user.id < 0) {
    return Result.err(new Error("無効なIDです"));
  }
  return Result.ok(`ユーザー ${user.name} を保存しました`);
};

const loadConfig = (key: string): Result<string> => {
  const config: Record<string, string> = {
    api_url: "https://api.example.com",
    timeout: "5000",
  };

  if (key in config) {
    const value = config[key];
    if (value !== undefined) {
      return Result.ok(value);
    }
  }
  return Result.err(new Error(`設定 ${key} が見つかりません`));
};

const parseNumber = (str: string): Result<number> => {
  const num = Number.parseInt(str, 10);
  if (Number.isNaN(num)) {
    return Result.err(new Error("数値として解析できません"));
  }
  return Result.ok(num);
};

const doubleNumber = (num: number): Result<number> => {
  if (num > 100) {
    return Result.err(new Error("値が大きすぎます"));
  }
  return Result.ok(num * 2);
};
