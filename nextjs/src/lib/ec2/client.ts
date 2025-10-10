/**
 * EC2クライアントの設定と初期化
 */

import { RETRY_CONFIG, getDefaultAWSConfig } from "@/utils";
import { EC2Client, type EC2ClientConfig } from "@aws-sdk/client-ec2";
import { logger } from "../logger";

// s
let ec2Client: EC2Client | null = null;

/**
 * EC2クライアントのインスタンスを取得
 */
export function getEC2Client(config?: Partial<EC2ClientConfig>): EC2Client {
  if (!ec2Client) {
    const awsConfig = getDefaultAWSConfig();
    const clientConfig: EC2ClientConfig = {
      region: awsConfig.region,
      credentials: awsConfig.credentials,
      ...RETRY_CONFIG,
      ...config,
    };

    ec2Client = new EC2Client(clientConfig);
    logger.debug("EC2 client initialized", {
      region: clientConfig.region,
    });
  }

  return ec2Client;
}

/**
 * EC2クライアントをリセット（テスト用）
 */
export function resetEC2Client(): void {
  if (ec2Client) {
    ec2Client.destroy();
    ec2Client = null;
    logger.debug("EC2 client reset");
  }
}
