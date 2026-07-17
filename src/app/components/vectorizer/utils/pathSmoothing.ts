/**
 * Path cleaning + cubic Bezier fitting for smooth vector strokes.
 * Goal: few C commands, not a polyline of pixel steps.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Remove duplicate points, 1-pixel spikes, and short reverse retraces.
 * Conservative: never collapse a path below a usable knot count.
 */
export function cleanContour(points: Point[], closed: boolean): Point[] {
  if (points.length < 3) return points;

  // 1) Drop consecutive near-duplicates
  let cleaned: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const curr = points[i];
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) >= 0.35) {
      cleaned.push(curr);
    }
  }

  if (closed && cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.35) {
      cleaned.pop();
    }
  }

  if (cleaned.length < 3) return points;

  // 2) Remove only clear backtracks (not every staircase corner)
  const afterSpikes = removeSpikes(cleaned, closed);
  // Keep result only if we didn't destroy the path
  const minKeep = Math.max(3, Math.floor(cleaned.length * 0.35));
  if (afterSpikes.length >= minKeep) {
    cleaned = afterSpikes;
  }

  return cleaned.length >= 3 ? cleaned : points;
}

function removeSpikes(points: Point[], closed: boolean): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    if (!closed && (i === 0 || i === points.length - 1)) {
      out.push(curr);
      continue;
    }

    const dPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dNext = Math.hypot(next.x - curr.x, next.y - curr.y);

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    const cos = len1 > 0 && len2 > 0 ? (v1x * v2x + v1y * v2y) / (len1 * len2) : 1;

    // Only drop near-180° hairpin reversals on very short legs
    const isBacktrack = cos < -0.85 && dPrev < 2.5 && dNext < 2.5;
    if (isBacktrack) continue;

    out.push(curr);
  }

  return out.length >= 3 ? out : points;
}

/**
 * Light path smoothing. Open paths keep endpoints fixed (no circular wrap).
 */
export function smoothContour(points: Point[], passes: number = 2, closed: boolean = true): Point[] {
  if (points.length < 5) return points;
  let current = points;
  for (let p = 0; p < passes; p++) {
    const next: Point[] = new Array(current.length);
    for (let i = 0; i < current.length; i++) {
      if (!closed && (i === 0 || i === current.length - 1)) {
        next[i] = { ...current[i] };
        continue;
      }
      const prev = current[(i - 1 + current.length) % current.length];
      const curr = current[i];
      const nxt = current[(i + 1) % current.length];
      next[i] = {
        x: prev.x * 0.25 + curr.x * 0.5 + nxt.x * 0.25,
        y: prev.y * 0.25 + curr.y * 0.5 + nxt.y * 0.25,
      };
    }
    current = next;
  }
  return current;
}

/**
 * Douglas-Peucker with closed-path handling.
 */
export function simplifyClosedPath(points: Point[], epsilon: number): Point[] {
  if (points.length <= 3) return points;
  if (epsilon <= 0) return points;

  // Rotate so the farthest-from-centroid point is an anchor (stable DP for rings)
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  let maxIdx = 0;
  let maxDist = -1;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - cx, points[i].y - cy);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  const rotated = [...points.slice(maxIdx), ...points.slice(0, maxIdx)];
  // Open DP on ring by duplicating first at end, then drop duplicate
  const open = [...rotated, rotated[0]];
  const simplified = douglasPeucker(open, epsilon);
  if (simplified.length >= 2) {
    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.01) {
      return simplified.slice(0, -1);
    }
  }
  return simplified.length >= 3 ? simplified : points;
}

function douglasPeucker(pts: Point[], epsilon: number): Point[] {
  if (pts.length <= 2) return pts;

  let maxDist = 0;
  let index = 0;
  const end = pts.length - 1;
  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(pts[i], pts[0], pts[end]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, index + 1), epsilon);
    const right = douglasPeucker(pts.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[end]];
}

function perpendicularDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/**
 * Adaptive simplify epsilon from UI precision (0–100).
 * Higher precision → smaller epsilon, but always enough to kill pixel stairs.
 */
