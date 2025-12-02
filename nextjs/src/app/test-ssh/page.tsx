import { logger } from "@/lib/logger/server";
import { getRemoteFileList } from "@/lib/ssh/client";

export default async function TestSshPage() {
  let files: string[] = [];
  let error: string | null = null;

  try {
    // 環境変数が設定されていない場合のエラーをキャッチするため
    files = await getRemoteFileList();
  } catch (e) {
    logger.error("Failed to list remote files", { error: e });
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>SSH リモートファイルリスト (テスト)</h1>

      <div style={{ marginBottom: "20px", fontSize: "0.9em", color: "#666" }}>
        <p>以下の環境変数が設定されている必要があります (.env.local):</p>
        <ul>
          <li>
            <code>SSH_HOST</code>: ホスト名またはIPアドレス
          </li>
          <li>
            <code>SSH_USERNAME</code>: ユーザー名
          </li>
          <li>
            <code>SSH_PRIVATE_KEY_PATH</code>: 秘密鍵のフルパス (例:
            /home/user/.ssh/id_rsa)
          </li>
          <li>
            <code>MODEL_JSON_DIR</code>: 対象ディレクトリ (例: /var/www/html)
          </li>
        </ul>
      </div>

      {error && (
        <div
          style={{
            color: "red",
            border: "1px solid red",
            padding: "10px",
            borderRadius: "5px",
          }}
        >
          <h3>エラーが発生しました:</h3>
          <p>{error}</p>
        </div>
      )}

      {!error && files.length === 0 && (
        <p>ファイルが見つからないか、ディレクトリが空です。</p>
      )}

      {!error && files.length > 0 && (
        <ul style={{ listStyleType: "disc", paddingLeft: "20px" }}>
          {files.map((file, index) => (
            <li key={index} style={{ fontFamily: "monospace" }}>
              {file}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
