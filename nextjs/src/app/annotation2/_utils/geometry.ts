import type { Point } from "../_types";

// ポイント配列からバウンディングボックス [x, y, w, h] を計算する
export function calculateBBox(
  points: Point[],
): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0];

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return [minX, minY, maxX - minX, maxY - minY];
}
