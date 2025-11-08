import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const REVIEW_FILE_PATH = path.join(
  process.cwd(),
  "input",
  "annotation-review.json",
);

type RemovalOrigin = "manual" | "filter";
type RemovalStatus = "queued" | "removed";

interface AppliedFilterSnapshot {
  key: string;
  label: string;
  mode: "min" | "max" | "range";
  min: number;
  max: number;
}

interface AnnotationReviewItem {
  id: string;
  origin: RemovalOrigin;
  status: RemovalStatus;
  createdAt: string;
  filtersApplied?: AppliedFilterSnapshot[];
}

interface AnnotationReviewFile {
  version: number;
  updatedAt: string;
  items: AnnotationReviewItem[];
}

interface ReviewResponseBody {
  ok: boolean;
  review?: AnnotationReviewFile;
  error?: string;
}

const createEmptyReviewFile = (): AnnotationReviewFile => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  items: [],
});

const ensureReviewFile = async (): Promise<AnnotationReviewFile> => {
  try {
    const content = await fs.readFile(REVIEW_FILE_PATH, "utf8");
    return JSON.parse(content) as AnnotationReviewFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const initial = createEmptyReviewFile();
      await fs.writeFile(
        REVIEW_FILE_PATH,
        JSON.stringify(initial, null, 2),
        "utf8",
      );
      return initial;
    }
    throw error;
  }
};

const normalizeReviewItem = (
  item: Partial<AnnotationReviewItem>,
  fallbackDate: string,
): AnnotationReviewItem => {
  const id = item?.id ?? "";
  if (!id) {
    throw new Error("review item is missing id");
  }
  const origin: RemovalOrigin = item.origin === "filter" ? "filter" : "manual";
  const status: RemovalStatus =
    item.status === "removed" ? "removed" : "queued";
  const createdAt = item.createdAt ?? fallbackDate;
  const filtersApplied = Array.isArray(item.filtersApplied)
    ? item.filtersApplied
        .map((snapshot) => {
          if (
            !snapshot ||
            typeof snapshot.key !== "string" ||
            typeof snapshot.label !== "string"
          ) {
            return null;
          }
          const mode: AppliedFilterSnapshot["mode"] =
            snapshot.mode === "max"
              ? "max"
              : snapshot.mode === "range"
                ? "range"
                : "min";
          const min = Number(snapshot.min);
          const max = Number(snapshot.max);
          if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return null;
          }
          return { key: snapshot.key, label: snapshot.label, mode, min, max };
        })
        .filter(
          (snapshot): snapshot is AppliedFilterSnapshot => snapshot !== null,
        )
    : undefined;

  return {
    id: String(id),
    origin,
    status,
    createdAt,
    filtersApplied,
  };
};

export async function GET() {
  try {
    const review = await ensureReviewFile();
    return NextResponse.json(
      { ok: true, review } satisfies ReviewResponseBody,
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to load annotation-review.json", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load annotation review data" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const current = await ensureReviewFile();
    const body = (await request.json()) as {
      version?: number;
      items?: Array<Partial<AnnotationReviewItem>>;
    };

    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { ok: false, error: "items must be an array" },
        { status: 400 },
      );
    }

    if (typeof body.version === "number" && body.version !== current.version) {
      return NextResponse.json(
        {
          ok: false,
          error: "version mismatch",
          review: current,
        } satisfies ReviewResponseBody,
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const normalizedItems = body.items.map((item) =>
      normalizeReviewItem(item, now),
    );

    const next: AnnotationReviewFile = {
      version: current.version + 1,
      updatedAt: now,
      items: normalizedItems,
    };

    await fs.writeFile(REVIEW_FILE_PATH, JSON.stringify(next, null, 2), "utf8");

    return NextResponse.json(
      { ok: true, review: next } satisfies ReviewResponseBody,
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to save annotation-review.json", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save annotation review data" },
      { status: 500 },
    );
  }
}
