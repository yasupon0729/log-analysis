import type { AnnotationBoundary } from "@/lib/annotation/data";

export interface RegionHitResult {
  id: string;
  label: string;
  boundary: AnnotationBoundary;
}

export function findRegionContainingPoint(
  boundaries: AnnotationBoundary[],
  x: number,
  y: number,
  options?: {
    skip?: (id: string, boundary: AnnotationBoundary) => boolean;
  },
): RegionHitResult | null {
  for (let index = 0; index < boundaries.length; index += 1) {
    const boundary = boundaries[index];
    if (isPointInsidePolygon(boundary.polygon.vertices, x, y)) {
      const id = `region-${index + 1}`;
      if (options?.skip?.(id, boundary)) {
        // Skip disabled or filtered regions but continue searching.
        // eslint-disable-next-line no-continue
        continue;
      }
      return {
        id,
        label: `領域 ${index + 1}`,
        boundary,
      };
    }
  }
  return null;
}

export function isPointInsidePolygon(
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
