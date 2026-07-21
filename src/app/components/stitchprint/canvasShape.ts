import type { Point2 } from './types';

/** Outer silhouette of the printable canvas (bounding box is still W×H). */
export type CanvasShape =
  | 'rect'
  | 'rounded-rect'
  | 'capsule'
  | 'circle'
  | 'ellipse'
  | 'hexagon'
  | 'diamond'
  | 'heart'
  | 'star'
  | 'polygon';

/** Per-shape tunables (only the relevant field is read for each shape). */
export interface ShapeOptions {
  /** Regular polygon side count (shape === 'polygon'), 3–12. */
  polygonSides?: number;
  /** Star point count (shape === 'star'), 4–12. */
  starPoints?: number;
  /** Heart plumpness (shape === 'heart'), ~0.6 (slim) … 1.4 (full). */
  heartFullness?: number;
}

export const DEFAULT_SHAPE_OPTIONS: Required<ShapeOptions> = {
  polygonSides: 6,
  starPoints: 5,
  heartFullness: 1,
};

export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function shapeBounds(
  offsetX: number,
  offsetY: number,
  usedW: number,
  usedH: number
): ShapeBounds {
  return { x: offsetX, y: offsetY, width: usedW, height: usedH };
}

/**
 * Closed outline polyline for silhouette / border / filled backboard /
 * clipping. Curved shapes are densely sampled so hit-tests and clips stay
 * accurate. The polygon returned is the single source of truth: cell
 * occupancy and grid clipping both run against it.
 */
export function canvasShapeOutline(
  shape: CanvasShape,
  bounds: ShapeBounds,
  options: ShapeOptions = {}
): Point2[] {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;

  switch (shape) {
    case 'rect':
      return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ];
    case 'rounded-rect':
      return roundedRectOutline(bounds, Math.min(width, height) * 0.18);
    case 'capsule':
      return roundedRectOutline(bounds, Math.min(width, height) / 2);
    case 'circle': {
      const r = Math.min(width, height) / 2;
      return sampleEllipse(cx, cy, r, r, 72);
    }
    case 'ellipse':
      return sampleEllipse(cx, cy, rx, ry, 72);
    case 'hexagon':
      return [
        { x: x + width * 0.25, y },
        { x: x + width * 0.75, y },
        { x: x + width, y: cy },
        { x: x + width * 0.75, y: y + height },
        { x: x + width * 0.25, y: y + height },
        { x, y: cy },
      ];
    case 'diamond':
      return [
        { x: cx, y },
        { x: x + width, y: cy },
        { x: cx, y: y + height },
        { x, y: cy },
      ];
    case 'polygon':
      return regularPolygonOutline(
        cx,
        cy,
        rx,
        ry,
        clampInt(options.polygonSides ?? DEFAULT_SHAPE_OPTIONS.polygonSides, 3, 12)
      );
    case 'star':
      return starOutline(
        cx,
        cy,
        rx,
        ry,
        clampInt(options.starPoints ?? DEFAULT_SHAPE_OPTIONS.starPoints, 4, 12)
      );
    case 'heart':
      return heartOutline(
        bounds,
        options.heartFullness ?? DEFAULT_SHAPE_OPTIONS.heartFullness
      );
    default:
      return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ];
  }
}

function roundedRectOutline(bounds: ShapeBounds, radius: number): Point2[] {
  const { x, y, width, height } = bounds;
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  const seg = 10;
  const pts: Point2[] = [];
  const corners: Array<{ ox: number; oy: number; a0: number }> = [
    { ox: x + width - r, oy: y + r, a0: -Math.PI / 2 },
    { ox: x + width - r, oy: y + height - r, a0: 0 },
    { ox: x + r, oy: y + height - r, a0: Math.PI / 2 },
    { ox: x + r, oy: y + r, a0: Math.PI },
  ];
  for (const corner of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = corner.a0 + (i / seg) * (Math.PI / 2);
      pts.push({ x: corner.ox + Math.cos(a) * r, y: corner.oy + Math.sin(a) * r });
    }
  }
  return pts;
}