export function simplifyEpsilonFromPrecision(precision: number, pathLength: number): number {
  // precision 100 → ~0.9px, precision 50 → ~2.4px, precision 0 → ~4.5px
  const base = 0.9 + ((100 - Math.max(0, Math.min(100, precision))) / 100) * 3.6;
  // Slightly larger epsilon on long paths so curves don't keep hundreds of knots
  const lengthBoost = Math.min(1.2, pathLength / 800);
  return base + lengthBoost;
}

function pathLength(points: Point[], closed: boolean): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  if (closed && points.length > 1) {
    const a = points[0];
    const b = points[points.length - 1];
    len += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return len;
}

/**
 * Full prep: clean → smooth → simplify → light re-smooth.
 * Extra smoothing after DP removes the hard kinks DP leaves at kept knots.
 */
export function prepareContourForBezier(
  points: Point[],
  closed: boolean,
  precision: number
): Point[] {
  if (points.length < 2) return points;

  let pts = cleanContour(points, closed);
  // Stronger pre-smooth kills pixel stairs before simplify
  pts = smoothContour(pts, closed ? 3 : 2, closed);
  pts = cleanContour(pts, closed);

  const len = pathLength(pts, closed);
  // Slightly larger epsilon → fewer knots → smoother cubics
  const epsilon = Math.max(
    1.0,
    simplifyEpsilonFromPrecision(precision, len) * (closed ? 1.15 : 0.85)
  );
  pts = closed ? simplifyClosedPath(pts, epsilon) : douglasPeucker(pts, epsilon);
  pts = cleanContour(pts, closed);

  // Cap knot count, but never below a usable minimum for curves
  const maxKnots = closed ? 48 : 64;
  const minKnots = closed ? 4 : 3;
  if (pts.length > maxKnots) {
    const boost = epsilon * Math.sqrt(pts.length / maxKnots);
    const reduced = closed ? simplifyClosedPath(pts, boost) : douglasPeucker(pts, boost);
    if (reduced.length >= minKnots) {
      pts = cleanContour(reduced, closed);
    }
  }

  // Soften remaining angular knots without collapsing the shape
  if (pts.length >= 5) {
    pts = smoothContour(pts, 1, closed);
  }

  // Absolute fallback — never return empty / degenerate
  if (pts.length < minKnots) {
    return points.length >= minKnots ? points : pts;
  }
  return pts;
}

/**
 * One-shot: prepare contour then emit fitted Bezier SVG path.
 */
export function contourToSmoothBezierPath(
  points: Point[],
  closed: boolean,
  precision: number
): { points: Point[]; svgPath: string } {
  if (points.length < 2) {
    return { points, svgPath: pointsToLinePath(points, closed) };
  }

  const prepared = prepareContourForBezier(points, closed, precision);

  // Only true rectangles / regular polygons keep straight edges.
  // Everything else — including soft bends that look "almost polygonal" —
  // should be cubic Beziers so curves don't stay hard-edged.
  if (closed && prepared.length === 4 && looksRectangular(prepared)) {
    return { points: prepared, svgPath: polygonPath(prepared) };
  }

  if (prepared.length < 3) {
    return { points: prepared, svgPath: pointsToLinePath(prepared, closed) };
  }

  const svgPath = pointsToFittedBezierPath(prepared, closed);
  if (!svgPath || svgPath.length < 5) {
    return { points: prepared, svgPath: pointsToLinePath(prepared, closed) };
  }

  return { points: prepared, svgPath };
}

