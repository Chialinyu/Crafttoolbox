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
  /** Star inner radius as a percentage of its outer radius, 15–80. */
  starInnerRadiusPercent?: number;
  /** Corner rounding in millimeters for supported geometric silhouettes. */
  cornerRadiusMm?: number;
  /** Heart lobe fullness, ~0.6 (slim) … 1.4 (full). */
  heartFullness?: number;
  /** Heart center-notch depth, ~0.5 (shallow) … 1.5 (deep). */
  heartNotchDepth?: number;
  /** Heart bottom-tip roundness, 0 (pointed) … 1 (round). */
  heartTipRoundness?: number;
}

export const DEFAULT_SHAPE_OPTIONS: Required<ShapeOptions> = {
  polygonSides: 6,
  starPoints: 5,
  starInnerRadiusPercent: 42,
  cornerRadiusMm: 0,
  heartFullness: 1,
  heartNotchDepth: 1,
  heartTipRoundness: 0.25,
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
      return roundedRectOutline(
        bounds,
        options.cornerRadiusMm ?? Math.min(width, height) * 0.18
      );
    case 'capsule':
      return roundedRectOutline(bounds, Math.min(width, height) / 2);
    case 'circle': {
      const r = Math.min(width, height) / 2;
      return sampleEllipse(cx, cy, r, r, 72);
    }
    case 'ellipse':
      return sampleEllipse(cx, cy, rx, ry, 72);
    case 'hexagon':
      return roundPolygonCorners([
        { x: x + width * 0.25, y },
        { x: x + width * 0.75, y },
        { x: x + width, y: cy },
        { x: x + width * 0.75, y: y + height },
        { x: x + width * 0.25, y: y + height },
        { x, y: cy },
      ], options.cornerRadiusMm ?? DEFAULT_SHAPE_OPTIONS.cornerRadiusMm);
    case 'diamond':
      return roundPolygonCorners([
        { x: cx, y },
        { x: x + width, y: cy },
        { x: cx, y: y + height },
        { x, y: cy },
      ], options.cornerRadiusMm ?? DEFAULT_SHAPE_OPTIONS.cornerRadiusMm);
    case 'polygon': {
      const vertices = regularPolygonOutline(
        cx,
        cy,
        rx,
        ry,
        clampInt(options.polygonSides ?? DEFAULT_SHAPE_OPTIONS.polygonSides, 3, 12)
      );
      return roundPolygonCorners(
        vertices,
        options.cornerRadiusMm ?? DEFAULT_SHAPE_OPTIONS.cornerRadiusMm
      );
    }
    case 'star': {
      const vertices = starOutline(
        cx,
        cy,
        rx,
        ry,
        clampInt(options.starPoints ?? DEFAULT_SHAPE_OPTIONS.starPoints, 4, 12),
        options.starInnerRadiusPercent ?? DEFAULT_SHAPE_OPTIONS.starInnerRadiusPercent
      );
      return roundPolygonCorners(
        vertices,
        options.cornerRadiusMm ?? DEFAULT_SHAPE_OPTIONS.cornerRadiusMm
      );
    }
    case 'heart':
      return heartOutline(
        bounds,
        options.heartFullness ?? DEFAULT_SHAPE_OPTIONS.heartFullness,
        options.heartNotchDepth ?? DEFAULT_SHAPE_OPTIONS.heartNotchDepth,
        options.heartTipRoundness ?? DEFAULT_SHAPE_OPTIONS.heartTipRoundness
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
  points: number,
  innerRadiusPercent: number
): Point2[] {
  const pts: Point2[] = [];
  const start = -Math.PI / 2;
  const inner = Math.max(0.15, Math.min(0.8, innerRadiusPercent / 100));
  const steps = points * 2;
  for (let i = 0; i < steps; i++) {
    const a = start + (i / steps) * Math.PI * 2;
    const k = i % 2 === 0 ? 1 : inner;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

/**
 * Adjustable heart. Fullness changes the side curvature (not just scale),
 * notch depth moves the center cleft, and tip roundness blends the pointed
 * sin³ profile toward a smooth sin profile near the bottom.
 */
function heartOutline(
  bounds: ShapeBounds,
  fullness: number,
  notchDepth: number,
  tipRoundness: number
): Point2[] {
  const f = Math.max(0.6, Math.min(1.4, fullness));
  const notch = Math.max(0.5, Math.min(1.5, notchDepth));
  const tip = Math.max(0, Math.min(1, tipRoundness));
  const sideExponent = 3 / f;
  const n = 96;
  const raw: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const sin = Math.sin(t);
    const plumpProfile = Math.sign(sin) * Math.abs(sin) ** sideExponent;
    const tipProfile = sin;
    const hx = 16 * ((1 - tip * 0.35) * plumpProfile + tip * 0.35 * tipProfile);
    const hy =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    // t≈0 is the top-center notch. Positive y moves it deeper into the heart.
    const notchOffset = (notch - 1) * 5 * Math.max(0, Math.cos(t)) ** 8;
    raw.push({ x: hx, y: -hy + notchOffset }); // y down
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

/**
 * Figma-like corner rounding for closed polygon vertices. `radius` is a
 * physical cutback in millimeters, clamped per edge to avoid self-overlap.
 * Sampling quadratic corners keeps SVG, hit-testing and G-code on one outline.
 */
function roundPolygonCorners(vertices: Point2[], radius: number): Point2[] {
  const r = Math.max(0, radius);
  if (r <= 1e-6 || vertices.length < 3) return vertices;
  const rounded: Point2[] = [];
  const segments = 5;
  for (let i = 0; i < vertices.length; i++) {
    const prev = vertices[(i - 1 + vertices.length) % vertices.length];
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const prevLength = Math.hypot(prev.x - current.x, prev.y - current.y);
    const nextLength = Math.hypot(next.x - current.x, next.y - current.y);
    const cut = Math.min(r, prevLength * 0.45, nextLength * 0.45);
    if (cut <= 1e-6) {
      rounded.push(current);
      continue;
    }
    const incoming = {
      x: current.x + ((prev.x - current.x) / prevLength) * cut,
      y: current.y + ((prev.y - current.y) / prevLength) * cut,
    };
    const outgoing = {
      x: current.x + ((next.x - current.x) / nextLength) * cut,
      y: current.y + ((next.y - current.y) / nextLength) * cut,
    };
    for (let step = 0; step <= segments; step++) {
      const t = step / segments;
      const u = 1 - t;
      rounded.push({
        x: u * u * incoming.x + 2 * u * t * current.x + t * t * outgoing.x,
        y: u * u * incoming.y + 2 * u * t * current.y + t * t * outgoing.y,
      });
    }
  }
  return rounded;
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
