import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getDefaultAWSConfig, RETRY_CONFIG } from "../aws-config";

describe("AWS Config", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数を保存
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  describe("getDefaultAWSConfig", () => {
    it("should use AWS_REGION from environment", () => {
      process.env.AWS_REGION = "eu-west-1";
      const config = getDefaultAWSConfig();
      expect(config.region).toBe("eu-west-1");
    });

    it("should include credentials when available in environment", () => {
      process.env.AWS_ACCESS_KEY_ID = "test-key";
      process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
      process.env.AWS_SESSION_TOKEN = "test-token";

      const config = getDefaultAWSConfig();

      expect(config.credentials).toBeDefined();
      expect(config.credentials?.accessKeyId).toBe("test-key");
      expect(config.credentials?.secretAccessKey).toBe("test-secret");
      expect(config.credentials?.sessionToken).toBe("test-token");
    });
  });

  describe("RETRY_CONFIG", () => {
    it("should have proper retry configuration", () => {
      expect(RETRY_CONFIG).toBeDefined();
      expect(RETRY_CONFIG.maxAttempts).toBe(3);
      expect(RETRY_CONFIG.retryDelayOptions).toBeDefined();
      expect(RETRY_CONFIG.retryDelayOptions.base).toBe(300);
    });
  });
});
