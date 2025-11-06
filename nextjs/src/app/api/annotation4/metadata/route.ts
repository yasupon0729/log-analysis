import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ANNOTATION_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
  generateAnnotationToken,
  verifyAnnotationToken,
} from "@/app/annotation/token";
import { loadAnnotationDataset } from "@/lib/annotation/data";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ANNOTATION_COOKIE_NAME)?.value ?? null;
  const hasValidToken = token && verifyAnnotationToken(token);
  const issuedToken = hasValidToken ? null : generateAnnotationToken();

  try {
    const dataset = await loadAnnotationDataset();
    const regions = dataset.boundaries.map((boundary, index) => ({
      id: `region-${index + 1}`,
      label: `領域 ${index + 1}`,
      bbox: boundary.bbox,
      score: boundary.score,
      iou: boundary.iou,
    }));

    return withToken(
      NextResponse.json(
        { ok: true, regions },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      ),
      issuedToken,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("annotation4.metadata: failed", error);
    return withToken(
      NextResponse.json({ ok: false, error: "Failed to load metadata" }, { status: 500 }),
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