function pointsToLinePath(points: Point[], closed: boolean): string {
  if (points.length === 0) return '';
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`;
  }
  if (closed && points.length >= 3) d += ' Z';
  return d;
}

/**
 * Fit a smooth cubic-Bezier SVG path through keypoints.
 * Always uses cubics (no hard L on curves). Sharp geometric corners get
 * near-zero tangents so they stay crisp without polyline segments.
 */
export function pointsToFittedBezierPath(points: Point[], closed: boolean): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  if (points.length === 2) {
    return `M ${fmt(points[0].x)} ${fmt(points[0].y)} L ${fmt(points[1].x)} ${fmt(points[1].y)}`;
  }

  const n = points.length;

  // Only mark strong geometric corners (long legs + near-90°).
  // Mild bends that used to become L stay as smooth cubics.
  const cornerSharpness = points.map((_, i) => {
    if (!closed && (i === 0 || i === n - 1)) return 0;
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const d0 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d1 = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (d0 < 10 || d1 < 10) return 0;

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const turn = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
    // Strict near-right-angle only (~82°–98°)
    if (turn > Math.PI * 0.455 && turn < Math.PI * 0.545) return 1;
    return 0;
  });

  // Higher tangent scale = rounder curves (Catmull-Rom default is 1/6 ≈ 0.167).
  // 1/4.5 ≈ 0.22 gives visibly smoother bends without wild overshoot.
  const tangentScale = 1 / 4.5;

  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  const count = closed ? n : n - 1;

  for (let i = 0; i < count; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const prev = points[(i - 1 + n) % n];
    const next2 = points[(i + 2) % n];

    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (segLen < 1e-6) continue;

    // Tangents; collapse at sharp corners so the curve meets crisply
    let t0x: number;
    let t0y: number;
    let t1x: number;
    let t1y: number;

    if (!closed && i === 0) {
      t0x = (p1.x - p0.x) / 3;
      t0y = (p1.y - p0.y) / 3;
    } else if (cornerSharpness[i] > 0) {
      t0x = 0;
      t0y = 0;
    } else {
      t0x = (p1.x - prev.x) * tangentScale;
      t0y = (p1.y - prev.y) * tangentScale;
    }

    if (!closed && i + 1 === n - 1) {
      t1x = (p1.x - p0.x) / 3;
      t1y = (p1.y - p0.y) / 3;
    } else if (cornerSharpness[(i + 1) % n] > 0) {
      t1x = 0;
      t1y = 0;
    } else {
      t1x = (next2.x - p0.x) * tangentScale;
      t1y = (next2.y - p0.y) * tangentScale;
    }

    // Cap control-point length so short segments don't balloon
    const maxCp = segLen * 0.55;
    const t0Len = Math.hypot(t0x, t0y);
    if (t0Len > maxCp && t0Len > 0) {
      const s = maxCp / t0Len;
      t0x *= s;
      t0y *= s;
    }
    const t1Len = Math.hypot(t1x, t1y);
    if (t1Len > maxCp && t1Len > 0) {
      const s = maxCp / t1Len;
      t1x *= s;
      t1y *= s;
    }

    const cp1 = { x: p0.x + t0x, y: p0.y + t0y };
    const cp2 = { x: p1.x - t1x, y: p1.y - t1y };

    d += ` C ${fmt(cp1.x)} ${fmt(cp1.y)} ${fmt(cp2.x)} ${fmt(cp2.y)} ${fmt(p1.x)} ${fmt(p1.y)}`;
  }

  if (closed) d += ' Z';
  return d;
}

/** True only for near-axis-aligned rectangles with four right angles. */
function looksRectangular(points: Point[]): boolean {
  if (points.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const prev = points[(i + 3) % 4];
    const curr = points[i];
    const next = points[(i + 1) % 4];
    const d0 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d1 = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (d0 < 4 || d1 < 4) return false;
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const turn = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
    if (turn < Math.PI * 0.40 || turn > Math.PI * 0.60) return false;
  }
  // Opposite sides similar
  const s0 = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const s1 = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
  const s2 = Math.hypot(points[3].x - points[2].x, points[3].y - points[2].y);
  const s3 = Math.hypot(points[0].x - points[3].x, points[0].y - points[3].y);
  const opp0 = Math.min(s0, s2) / Math.max(s0, s2);
  const opp1 = Math.min(s1, s3) / Math.max(s1, s3);
  return opp0 >= 0.75 && opp1 >= 0.75;
}

function polygonPath(points: Point[]): string {
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`;
  }
  d += ' Z';
  return d;
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

