import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const INPUT_ROOT = path.join(
  process.cwd(),
  "src/app/annotation2/input",
);

const SEGMENTATION_ROOT = path.join(INPUT_ROOT, "segmentation_outputs");
const CSV_ROOT = path.join(INPUT_ROOT, "csv_outputs");
const IMAGE_ROOT = path.join(INPUT_ROOT, "original_images");

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function listDatasetIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(SEGMENTATION_ROOT, {
      withFileTypes: true,
    });
    const ids: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const segPath = path.join(SEGMENTATION_ROOT, entry.name, "segmentation.json");
      if (await exists(segPath)) {
        ids.push(entry.name);
      }
    }
    return ids.sort();
  } catch {
    return [];
  }
}

export interface DatasetPaths {
  id: string;
  segmentationPath: string;
  csvPath: string;
  imagePath: string;
  workDir: string;
}

async function tryExtractImageFromZip(
  datasetId: string,
  destinationPath: string,
): Promise<void> {
  const entries = await fs.readdir(IMAGE_ROOT, { withFileTypes: true });
  const zipFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".zip"))
    .map((e) => path.join(IMAGE_ROOT, e.name));

  const targetName = `${datasetId}.png`;
  for (const zipPath of zipFiles) {
    const ok = await new Promise<boolean>((resolve) => {
      const unzip = spawn("unzip", ["-p", zipPath, targetName]);
      const writeStream = createWriteStream(destinationPath);

      unzip.stdout.pipe(writeStream);

      const cleanUp = () => {
        writeStream.close();
      };

      unzip.on("error", () => {
        cleanUp();
        resolve(false);
      });
      unzip.on("close", (code) => {
        cleanUp();
        resolve(code === 0);
      });
    });

    if (ok) {
      return;
    }
  }
}

export async function resolveDataset(
  datasetId?: string,
): Promise<DatasetPaths> {
  const datasetIds = await listDatasetIds();

  // デフォルトの fallback ファイル（従来の単一ファイル構成）
  const fallbackSeg = path.join(INPUT_ROOT, "segmentation.json");
  const fallbackCsv = path.join(INPUT_ROOT, "result.csv");
  const fallbackImg = path.join(INPUT_ROOT, "origin.png");

  const preferredId =
    datasetId && datasetIds.includes(datasetId) ? datasetId : datasetIds[0];

  const id = preferredId ?? "default";

  const segmentationCandidate = path.join(
    SEGMENTATION_ROOT,
    id,
    "segmentation.json",
  );
  const csvCandidate = path.join(CSV_ROOT, id, "result.csv");
  const imageCandidate = path.join(IMAGE_ROOT, `${id}.png`);

  if (!(await exists(imageCandidate))) {
    await tryExtractImageFromZip(id, imageCandidate);
  }

  const segmentationPath = (await exists(segmentationCandidate))
    ? segmentationCandidate
    : fallbackSeg;
  const csvPath = (await exists(csvCandidate)) ? csvCandidate : fallbackCsv;
  const imagePath = (await exists(imageCandidate)) ? imageCandidate : fallbackImg;

  const workDir = path.join(INPUT_ROOT, "work", id);

  return {
    id,
    segmentationPath,
    csvPath,
    imagePath,
    workDir,
  };
}
