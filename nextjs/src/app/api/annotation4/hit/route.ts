import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ANNOTATION_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
  generateAnnotationToken,
  verifyAnnotationToken,
} from "@/app/annotation/token";
import { loadAnnotationDataset } from "@/lib/annotation/data";
import { findRegionContainingPoint } from "@/lib/annotation/geometry";
import { renderOverlaySvg } from "@/lib/annotation/render";
import {
  getDisabledRegionsSnapshot,
  isRegionDisabled,
} from "@/lib/annotation/annotation3-state";

interface HitRequestBody {
  imageId: string;
  x: number;
  y: number;
  queueIds?: string[];
}

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
    console.error("annotation4.hit: invalid JSON", error);
    return withToken(
      NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 }),
      issuedToken,
    );
  }

  if (body.imageId !== "annotation-sample" || !Number.isFinite(body.x) || !Number.isFinite(body.y)) {
    return withToken(
      NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 }),
      issuedToken,
    );
  }

  const queueIds = Array.isArray(body.queueIds) ? body.queueIds : [];

  try {
    const dataset = await loadAnnotationDataset();
    const disabledIds = new Set(getDisabledRegionsSnapshot());
    const match = findRegionContainingPoint(dataset.boundaries, body.x, body.y, {
      skip: (id) => disabledIds.has(id),
    });

    const hoveredId = match?.id ?? null;
    const overlay = renderOverlaySvg({
      dataset,
      highlightIds: queueIds,
      hoveredId,
      disabledIds,
    });

    return withToken(
      NextResponse.json(
        {
          ok: true,
          hoverId: hoveredId,
          overlayImage: overlay,
          region: match
            ? {
                id: match.id,
                label: match.label,
                score: match.boundary.score,
                iou: match.boundary.iou,
              }
            : null,
        },
        { status: 200 },
      ),
      issuedToken,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("annotation4.hit: failed", error);
    return withToken(
      NextResponse.json({ ok: false, error: "Hit-test failed" }, { status: 500 }),
      issuedToken,
    );
  }
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
