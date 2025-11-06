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

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ANNOTATION_COOKIE_NAME)?.value ?? null;
  const hasValidToken = token && verifyAnnotationToken(token);
  const issuedToken = hasValidToken ? null : generateAnnotationToken();

  try {
    const filePath = path.join(process.cwd(), "input", "annotation.json");
    const fileContent = await fs.readFile(filePath, "utf8");
    const annotation = JSON.parse(fileContent);
    const response = NextResponse.json(
      { ok: true, annotation },
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
    console.error("Failed to load annotation.json", error);
    const response = NextResponse.json(
      { ok: false, error: "Failed to load annotation data" },
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
