import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "ssh2";
import { logger } from "@/lib/logger/server";

const log = logger.child({ component: "SshClient" });

interface SshConfig {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

async function getSshConfigAsync(): Promise<SshConfig> {
  const host = process.env.SSH_HOST;
  const username = process.env.SSH_USERNAME;
  const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;

  if (!host || !username) {
    throw new Error(
      "SSH_HOST and SSH_USERNAME environment variables are required.",
    );
  }

  if (!privateKeyPath) {
    throw new Error("SSH_PRIVATE_KEY_PATH is required.");
  }

  let privateKey = "";
  try {
    privateKey = await fs.readFile(privateKeyPath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read SSH private key from ${privateKeyPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    host,
    port: Number(process.env.SSH_PORT) || 22,
    username,
    privateKey,
  };
}

export async function getRemoteFileList(
  directoryPath?: string,
): Promise<string[]> {
  const targetDir = directoryPath || process.env.MODEL_JSON_DIR;
  if (!targetDir) {
    throw new Error(
      "Target directory is not specified (MODEL_JSON_DIR or argument).",
    );
  }

  const config = await getSshConfigAsync();
  const conn = new Client();

  return new Promise((resolve, reject) => {
    conn
      .on("ready", () => {
        log.info("SSH Connection ready for listing files");

        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          sftp.readdir(targetDir, (err, list) => {
            if (err) {
              conn.end();
              return reject(err);
            }

            // ファイル名のみを抽出
            const fileNames = list.map((item) => item.filename);

            conn.end();
            resolve(fileNames);
          });
        });
      })
      .on("error", (err) => {
        log.error("SSH Connection Error", { error: err });
        reject(err);
      })
      .connect(config);
  });
}

export async function uploadFileToRemote(
  fileName: string,
  content: string,
  directoryPath?: string,
): Promise<void> {
  const targetDir = directoryPath || process.env.MODEL_JSON_DIR;
  if (!targetDir) {
    throw new Error(
      "Target directory is not specified (MODEL_JSON_DIR or argument).",
    );
  }

  // 簡易的なパストラバーサルチェック (ファイル名のみ許可)
  const safeFileName = path.basename(fileName);
  // リモート側のパス区切りは常に '/' と仮定 (SSH接続先がLinux/Unix系である前提)
  const remotePath = `${targetDir.replace(/\/$/, "")}/${safeFileName}`;

  const config = await getSshConfigAsync();
  const conn = new Client();

  return new Promise((resolve, reject) => {
    conn
      .on("ready", () => {
        log.info("SSH Connection ready for upload", { remotePath });

        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          const writeStream = sftp.createWriteStream(remotePath);

          writeStream.on("close", () => {
            log.info("File upload completed", { remotePath });
            conn.end();
            resolve();
          });

          writeStream.on("error", (err: unknown) => {
            log.error("File upload failed", { remotePath, error: err });
            conn.end();
            reject(err);
          });

          writeStream.end(content);
        });
      })
      .on("error", (err) => {
        log.error("SSH Connection Error during upload", { error: err });
        reject(err);
      })
      .connect(config);
  });
}
