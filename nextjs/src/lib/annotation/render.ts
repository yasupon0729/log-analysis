import type { AnnotationBoundary, AnnotationDataset } from "@/lib/annotation/data";

const CANVAS_WIDTH = 1049;
const CANVAS_HEIGHT = 695;

interface RenderOverlayOptions {
  dataset: AnnotationDataset;
  highlightIds?: string[];
  hoveredId?: string | null;
  disabledIds?: Set<string>;
  includeOutline?: boolean;
}

interface OverlaySegment {
  id: string;
  boundary: AnnotationBoundary;
  kind: "hover" | "queue";
}

export function renderOverlaySvg({
  dataset,
  highlightIds = [],
  hoveredId,
  disabledIds,
  includeOutline = false,
}: RenderOverlayOptions): string {
  const outlineSegments = includeOutline ? collectAllSegments(dataset) : [];
  const segments = collectSegments(dataset, highlightIds, hoveredId, disabledIds);

  if (segments.length === 0 && outlineSegments.length === 0) {
    return buildEmptyOverlay();
  }

  const outlinePaths = outlineSegments
    .map((segment) => {
      const pathData = buildPathData(segment.boundary.polygon.vertices);
      return `<path d="${pathData}" fill="none" stroke="rgba(148, 163, 184, 0.55)" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="4 6" />`;
    })
    .join("\n");

  const queuedPolygons = segments
    .map((segment) => {
      const color = segment.kind === "hover" ? "rgba(59,130,246,0.35)" : "rgba(220,38,38,0.28)";
      const stroke = segment.kind === "hover" ? "rgba(37,99,235,0.95)" : "rgba(220,38,38,0.95)";
      const pathData = buildPathData(segment.boundary.polygon.vertices);
      return `<path d="${pathData}" fill="${color}" stroke="${stroke}" stroke-width="2" vector-effect="non-scaling-stroke" />`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" shape-rendering="geometricPrecision">
  <rect width="100%" height="100%" fill="transparent" />
  ${outlinePaths}
  ${queuedPolygons}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function collectSegments(
  dataset: AnnotationDataset,
  highlightIds: string[],
  hoveredId: string | null | undefined,
  disabledIds?: Set<string>,
): OverlaySegment[] {
  const segments: OverlaySegment[] = [];
  const disabled = disabledIds ?? new Set<string>();

  const queueSet = new Set(highlightIds);
  if (hoveredId) {
    queueSet.delete(hoveredId);
  }

  for (const id of queueSet) {
    if (disabled.has(id)) {
      continue;
    }
    const boundary = getBoundaryById(dataset, id);
    if (!boundary) {
      continue;
    }
    segments.push({ id, boundary, kind: "queue" });
  }

  if (hoveredId && !disabled.has(hoveredId)) {
    const boundary = getBoundaryById(dataset, hoveredId);
    if (boundary) {
      segments.push({ id: hoveredId, boundary, kind: "hover" });
    }
  }

  return segments;
}

function collectAllSegments(dataset: AnnotationDataset): OverlaySegment[] {
  return dataset.boundaries.map((boundary, index) => ({
    id: `region-${index + 1}`,
    boundary,
    kind: "queue" as const,
  }));
}

function buildPathData(vertices: AnnotationBoundary["polygon"]["vertices"]): string {
  if (!vertices.length) {
    return "";
  }

  const commands = vertices.map((vertex, index) => {
    const jitterX = vertex.x + jitter(vertex.x, vertex.y);
    const jitterY = vertex.y + jitter(vertex.y, vertex.x);
    const cmd = index === 0 ? "M" : "L";
    return `${cmd}${jitterX.toFixed(2)} ${jitterY.toFixed(2)}`;
  });

  commands.push("Z");
  return commands.join(" ");
}

function jitter(x: number, y: number): number {
  const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (seed - Math.floor(seed)) * 0.6 - 0.3; // ±0.3px のジッター
}

function getBoundaryById(dataset: AnnotationDataset, id: string): AnnotationBoundary | null {
  const match = /^region-(\d+)$/.exec(id);
  if (!match) {
    return null;
  }
  const index = Number.parseInt(match[1] ?? "", 10) - 1;
  if (Number.isNaN(index) || index < 0 || index >= dataset.boundaries.length) {
    return null;
  }
  return dataset.boundaries[index] ?? null;
}

function buildEmptyOverlay(): string {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
  <rect width="100%" height="100%" fill="transparent" />
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
