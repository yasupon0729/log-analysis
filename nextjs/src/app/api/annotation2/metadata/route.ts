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

    const response = NextResponse.json(
      { ok: true, regions },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
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
    console.error("Failed to load annotation metadata", error);
    const response = NextResponse.json(
      { ok: false, error: "Failed to load annotation metadata" },
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
