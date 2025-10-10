/**
 * AWS SDK で共通的に利用する設定値。
 * region と credentials を束ねる薄いラッパー。
 */

export interface AWSConfig {
	region: string;
	credentials?: {
		accessKeyId: string;
		secretAccessKey: string;
		sessionToken?: string;
	};
}

/**
 * 環境変数から AWS 設定を組み立てるヘルパー。
 * - `AWS_REGION` が未設定の場合は東京リージョン (`ap-northeast-1`) を既定値として使用。
 * - 認証情報 (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`) が揃っていれば credentials を設定。
 * - 一部だけ欠けている場合は credentials を付与せず、SDK のデフォルト認証プロバイダに処理を委ねる。
 */
export function getDefaultAWSConfig(): AWSConfig {
	const region = process.env.AWS_REGION || 'ap-northeast-1';

	// 環境変数から認証情報を取得（オプショナル）
	const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
	const sessionToken = process.env.AWS_SESSION_TOKEN;

	const config: AWSConfig = { region };

	// 認証情報が環境変数に設定されている場合のみ追加
	if (accessKeyId && secretAccessKey) {
		config.credentials = {
			accessKeyId,
			secretAccessKey,
			sessionToken,
		};
	}

	return config;
}

/**
 * AWS SDK (Smithy) の共通リトライ設定。
 * 現状は最大 3 回の指数バックオフを想定し、基点ディレイを 300ms に設定。
 */
export const RETRY_CONFIG = {
	maxAttempts: 3,
	retryDelayOptions: {
		base: 300,
	},
};
