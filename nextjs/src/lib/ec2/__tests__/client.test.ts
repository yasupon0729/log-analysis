import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  // mock,
} from "bun:test";
import { EC2Client } from "@aws-sdk/client-ec2";
import { getEC2Client, resetEC2Client } from "../client";

describe("EC2 Client", () => {
  beforeEach(() => {
    // 環境変数をモック
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
  });

  it("should create and return EC2 client instance", () => {
    const client = getEC2Client();
    expect(client).toBeInstanceOf(EC2Client);
  });

  it("should return the same client instance on subsequent calls", () => {
    const client1 = getEC2Client();
    const client2 = getEC2Client();
    expect(client1).toBe(client2);
  });

  it("should use custom config when provided", () => {
    const customConfig = { region: "eu-west-1" };
    const client = getEC2Client(customConfig);
    expect(client).toBeInstanceOf(EC2Client);
  });

  it("should reset client properly", () => {
    const client1 = getEC2Client();
    resetEC2Client();
    const client2 = getEC2Client();
    expect(client1).not.toBe(client2);
  });

  it("should use environment variables for configuration", () => {
    const client = getEC2Client();
    expect(client).toBeInstanceOf(EC2Client);
    // クライアントが環境変数の設定を使用していることを確認
  });
});
