import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const ADDITIONS_FILE_PATH = path.join(
  process.cwd(),
  "input",
  "annotation-additions.json",
);

interface AdditionPoint {
  x: number;
  y: number;
}

interface AdditionItem {
  id: string;
  label: string;
  points: AdditionPoint[];
  bbox: [number, number, number, number];
  score?: number;
  iou?: number;
  metrics?: Record<string, number>;
}

interface AdditionFile {
  version: number;
  updatedAt: string;
  items: AdditionItem[];
}

interface AdditionResponse {
  ok: boolean;
  additions?: AdditionFile;
  error?: string;
}

const emptyAdditionFile = (): AdditionFile => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  items: [],
});

const readAdditionFile = async (): Promise<AdditionFile> => {
  try {
    const content = await fs.readFile(ADDITIONS_FILE_PATH, "utf8");
    return JSON.parse(content) as AdditionFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const initial = emptyAdditionFile();
      await fs.writeFile(
        ADDITIONS_FILE_PATH,
        JSON.stringify(initial, null, 2),
        "utf8",
      );
      return initial;
    }
    throw error;
  }
};

const normalizeAdditionItem = (item: AdditionItem): AdditionItem => {
  if (!Array.isArray(item.points) || item.points.length < 3) {
    throw new Error("addition item must include >= 3 points");
  }
  const bbox =
    Array.isArray(item.bbox) && item.bbox.length === 4
      ? item.bbox
      : ((): [number, number, number, number] => {
          const xs = item.points.map((point) => point.x);
          const ys = item.points.map((point) => point.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          return [minX, minY, maxX - minX, maxY - minY];
        })();

  return {
    id: String(item.id),
    label: item.label ?? `追加領域 ${item.id}`,
    points: item.points.map((point) => ({ x: point.x, y: point.y })),
    bbox,
    score: typeof item.score === "number" ? item.score : 1,
    iou: typeof item.iou === "number" ? item.iou : 1,
    metrics: item.metrics ?? {},
  };
};

export async function GET() {
  try {
    const additions = await readAdditionFile();
    return NextResponse.json(
      { ok: true, additions } satisfies AdditionResponse,
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to load annotation-additions.json", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load annotation additions" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const current = await readAdditionFile();
    const body = (await request.json()) as {
      version?: number;
      items?: AdditionItem[];
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
          additions: current,
        } satisfies AdditionResponse,
        { status: 409 },
      );
    }

    const normalized = body.items.map((item) => normalizeAdditionItem(item));
    const next: AdditionFile = {
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      items: normalized,
    };

    await fs.writeFile(
      ADDITIONS_FILE_PATH,
      JSON.stringify(next, null, 2),
      "utf8",
    );

    return NextResponse.json(
      { ok: true, additions: next } satisfies AdditionResponse,
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to save annotation-additions.json", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save annotation additions" },
      { status: 500 },
    );
  }
}
