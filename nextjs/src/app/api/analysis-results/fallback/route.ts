import JSZip from "jszip";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { S3Client } from "@/lib/s3/client";

import {
  ANALYSIS_BUCKET,
  ANALYSIS_REGION,
  ANALYSIS_ROOT_PREFIX,
} from "../common";

const fallbackLogger = logger.child({
  component: "analysis-results-fallback",
});

const s3Client = new S3Client({
  bucket: ANALYSIS_BUCKET,
  region: ANALYSIS_REGION,
});

const SHEET_NAME = "統計";
const DRAWING_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const _IMAGE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

interface FallbackPair {
  key: string;
  workbookName: string;
  originDataUrl: string;
  segmentationDataUrl: string;
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    fallbackLogger.warn("Failed to parse JSON body", { error });
    return NextResponse.json(
      { ok: false, error: "リクエストボディを解析できませんでした" },
      { status: 400 },
    );
  }

  const keyParam =
    payload && typeof payload === "object" && "key" in payload
      ? (payload as { key?: unknown }).key
      : undefined;

  if (typeof keyParam !== "string" || !keyParam.trim()) {
    return NextResponse.json(
      { ok: false, error: "key パラメーターが指定されていません" },
      { status: 400 },
    );
  }

  const normalizedKey = normalizeKey(keyParam);
  if (!normalizedKey) {
    return NextResponse.json(
      { ok: false, error: "取得対象のキーが不正です" },
      { status: 400 },
    );
  }

  fallbackLogger.info("Fallback preview requested", {
    key: normalizedKey,
  });

  try {
    const { body } = await s3Client.getObject({ key: normalizedKey });
    const pairs = await extractFallbackPairs(body);

    if (pairs.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "プレビューに利用できる画像が見つかりませんでした",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        pairs,
      },
      { status: 200 },
    );
  } catch (error) {
    fallbackLogger.error("Failed to build fallback preview", {
      key: normalizedKey,
      error,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "プレビュー画像を構築できませんでした。ログを確認してください。",
      },
      { status: 500 },
    );
  }
}

async function extractFallbackPairs(buffer: Buffer): Promise<FallbackPair[]> {
  const outerZip = await JSZip.loadAsync(buffer);
  const workbookNames = Object.keys(outerZip.files)
    .filter(
      (name) =>
        name.toLowerCase().endsWith(".xlsx") && !name.includes("全データ統計"),
    )
    .sort((a, b) => a.localeCompare(b, "ja"));

  const pairs: FallbackPair[] = [];

  fallbackLogger.debug("Processing fallback workbooks", {
    workbookCount: workbookNames.length,
    names: workbookNames,
  });

  for (const workbookName of workbookNames) {
    const entry = outerZip.file(workbookName);
    if (!entry) {
      continue;
    }

    const workbookBuffer = await entry.async("nodebuffer");
    const workbookZip = await JSZip.loadAsync(workbookBuffer);
    const images = await extractImagesFromWorkbook(workbookZip, workbookName);

    if (!images) {
      continue;
    }

    pairs.push({
      key: `${workbookName}`,
      workbookName,
      originDataUrl: images.origin,
      segmentationDataUrl: images.segmentation,
    });
  }

  return pairs;
}

async function extractImagesFromWorkbook(
  workbookZip: JSZip,
  workbookName: string,
): Promise<{ origin: string; segmentation: string } | null> {
  const workbookXml = await workbookZip
    .file("xl/workbook.xml")
    ?.async("string");
  const workbookRels = await workbookZip
    .file("xl/_rels/workbook.xml.rels")
    ?.async("string");

  if (!workbookXml || !workbookRels) {
    return null;
  }

  const sheets = parseSheets(workbookXml);
  if (sheets.length === 0) {
    return null;
  }

  const targetSheets = sortSheetsByPreference(sheets, SHEET_NAME);
  const workbookRelMap = buildRelationshipMap(workbookRels);

  for (const sheet of targetSheets) {
    fallbackLogger.debug("Evaluating sheet for fallback images", {
      workbookName,
      sheetName: sheet.name,
      relId: sheet.relId,
    });
    const sheetTarget = workbookRelMap.get(sheet.relId);
    if (!sheetTarget) {
      fallbackLogger.debug("Sheet target not found", {
        workbookName,
        sheetName: sheet.name,
      });
      continue;
    }

    const sheetPath = normalizePath(sheetTarget);
    const sheetRelsPath = buildRelsPath(sheetPath);
    const sheetRelsXml = await workbookZip.file(sheetRelsPath)?.async("string");
    if (!sheetRelsXml) {
      fallbackLogger.debug("Sheet relationships missing", {
        workbookName,
        sheetName: sheet.name,
        sheetRelsPath,
      });
      continue;
    }

    const drawingRelIds = findRelationshipIdsOfType(
      sheetRelsXml,
      DRAWING_REL_TYPE,
    );
    if (drawingRelIds.length === 0) {
      fallbackLogger.debug("No drawing relationships found", {
        workbookName,
        sheetName: sheet.name,
      });
      continue;
    }

    const sheetRelMap = buildRelationshipMap(sheetRelsXml);

    for (const drawingRelId of drawingRelIds) {
      const drawingTarget = sheetRelMap.get(drawingRelId);
      if (!drawingTarget) {
        fallbackLogger.debug("Drawing target missing", {
          workbookName,
          sheetName: sheet.name,
          drawingRelId,
        });
        continue;
      }

      const drawingPath = normalizePath(drawingTarget);
      const drawingXml = await workbookZip.file(drawingPath)?.async("string");
      if (!drawingXml) {
        fallbackLogger.debug("Drawing XML missing", {
          workbookName,
          sheetName: sheet.name,
          drawingPath,
        });
        continue;
      }

      const drawingRelsPath = buildRelsPath(drawingPath);
      const drawingRelsXml = await workbookZip
        .file(drawingRelsPath)
        ?.async("string");
      if (!drawingRelsXml) {
        fallbackLogger.debug("Drawing relationships missing", {
          workbookName,
          sheetName: sheet.name,
          drawingRelsPath,
        });
        continue;
      }

      const relationshipMap = buildRelationshipMap(drawingRelsXml);
      const embedIds = extractEmbedIds(drawingXml);

      const imageTargets = embedIds
        .map((id) => relationshipMap.get(id))
        .filter((value): value is string => Boolean(value));

      if (imageTargets.length < 2) {
        fallbackLogger.debug("Insufficient image targets", {
          workbookName,
          sheetName: sheet.name,
          imageTargets,
        });
        continue;
      }

      const originPath = normalizePath(imageTargets[0]);
      const segmentationPath = normalizePath(imageTargets[1]);

      const originBuffer = await workbookZip
        .file(originPath)
        ?.async("nodebuffer");
      const segmentationBuffer = await workbookZip
        .file(segmentationPath)
        ?.async("nodebuffer");

      if (!originBuffer || !segmentationBuffer) {
        fallbackLogger.debug("Unable to read image buffers", {
          workbookName,
          sheetName: sheet.name,
          originPath,
          segmentationPath,
          hasOrigin: Boolean(originBuffer),
          hasSegmentation: Boolean(segmentationBuffer),
        });
        continue;
      }

      const originDataUrl = bufferToDataUrl(originBuffer, originPath);
      const segmentationDataUrl = bufferToDataUrl(
        segmentationBuffer,
        segmentationPath,
      );

      fallbackLogger.info("Extracted fallback images", {
        workbookName,
        sheetName: sheet.name,
        originPath,
        segmentationPath,
      });

      return {
        origin: originDataUrl,
        segmentation: segmentationDataUrl,
      };
    }
  }

  return null;
}

