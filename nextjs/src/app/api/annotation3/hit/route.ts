import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ANNOTATION_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
  generateAnnotationToken,
  verifyAnnotationToken,
} from "@/app/annotation/token";
import { loadAnnotationDataset } from "@/lib/annotation/data";
import type { AnnotationBoundary } from "@/lib/annotation/data";
import { findRegionContainingPoint } from "@/lib/annotation/geometry";
import { isRegionDisabled } from "@/lib/annotation/annotation3-state";

const CANVAS_WIDTH = 1049;
const CANVAS_HEIGHT = 695;
const ROI_SIZE = 320;

interface HitRequestBody {
  imageId: string;
  x: number;
  y: number;
  view?: {
    scale?: number;
    offsetX?: number;
    offsetY?: number;
  };
}

interface HitResponseBody {
  ok: boolean;
  ids: string[];
  roiImage?: string;
  message?: string;
}

let baseImageDataUriPromise: Promise<string> | null = null;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ANNOTATION_COOKIE_NAME)?.value ?? null;
  const hasValidToken = token && verifyAnnotationToken(token);
  const issuedToken = hasValidToken ? null : generateAnnotationToken();

  let body: HitRequestBody;
  try {
    body = (await request.json()) as HitRequestBody;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("annotation3.hit: invalid JSON", error);
    return withToken(
      NextResponse.json<HitResponseBody>(
        { ok: false, ids: [], message: "Invalid JSON payload" },
        { status: 400 },
      ),
      issuedToken,
    );
  }

  if (body.imageId !== "annotation-sample" || !Number.isFinite(body.x) || !Number.isFinite(body.y)) {
    return withToken(
      NextResponse.json<HitResponseBody>(
        { ok: false, ids: [], message: "Invalid request payload" },
        { status: 400 },
      ),
      issuedToken,
    );
  }

  try {
    const dataset = await loadAnnotationDataset();
    const match = findRegionContainingPoint(dataset.boundaries, body.x, body.y, {
      skip: (id) => isRegionDisabled(id),
    });

    if (!match) {
      return withToken(
        NextResponse.json<HitResponseBody>({ ok: true, ids: [] }, { status: 200 }),
        issuedToken,
      );
    }

    const roiImage = await generateRoiImage(match.id, match.boundary, body.x, body.y);
    return withToken(
      NextResponse.json<HitResponseBody>(
        {
          ok: true,
          ids: [match.id],
          roiImage,
        },
        { status: 200 },
      ),
      issuedToken,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("annotation3.hit: failed", error);
    return withToken(
      NextResponse.json<HitResponseBody>(
        { ok: false, ids: [], message: "Hit-test failed" },
        { status: 500 },
      ),
      issuedToken,
    );
  }
}

async function generateRoiImage(
  regionId: string,
  boundary: AnnotationBoundary,
  centerX: number,
  centerY: number,
): Promise<string> {
  const imageDataUri = await ensureBaseImageDataUri();
  const half = ROI_SIZE / 2;
  const viewX = clamp(centerX - half, 0, CANVAS_WIDTH - ROI_SIZE);
  const viewY = clamp(centerY - half, 0, CANVAS_HEIGHT - ROI_SIZE);

  const [bboxX, bboxY, bboxWidth, bboxHeight] = boundary.bbox;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${ROI_SIZE}" height="${ROI_SIZE}" viewBox="${viewX} ${viewY} ${ROI_SIZE} ${ROI_SIZE}">
  <image href="${imageDataUri}" x="0" y="0" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" />
  <rect x="${bboxX}" y="${bboxY}" width="${bboxWidth}" height="${bboxHeight}" fill="rgba(59,130,246,0.24)" stroke="rgba(37,99,235,0.9)" stroke-width="2" />
  <text x="${bboxX + bboxWidth / 2}" y="${bboxY - 8}" text-anchor="middle" font-size="18" fill="rgba(37,99,235,0.95)">${regionId}</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function ensureBaseImageDataUri(): Promise<string> {
  if (!baseImageDataUriPromise) {
    baseImageDataUriPromise = (async () => {
      const candidatePaths = [
        path.join(process.cwd(), "public", "annotation-sample.png"),
        path.join(process.cwd(), "nextjs", "public", "annotation-sample.png"),
      ];

      for (const candidate of candidatePaths) {
        try {
          const file = await fs.readFile(candidate);
          return `data:image/png;base64,${file.toString("base64")}`;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }

      throw new Error("annotation-sample.png not found");
    })();
  }
  return baseImageDataUriPromise;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function withToken<T extends NextResponse>(response: T, issuedToken: string | null): T {
  if (issuedToken) {
    response.cookies.set({
      name: ANNOTATION_COOKIE_NAME,
      value: issuedToken,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: TOKEN_MAX_AGE_SECONDS,
    });
  }
  return response;
}
