import { logger } from "@/lib/logger/server";
import { getAiModelNamesForSync } from "@/lib/recommendation/service";
import { ALL_TARGETS, getRemoteFileList, type SshTarget } from "@/lib/ssh/client";
import { css } from "@/styled-system/css";
import { SyncTable, type SyncTableRow } from "./SyncTable";

export const dynamic = "force-dynamic"; // 常に最新の状態を取得

export default async function SyncPage() {
  let dbModelNames: string[] = [];
  const remoteStatus: Record<string, Record<SshTarget, boolean>> = {};
  let error = null;

  try {
    // DBのモデル名取得
    const dbNamesPromise = getAiModelNamesForSync();

    // 各サーバーのファイル一覧取得 (並列実行)
    const remoteFilesPromises = ALL_TARGETS.map(async (target) => {
        try {
            const files = await getRemoteFileList(target);
            return { target, files, success: true };
        } catch (e) {
            logger.error(`Failed to get file list from ${target}`, { error: e });
            return { target, files: [], success: false, error: e };
        }
    });

    const [dbNames, ...remoteResults] = await Promise.all([
      dbNamesPromise,
      ...remoteFilesPromises,
    ]);

    dbModelNames = dbNames;

    // リモート状況の整理
    // まず全モデル名のエントリを初期化
    for (const name of dbModelNames) {
        remoteStatus[name] = {
            KNIT02: false,
            KNIT03: false,
            KNIT04: false,
        };
    }

    // 取得したファイル一覧を反映
    for (const res of remoteResults) {
        if (!res.success) {
            // 取得失敗した場合は全モデルで false (またはエラー状態を示すUIが必要かもだが、一旦なし)
            continue;
        }
        
        // 拡張子を除去したSetを作成
        const fileSet = new Set(
            res.files
                .filter((f) => f.endsWith(".json"))
                .map((f) => f.replace(/\.json$/, ""))
        );

        // DBにあるモデルについて存在確認
        for (const name of dbModelNames) {
            if (fileSet.has(name)) {
                remoteStatus[name][res.target as SshTarget] = true;
            }
        }
    }

  } catch (e) {
    logger.error("Failed to load data for sync page", { error: e });
    error = e instanceof Error ? e.message : String(e);
  }

  // テーブル用データ作成
  const rows: SyncTableRow[] = dbModelNames.map((name) => ({
    name,
    status: remoteStatus[name] || { KNIT02: false, KNIT03: false, KNIT04: false },
  }));

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