function regularPolygonOutline(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  sides: number
): Point2[] {
  const pts: Point2[] = [];
  const start = -Math.PI / 2; // point up
  for (let i = 0; i < sides; i++) {
    const a = start + (i / sides) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

function starOutline(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  points: number
): Point2[] {
  const pts: Point2[] = [];
  const start = -Math.PI / 2;
  const inner = 0.42; // inner/outer radius ratio
  const steps = points * 2;
  for (let i = 0; i < steps; i++) {
    const a = start + (i / steps) * Math.PI * 2;
    const k = i % 2 === 0 ? 1 : inner;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

/**
 * Plump, adjustable heart. `fullness` widens the lobes and softens the
 * bottom; the raw curve is normalized to fill the bounding box.
 */
function heartOutline(bounds: ShapeBounds, fullness: number): Point2[] {
  const f = Math.max(0.6, Math.min(1.4, fullness));
  const wide = 0.72 + 0.5 * f; // horizontal plumpness
  const n = 96;
  const raw: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const hx = Math.sin(t) ** 3 * 16 * wide;
    const hy =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    raw.push({ x: hx, y: -hy }); // y down
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of raw) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const { x, y, width, height } = bounds;
  return raw.map((p) => ({
    x: x + ((p.x - minX) / spanX) * width,
    y: y + ((p.y - minY) / spanY) * height,
  }));
}

function sampleEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments: number
): Point2[] {
  const pts: Point2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

/** Even-odd point-in-polygon test (works for concave shapes). */
export function pointInPolygon(polygon: Point2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * True if (x,y) lies inside the canvas silhouette. Runs against the shape's
 * sampled outline so every shape shares one consistent boundary.
 */
export function pointInCanvasShape(
  shape: CanvasShape,
  bounds: ShapeBounds,
  x: number,
  y: number,
  options: ShapeOptions = {}
): boolean {
  if (shape === 'rect') {
    return (
      x >= bounds.x - 1e-6 &&
      x <= bounds.x + bounds.width + 1e-6 &&
      y >= bounds.y - 1e-6 &&
      y <= bounds.y + bounds.height + 1e-6
    );
  }
  return pointInPolygon(canvasShapeOutline(shape, bounds, options), x, y);
}

/** Cell is part of the canvas if its center lies inside the silhouette. */
export function cellInCanvasShape(
  shape: CanvasShape,
  bounds: ShapeBounds,
  cellCenterX: number,
  cellCenterY: number,
  options: ShapeOptions = {}
): boolean {
  return pointInCanvasShape(shape, bounds, cellCenterX, cellCenterY, options);
}

/**
 * Clip a straight segment a→b to the interior of a closed polygon.
 * Returns the interior sub-segments (handles concave shapes via midpoint
 * tests). Used to trim grid bars that overflow a non-rect silhouette.
 */
export function clipSegmentToPolygon(
  polygon: Point2[],
  a: Point2,
  b: Point2
): Array<[Point2, Point2]> {
  if (polygon.length < 3) return [[a, b]];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ts = new Set<number>([0, 1]);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const t = segmentIntersectT(a.x, a.y, dx, dy, p, q);
    if (t !== null && t > 0 && t < 1) ts.add(t);
  }
  const sorted = Array.from(ts).sort((m, n) => m - n);
  const out: Array<[Point2, Point2]> = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const t0 = sorted[i];
    const t1 = sorted[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const mid = (t0 + t1) / 2;
    const mx = a.x + dx * mid;
    const my = a.y + dy * mid;
    if (!pointInPolygon(polygon, mx, my)) continue;
    out.push([
      { x: a.x + dx * t0, y: a.y + dy * t0 },
      { x: a.x + dx * t1, y: a.y + dy * t1 },
    ]);
  }
  return out;
}

/** Parametric t along a+(dx,dy) where it crosses edge p→q, or null. */
function segmentIntersectT(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  p: Point2,
  q: Point2
): number | null {
  const ex = q.x - p.x;
  const ey = q.y - p.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((p.x - ax) * ey - (p.y - ay) * ex) / denom;
  const s = ((p.x - ax) * dy - (p.y - ay) * dx) / denom;
  if (s < -1e-9 || s > 1 + 1e-9) return null;
  return t;
}

/**
 * Clip a horizontal span [x0,x1] at y against a closed polygon.
 * Returns zero or more interior intervals for serpentine fill.
 */
export function clipHorizontalToPolygon(
  polygon: Point2[],
  y: number,
  xMin: number,
  xMax: number
): Array<[number, number]> {
  if (polygon.length < 3) return [];
  const crossings: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y);
      crossings.push(a.x + t * (b.x - a.x));
    }
  }
  crossings.sort((p, q) => p - q);
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const left = Math.max(xMin, crossings[i]);
    const right = Math.min(xMax, crossings[i + 1]);
    if (right - left > 0.05) intervals.push([left, right]);
  }
  return intervals;
}
