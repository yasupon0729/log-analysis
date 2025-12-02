import { logger } from "@/lib/logger/server";
import { getAiModelNamesForSync } from "@/lib/recommendation/service";
import { getRemoteFileList } from "@/lib/ssh/client";
import { css } from "@/styled-system/css";
import { SyncTable } from "./SyncTable";

export const dynamic = "force-dynamic"; // 常に最新の状態を取得

export default async function SyncPage() {
  let dbModelNames: string[] = [];
  let remoteFiles: string[] = [];
  let error = null;

  try {
    // 並列でデータ取得
    const [dbNames, files] = await Promise.all([
      getAiModelNamesForSync(),
      getRemoteFileList(),
    ]);
    dbModelNames = dbNames;
    remoteFiles = files;
  } catch (e) {
    logger.error("Failed to load data for sync page", { error: e });
    error = e instanceof Error ? e.message : String(e);
  }

  // リモートファイルの拡張子を除去してSetにする
  const remoteModelSet = new Set(
    remoteFiles
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  );

  // マッピングデータを作成
  const rows = dbModelNames.map((name) => {
    const exists = remoteModelSet.has(name);
    return {
      name,
      exists,
    };
  });

  return (
    <div className={containerClass}>
      <h1 className={headingClass}>AIモデル JSON同期管理</h1>
      
      {error && (
        <div className={errorClass}>
          エラーが発生しました: {error}
        </div>
      )}

      <div className={tableWrapperClass}>
        <SyncTable data={rows} />
      </div>
    </div>
  );
}

// Styles
const containerClass = css({
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const headingClass = css({
  fontSize: "2xl",
  fontWeight: "bold",
  color: "text.primary",
});

const errorClass = css({
  padding: "10px",
  marginBottom: "20px",
  color: "red.400",
  border: "1px solid",
  borderColor: "red.400",
  borderRadius: "md",
});

const tableWrapperClass = css({
  width: "100%",
});