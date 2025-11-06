import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ANNOTATION_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
  generateAnnotationToken,
  verifyAnnotationToken,
} from "@/app/annotation/token";
import {
  AnnotationBoundary,
  loadAnnotationDataset,
} from "@/lib/annotation/data";

interface HitTestRequestBody {
  x: number;
  y: number;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ANNOTATION_COOKIE_NAME)?.value ?? null;
  const hasValidToken = token && verifyAnnotationToken(token);
  const issuedToken = hasValidToken ? null : generateAnnotationToken();

  let body: HitTestRequestBody;

  try {
    body = (await request.json()) as HitTestRequestBody;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to parse hit-test payload", error);
    return NextResponse.json(
      { ok: false, error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  if (!Number.isFinite(body.x) || !Number.isFinite(body.y)) {
    return NextResponse.json(
      { ok: false, error: "Invalid coordinates" },
      { status: 400 },
    );
  }

  try {
    const dataset = await loadAnnotationDataset();
    const match = findRegionContainingPoint(dataset.boundaries, body.x, body.y);

    const response = NextResponse.json(
      {
        ok: true,
        region: match
          ? {
              id: match.id,
              label: match.label,
              bbox: match.boundary.bbox,
              score: match.boundary.score,
              iou: match.boundary.iou,
            }
          : null,
      },
      { status: 200 },
    );

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
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Hit-test failed", error);
    const response = NextResponse.json(
      { ok: false, error: "Failed to perform hit-test" },
      { status: 500 },
    );

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
}

function findRegionContainingPoint(
  boundaries: AnnotationBoundary[],
  x: number,
  y: number,
): { id: string; boundary: AnnotationBoundary; label: string } | null {
  for (let index = 0; index < boundaries.length; index += 1) {
    const boundary = boundaries[index];
    if (isPointInsidePolygon(boundary.polygon.vertices, x, y)) {
      return {
        id: `region-${index + 1}`,
        boundary,
        label: `領域 ${index + 1}`,
      };
    }
  }
  return null;
}

function isPointInsidePolygon(
  vertices: AnnotationBoundary["polygon"]["vertices"],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const xi = vertices[i]?.x ?? 0;
    const yi = vertices[i]?.y ?? 0;
    const xj = vertices[j]?.x ?? 0;
    const yj = vertices[j]?.y ?? 0;

    const denominator = yj - yi;
    if (denominator === 0) {
      continue;
    }

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / denominator + xi;

    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}
