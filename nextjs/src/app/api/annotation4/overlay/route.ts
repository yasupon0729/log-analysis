import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ANNOTATION_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
  generateAnnotationToken,
  verifyAnnotationToken,
} from "@/app/annotation/token";
import { loadAnnotationDataset } from "@/lib/annotation/data";
import { renderOverlaySvg } from "@/lib/annotation/render";
import { getDisabledRegionsSnapshot } from "@/lib/annotation/annotation3-state";

interface OverlayRequestBody {
  queueIds?: string[];
  hoverId?: string | null;
  includeOutline?: boolean;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ANNOTATION_COOKIE_NAME)?.value ?? null;
  const hasValidToken = token && verifyAnnotationToken(token);
  const issuedToken = hasValidToken ? null : generateAnnotationToken();

  let body: OverlayRequestBody;
  try {
    body = (await request.json()) as OverlayRequestBody;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("annotation4.overlay: invalid JSON", error);
    return withToken(
      NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 }),
      issuedToken,
    );
  }

  const queueIds = Array.isArray(body.queueIds) ? body.queueIds : [];
  const hoverId = typeof body.hoverId === "string" ? body.hoverId : null;

  try {
    const dataset = await loadAnnotationDataset();
    const disabledIds = new Set(getDisabledRegionsSnapshot());
    const overlay = renderOverlaySvg({
      dataset,
      highlightIds: queueIds,
      hoveredId: hoverId,
      disabledIds,
      includeOutline: Boolean(body.includeOutline),
    });

    return withToken(
      NextResponse.json({ ok: true, overlayImage: overlay }, { status: 200 }),
      issuedToken,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("annotation4.overlay: failed", error);
    return withToken(
      NextResponse.json({ ok: false, error: "Failed to build overlay" }, { status: 500 }),
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
