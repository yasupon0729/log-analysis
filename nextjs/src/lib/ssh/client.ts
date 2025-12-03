import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "ssh2";
import { logger } from "@/lib/logger/server";

const log = logger.child({ component: "SshClient" });

export type SshTarget = "KNIT02" | "KNIT03" | "KNIT04";

interface SshConfig {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

async function getSshConfigAsync(target: SshTarget): Promise<SshConfig> {
  const host = process.env[`SSH_HOST_${target}`];
  const username = process.env[`SSH_USERNAME_${target}`];
  const privateKeyPath = process.env[`SSH_PRIVATE_KEY_PATH_${target}`];
  const port = process.env[`SSH_PORT_${target}`];

  if (!host || !username) {
    throw new Error(
      `SSH_HOST_${target} and SSH_USERNAME_${target} environment variables are required.`,
    );
  }

  if (!privateKeyPath) {
    throw new Error(`SSH_PRIVATE_KEY_PATH_${target} is required.`);
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
    port: Number(port) || 22,
    username,
    privateKey,
  };
}

export async function getRemoteFileList(
  target: SshTarget = "KNIT02",
  directoryPath?: string,
): Promise<string[]> {
  const targetDirEnv = `MODEL_JSON_DIR_${target}`;
  const targetDir = directoryPath || process.env[targetDirEnv];
  
  if (!targetDir) {
    throw new Error(
      `Target directory is not specified (${targetDirEnv} or argument).`,
    );
  }

  const config = await getSshConfigAsync(target);
  const conn = new Client();

  return new Promise((resolve, reject) => {
    conn
      .on("ready", () => {
        log.info("SSH Connection ready for listing files", { target });

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
        log.error("SSH Connection Error", { target, error: err });
        reject(err);
      })
      .connect(config);
  });
}

export async function uploadFileToRemote(
  target: SshTarget,
  fileName: string,
  content: string,
  directoryPath?: string,
): Promise<void> {
  const targetDirEnv = `MODEL_JSON_DIR_${target}`;
  const targetDir = directoryPath || process.env[targetDirEnv];
  
  if (!targetDir) {
    throw new Error(
      `Target directory is not specified (${targetDirEnv} or argument).`,
    );
  }

  // 簡易的なパストラバーサルチェック (ファイル名のみ許可)
  const safeFileName = path.basename(fileName);
  // リモート側のパス区切りは常に '/' と仮定 (SSH接続先がLinux/Unix系である前提)
  const remotePath = `${targetDir.replace(/\/$/, "")}/${safeFileName}`;

  const config = await getSshConfigAsync(target);
  const conn = new Client();

  return new Promise((resolve, reject) => {
    conn
      .on("ready", () => {
        log.info("SSH Connection ready for upload", { target, remotePath });

        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          const writeStream = sftp.createWriteStream(remotePath);

          writeStream.on("close", () => {
            log.info("File upload completed", { target, remotePath });
            conn.end();
            resolve();
          });

          writeStream.on("error", (err: unknown) => {
            log.error("File upload failed", { target, remotePath, error: err });
            conn.end();
            reject(err);
          });

          writeStream.end(content);
        });
      })
      .on("error", (err) => {
        log.error("SSH Connection Error during upload", { target, error: err });
        reject(err);
      })
      .connect(config);
  });
}