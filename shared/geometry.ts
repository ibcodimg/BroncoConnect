import type { Point, Stroke } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The polyline that a stroke actually draws (shapes become their outline). */
export function strokePath(s: Stroke): Point[] {
  const a = s.points[0];
  const b = s.points[s.points.length - 1];
  if (!a) return [];
  switch (s.tool) {
    case 'pen':
      return s.points;
    case 'line':
      return [a, b];
    case 'rect':
      return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
    case 'ellipse': {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      return Array.from({ length: 33 }, (_, i) => {
        const t = (i / 32) * Math.PI * 2;
        return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
      });
    }
    default:
      return s.points;
  }
}

/** Does a circle of `radius` around p touch the stroke? */
export function strokeHit(s: Stroke, p: Point, radius: number): boolean {
  const path = strokePath(s);
  const reach = radius + s.width / 2;
  if (path.length === 1) return Math.hypot(p.x - path[0].x, p.y - path[0].y) <= reach;
  for (let i = 1; i < path.length; i++) if (distToSegment(p, path[i - 1], path[i]) <= reach) return true;
  return false;
}

export function strokeBounds(s: Stroke): Rect {
  const path = strokePath(s);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = s.width / 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

export function unionBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const r = Math.max(...rects.map((r) => r.x + r.w));
  const b = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: r - x, h: b - y };
}

/** Rect from two drag corners, in any direction. */
export function rectFrom(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** Moves strokes so their bounding box's top-left lands at `to`. */
export function translateTo(strokes: Stroke[], to: Point): Stroke[] {
  const box = unionBounds(strokes.map(strokeBounds));
  if (!box) return strokes;
  const dx = to.x - box.x;
  const dy = to.y - box.y;
  return strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) })) }));
}