function parseSheets(
  workbookXml: string,
): Array<{ name: string; relId: string }> {
  const sheets: Array<{ name: string; relId: string }> = [];
  const pattern = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/gi;
  for (const match of workbookXml.matchAll(pattern)) {
    const [, name, relId] = match;
    sheets.push({ name, relId });
  }
  return sheets;
}

function sortSheetsByPreference(
  sheets: Array<{ name: string; relId: string }>,
  preferredName: string,
): Array<{ name: string; relId: string }> {
  return sheets.slice().sort((a, b) => {
    const aPreferred =
      a.name.includes(preferredName) ||
      preferredName.includes(a.name) ||
      a.name.toLowerCase().includes(preferredName.toLowerCase());
    const bPreferred =
      b.name.includes(preferredName) ||
      preferredName.includes(b.name) ||
      b.name.toLowerCase().includes(preferredName.toLowerCase());

    if (aPreferred && !bPreferred) {
      return -1;
    }
    if (!aPreferred && bPreferred) {
      return 1;
    }
    return a.name.localeCompare(b.name, "ja");
  });
}

function findRelationshipIdsOfType(xml: string, type: string): string[] {
  const ids: string[] = [];
  const relationshipPattern = /<Relationship\b[^>]*>/gi;
  const typePattern = new RegExp(`Type="${escapeRegex(type)}"`, "i");

  for (const match of xml.matchAll(relationshipPattern)) {
    const tag = match[0];
    if (!typePattern.test(tag)) {
      continue;
    }
    const idMatch = tag.match(/Id="([^"]+)"/i);
    if (idMatch) {
      ids.push(idMatch[1]);
    }
  }

  return ids;
}

function buildRelationshipMap(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const relationshipPattern = /<Relationship\b[^>]*>/gi;

  for (const match of xml.matchAll(relationshipPattern)) {
    const tag = match[0];
    const idMatch = tag.match(/Id="([^"]+)"/i);
    const targetMatch = tag.match(/Target="([^"]+)"/i);
    if (idMatch && targetMatch) {
      map.set(idMatch[1], targetMatch[1]);
    }
  }
  return map;
}

function extractEmbedIds(drawingXml: string): string[] {
  const ids: string[] = [];
  const pattern = /r:embed="([^"]+)"/gi;
  for (const match of drawingXml.matchAll(pattern)) {
    ids.push(match[1]);
  }
  return ids;
}

function bufferToDataUrl(buffer: Buffer, path: string): string {
  const contentType = guessContentType(path);
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".bmp")) {
    return "image/bmp";
  }
  return "image/png";
}

function normalizePath(target: string): string {
  let sanitized = target.trim();
  if (!sanitized) {
    return sanitized;
  }

  sanitized = sanitized.replace(/^\/+/, "");
  while (sanitized.startsWith("../")) {
    sanitized = sanitized.slice(3);
  }

  return sanitized;
}

function buildRelsPath(target: string): string {
  const normalized = normalizePath(target);
  const lastSlash = normalized.lastIndexOf("/");

  if (lastSlash === -1) {
    return `_rels/${normalized}.rels`;
  }

  const dir = normalized.slice(0, lastSlash + 1);
  const file = normalized.slice(lastSlash + 1);
  return `${dir}_rels/${file}.rels`;
}

function normalizeKey(key: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(key.trim());
  } catch {
    return null;
  }

  if (!decoded) {
    return null;
  }

  const sanitised = decoded.replace(/^\/+/, "");

  if (!sanitised.startsWith(ANALYSIS_ROOT_PREFIX)) {
    return null;
  }

  return sanitised;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
