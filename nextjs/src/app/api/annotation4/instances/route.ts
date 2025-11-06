import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ANNOTATION_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
  generateAnnotationToken,
  verifyAnnotationToken,
} from "@/app/annotation/token";
import {
  getDisabledRegionsSnapshot,
  setRegionsDisabled,
} from "@/lib/annotation/annotation3-state";

interface PatchRequestBody {
  ids: string[];
  disabled: boolean;
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ANNOTATION_COOKIE_NAME)?.value ?? null;
  const hasValidToken = token && verifyAnnotationToken(token);
  const issuedToken = hasValidToken ? null : generateAnnotationToken();

  let body: PatchRequestBody;
  try {
    body = (await request.json()) as PatchRequestBody;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("annotation4.instances: invalid JSON", error);
    return withToken(
      NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 }),
      issuedToken,
    );
  }

  if (!Array.isArray(body.ids) || typeof body.disabled !== "boolean") {
    return withToken(
      NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 }),
      issuedToken,
    );
  }

  setRegionsDisabled(body.ids, body.disabled);

  return withToken(
    NextResponse.json(
      {
        ok: true,
        disabledIds: getDisabledRegionsSnapshot(),
      },
      { status: 200 },
    ),
    issuedToken,
  );
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
