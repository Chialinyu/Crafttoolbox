/**
 * Schneider cubic Bézier fitting (Graphics Gems, 1990).
 * Fits digitized polylines to G1 piecewise cubics — the standard approach
 * for turning pixel/round corners into real vector curves.
 */

export interface Point2 {
  x: number;
  y: number;
}

export type CubicBezier = [Point2, Point2, Point2, Point2]; // p0, cp1, cp2, p3

/**
 * Fit one or more cubic Béziers to a polyline within maxError (pixels).
 */
export function fitCurve(points: Point2[], maxError: number): CubicBezier[] {
  if (points.length < 2) return [];
  if (points.length === 2) {
    const [a, b] = points;
    return [[a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b]];
  }

  const cleaned = dedupeConsecutive(points, 0.25);
  if (cleaned.length < 2) return [];
  if (cleaned.length === 2) {
    const [a, b] = cleaned;
    return [[a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b]];
  }

  const leftTangent = normalize(sub(cleaned[1], cleaned[0]));
  const rightTangent = normalize(sub(cleaned[cleaned.length - 2], cleaned[cleaned.length - 1]));
  return fitCubic(cleaned, 0, cleaned.length - 1, leftTangent, rightTangent, maxError * maxError);
}

/**
 * Fit a closed ring. Splits only at true sharp corners; rounded corners
 * stay inside cubic segments.
 *
 * Smooth closed loops (circles, ovals) prefer 4 perfect ellipse arcs, else
 * a shared G1 seam tangent — independent end tangents caused a single kink.
 */
export function fitClosedCurve(points: Point2[], maxError: number): CubicBezier[] {
  const cleaned = dedupeConsecutive(points, 0.25);
  if (cleaned.length < 3) return [];

  let ring = cleaned;
  if (
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 0.5
  ) {
    ring = ring.slice(0, -1);
  }
  if (ring.length < 3) return [];

  // Near-circle / near-ellipse → 4 magic-constant cubics (no seam kink).
  const perfect = fitClosedAsEllipseArcs(ring, maxError);
  if (perfect) return perfect;

  const corners = findSharpCorners(ring);
  if (corners.length === 0) {
    const start = farthestFromCentroid(ring);
    const ordered = [...ring.slice(start), ...ring.slice(0, start)];
    const closedPts = [...ordered, ordered[0]];
    // Shared tangent across seam (central difference)
    const prev = ordered[ordered.length - 1];
    const next = ordered[1];
    const shared = normalize(sub(next, prev));
    return fitCubic(
      closedPts,
      0,
      closedPts.length - 1,
      shared,
      scale(shared, -1),
      maxError * maxError
    );
  }

  const beziers: CubicBezier[] = [];
  for (let c = 0; c < corners.length; c++) {
    const i0 = corners[c];
    const i1 = corners[(c + 1) % corners.length];
    const seg = extractRingSegment(ring, i0, i1);
    if (seg.length < 2) continue;
    beziers.push(...fitCurve(seg, maxError));
  }
  return beziers;
}

/**
 * If the ring is a clean circle/ellipse, emit 4 magic-constant cubic arcs.
 * Uses mean radial distance (contour rings ≠ filled-disk moments).
 */
function fitClosedAsEllipseArcs(ring: Point2[], maxError: number): CubicBezier[] | null {
  if (ring.length < 12) return null;

  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x;
    cy += p.y;
  }
  cx /= ring.length;
  cy /= ring.length;

  // PCA for orientation / aspect
  let mxx = 0;
  let myy = 0;
  let mxy = 0;
  for (const p of ring) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    mxx += dx * dx;
    myy += dy * dy;
    mxy += dx * dy;
  }
  mxx /= ring.length;
  myy /= ring.length;
  mxy /= ring.length;

  const trace = mxx + myy;
  const det = mxx * myy - mxy * mxy;
  const disc = (trace * trace) / 4 - det;
  if (disc < 0) return null;

  let angle = 0;
  if (Math.abs(mxy) > 0.001) {
    angle = Math.atan2(2 * mxy, mxx - myy) / 2;
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Mean extent along PCA axes (correct for boundary rings)
  let sumA = 0;
  let sumB = 0;
  let countA = 0;
  let countB = 0;
  for (const p of ring) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    const r = Math.hypot(u, v);
    if (r < 1e-6) continue;
    // Weight by alignment with each axis
    const wu = Math.abs(u) / r;
    const wv = Math.abs(v) / r;
    sumA += Math.abs(u) * wu;
    sumB += Math.abs(v) * wv;
    countA += wu;
    countB += wv;
  }
  // Fallback: mean radius
  let meanR = 0;
  for (const p of ring) {
    meanR += Math.hypot(p.x - cx, p.y - cy);
  }
  meanR /= ring.length;

  let a = countA > 0 ? (sumA / countA) * 1.05 : meanR;
  let b = countB > 0 ? (sumB / countB) * 1.05 : meanR;
  // Stabilize with mean radius
  a = (a + meanR) / 2;
  b = (b + meanR) / 2;

  if (a < 3 || b < 3) return null;

  const aspect = Math.max(a, b) / Math.min(a, b);
  if (aspect > 2.4) return null;

  // For near-circles, force equal radii (true <circle>-quality arcs)
  if (aspect < 1.12) {
    const r = (a + b) / 2;
    a = r;
    b = r;
    angle = 0;
  }

  let err = 0;
  const c2 = Math.cos(angle);
  const s2 = Math.sin(angle);
  for (const p of ring) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = (dx * c2 + dy * s2) / a;
    const ly = (-dx * s2 + dy * c2) / b;
    const r = Math.hypot(lx, ly);
    err += (r - 1) * (r - 1);
  }
  const rms = Math.sqrt(err / ring.length);
  if (rms > Math.max(0.1, maxError * 0.1)) return null;

  return ellipseToFourBeziers(cx, cy, a, b, angle);
}

/** Classic κ = 4/3 tan(π/8) circle/ellipse as 4 cubics. */
function ellipseToFourBeziers(
  cx: number,
  cy: number,
  a: number,
  b: number,
  angle: number
): CubicBezier[] {
  const k = 0.5522847498;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const xf = (x: number, y: number) => ({
    x: cx + x * a * cos - y * b * sin,
    y: cy + x * a * sin + y * b * cos,
  });

  const anchors = [xf(1, 0), xf(0, 1), xf(-1, 0), xf(0, -1)];
  const cps: Array<[Point2, Point2]> = [
    [xf(1, k), xf(k, 1)],
    [xf(-k, 1), xf(-1, k)],
    [xf(-1, -k), xf(-k, -1)],
    [xf(k, -1), xf(1, -k)],
  ];

  return [
    [anchors[0], cps[0][0], cps[0][1], anchors[1]],
    [anchors[1], cps[1][0], cps[1][1], anchors[2]],
    [anchors[2], cps[2][0], cps[2][1], anchors[3]],
    [anchors[3], cps[3][0], cps[3][1], anchors[0]],
  ];
}

export function beziersToSvgPath(beziers: CubicBezier[], closed: boolean): string {
  if (beziers.length === 0) return '';
  const [p0, cp1, cp2, p3] = beziers[0];
  let d = `M ${fmt(p0.x)} ${fmt(p0.y)}`;
  d += ` C ${fmt(cp1.x)} ${fmt(cp1.y)} ${fmt(cp2.x)} ${fmt(cp2.y)} ${fmt(p3.x)} ${fmt(p3.y)}`;
  for (let i = 1; i < beziers.length; i++) {
    const [, c1, c2, end] = beziers[i];
    d += ` C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)}`;
  }
  if (closed) d += ' Z';
  return d;
}

export function beziersToKnots(beziers: CubicBezier[]): Point2[] {
  if (beziers.length === 0) return [];
  const knots: Point2[] = [{ ...beziers[0][0] }];
  for (const bez of beziers) {
    knots.push({ ...bez[3] });
  }
  return knots;
}

function fitCubic(
  points: Point2[],
  first: number,
  last: number,
  leftTangent: Point2,
  rightTangent: Point2,
  errorSquared: number
): CubicBezier[] {
  const nPts = last - first + 1;
  if (nPts === 2) {
    const dist =
      Math.hypot(points[last].x - points[first].x, points[last].y - points[first].y) / 3;
    return [
      [
        points[first],
        add(points[first], scale(leftTangent, dist)),
        add(points[last], scale(rightTangent, dist)),
        points[last],
      ],
    ];
  }

  let u = chordLengthParameterize(points, first, last);
  let bez = generateBezier(points, first, last, u, leftTangent, rightTangent);
  let { maxDistSq, splitPoint } = computeMaxError(points, first, last, bez, u);

  if (maxDistSq < errorSquared) {
    return [bez];
  }

  if (maxDistSq < errorSquared * 4) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(points, first, last, u, bez);
      bez = generateBezier(points, first, last, u, leftTangent, rightTangent);
      ({ maxDistSq, splitPoint } = computeMaxError(points, first, last, bez, u));
      if (maxDistSq < errorSquared) {
        return [bez];
      }
    }
  }

  // Ensure split is interior
  if (splitPoint <= first) splitPoint = first + 1;
  if (splitPoint >= last) splitPoint = last - 1;

  const splitTan = estimateTangent(points, splitPoint, first, last);
  const left = fitCubic(points, first, splitPoint, leftTangent, splitTan, errorSquared);
  const right = fitCubic(
    points,
    splitPoint,
    last,
    scale(splitTan, -1),
    rightTangent,
    errorSquared
  );
  return left.concat(right);
}

function generateBezier(
  points: Point2[],
  first: number,
  last: number,
  uPrime: number[],
  tHat1: Point2,
  tHat2: Point2
): CubicBezier {
  const nPts = last - first + 1;
  const A: Array<[Point2, Point2]> = new Array(nPts);

  for (let i = 0; i < nPts; i++) {
    const u = uPrime[i];
    const um = 1 - u;
    A[i] = [scale(tHat1, 3 * um * um * u), scale(tHat2, 3 * um * u * u)];
  }

  const C = [
    [0, 0],
    [0, 0],
  ];
  const X = [0, 0];
  const p0 = points[first];
  const p3 = points[last];

  for (let i = 0; i < nPts; i++) {
    const a = A[i];
    C[0][0] += dot(a[0], a[0]);
    C[0][1] += dot(a[0], a[1]);
    C[1][0] = C[0][1];
    C[1][1] += dot(a[1], a[1]);

    const u = uPrime[i];
    const rhs = sub(points[first + i], bezAffinePart(p0, p3, u));
    X[0] += dot(a[0], rhs);
    X[1] += dot(a[1], rhs);
  }

  const detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const detC0X = C[0][0] * X[1] - C[1][0] * X[0];
  const detXC1 = X[0] * C[1][1] - X[1] * C[0][1];

  let alphaL = Math.abs(detC0C1) < 1e-12 ? 0 : detXC1 / detC0C1;
  let alphaR = Math.abs(detC0C1) < 1e-12 ? 0 : detC0X / detC0C1;

  const segLength = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const epsilon = 1e-6 * segLength;
  if (alphaL < epsilon || alphaR < epsilon) {
    const dist = segLength / 3;
    return [p0, add(p0, scale(tHat1, dist)), add(p3, scale(tHat2, dist)), p3];
  }

  return [p0, add(p0, scale(tHat1, alphaL)), add(p3, scale(tHat2, alphaR)), p3];
}

/**
 * Affine part of cubic: [(1-u)^3 + 3(1-u)^2 u] P0 + [3(1-u)u^2 + u^3] P3
 * when P1 = P0 + α1 t1 and P2 = P3 + α2 t2.
 */
function bezAffinePart(p0: Point2, p3: Point2, u: number): Point2 {
  const um = 1 - u;
  const b0 = um * um * um + 3 * um * um * u;
  const b3 = 3 * um * u * u + u * u * u;
  return add(scale(p0, b0), scale(p3, b3));
}

function chordLengthParameterize(points: Point2[], first: number, last: number): number[] {
  const u = new Array(last - first + 1);
  u[0] = 0;
  for (let i = first + 1; i <= last; i++) {
    u[i - first] =
      u[i - first - 1] +
      Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const total = u[u.length - 1];
  if (total < 1e-12) {
    for (let i = 0; i < u.length; i++) u[i] = i / Math.max(1, u.length - 1);
    return u;
  }
  for (let i = 0; i < u.length; i++) u[i] /= total;
  return u;
}

function reparameterize(
  points: Point2[],
  first: number,
  last: number,
  u: number[],
  bez: CubicBezier
): number[] {
  const result = new Array(u.length);
  for (let i = first; i <= last; i++) {
    result[i - first] = newtonRaphsonRootFind(bez, points[i], u[i - first]);
  }
  return result;
}

function newtonRaphsonRootFind(bez: CubicBezier, point: Point2, u: number): number {
  const q = bezierPoint(bez, u);
  const q1 = bezierDerivative(bez, u);
  const q2 = bezierSecondDerivative(bez, u);
  const num = (q.x - point.x) * q1.x + (q.y - point.y) * q1.y;
  const den =
    q1.x * q1.x + q1.y * q1.y + (q.x - point.x) * q2.x + (q.y - point.y) * q2.y;
  if (Math.abs(den) < 1e-12) return u;
  return u - num / den;
}

function computeMaxError(
  points: Point2[],
  first: number,
  last: number,
  bez: CubicBezier,
  u: number[]
): { maxDistSq: number; splitPoint: number } {
  let maxDistSq = 0;
  let splitPoint = Math.floor((last - first + 1) / 2) + first;
  for (let i = first + 1; i < last; i++) {
    const p = bezierPoint(bez, u[i - first]);
    const dx = p.x - points[i].x;
    const dy = p.y - points[i].y;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      splitPoint = i;
    }
  }
  return { maxDistSq, splitPoint };
}

function bezierPoint(bez: CubicBezier, t: number): Point2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * bez[0].x + b * bez[1].x + c * bez[2].x + d * bez[3].x,
    y: a * bez[0].y + b * bez[1].y + c * bez[2].y + d * bez[3].y,
  };
}

function bezierDerivative(bez: CubicBezier, t: number): Point2 {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (bez[1].x - bez[0].x) + b * (bez[2].x - bez[1].x) + c * (bez[3].x - bez[2].x),
    y: a * (bez[1].y - bez[0].y) + b * (bez[2].y - bez[1].y) + c * (bez[3].y - bez[2].y),
  };
}

function bezierSecondDerivative(bez: CubicBezier, t: number): Point2 {
  const a = 6 * (1 - t);
  const b = 6 * t;
  const d0 = {
    x: bez[2].x - 2 * bez[1].x + bez[0].x,
    y: bez[2].y - 2 * bez[1].y + bez[0].y,
  };
  const d1 = {
    x: bez[3].x - 2 * bez[2].x + bez[1].x,
    y: bez[3].y - 2 * bez[2].y + bez[1].y,
  };
  return { x: a * d0.x + b * d1.x, y: a * d0.y + b * d1.y };
}

/**
 * Sharp corners = abrupt direction change.
 * Rounded corners spread turn over many samples → not split.
 */
function findSharpCorners(ring: Point2[]): number[] {
  const n = ring.length;
  if (n < 6) return [];

  const corners: number[] = [];
  const win = Math.max(2, Math.min(6, Math.floor(n / 16)));

  for (let i = 0; i < n; i++) {
    const prev = ring[(i - win + n) % n];
    const curr = ring[i];
    const next = ring[(i + win) % n];
    const d0 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d1 = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (d0 < 8 || d1 < 8) continue;

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const turn = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
    if (turn < Math.PI * 0.48) continue;

    // Spread-out turning = rounded corner
    const localTurn = localTurningEnergy(ring, i, win);
    if (localTurn > turn * 1.8) continue;

    corners.push(i);
  }

  if (corners.length === 0) return [];
  const filtered: number[] = [corners[0]];
  const minSep = Math.max(4, Math.floor(n / 20));
  for (let k = 1; k < corners.length; k++) {
    const prev = filtered[filtered.length - 1];
    const dist = Math.min((corners[k] - prev + n) % n, (prev - corners[k] + n) % n);
    if (dist >= minSep) filtered.push(corners[k]);
  }
  if (filtered.length > 1) {
    const dist = Math.min(
      (filtered[0] - filtered[filtered.length - 1] + n) % n,
      (filtered[filtered.length - 1] - filtered[0] + n) % n
    );
    if (dist < minSep) filtered.pop();
  }
  return filtered;
}

function localTurningEnergy(ring: Point2[], i: number, win: number): number {
  const n = ring.length;
  let energy = 0;
  for (let k = -win; k < win; k++) {
    const a = ring[(i + k - 1 + n) % n];
    const b = ring[(i + k + n) % n];
    const c = ring[(i + k + 1 + n) % n];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    energy += Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
  }
  return energy;
}

function extractRingSegment(ring: Point2[], i0: number, i1: number): Point2[] {
  const n = ring.length;
  const seg: Point2[] = [];
  let i = i0;
  for (;;) {
    seg.push(ring[i]);
    if (i === i1) break;
    i = (i + 1) % n;
    if (seg.length > n + 1) break;
  }
  return seg;
}

function farthestFromCentroid(ring: Point2[]): number {
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x;
    cy += p.y;
  }
  cx /= ring.length;
  cy /= ring.length;
  let best = 0;
  let bestD = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = Math.hypot(ring[i].x - cx, ring[i].y - cy);
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function estimateTangent(points: Point2[], i: number, first: number, last: number): Point2 {
  const i0 = Math.max(first, i - 1);
  const i1 = Math.min(last, i + 1);
  if (i0 === i1) return { x: 1, y: 0 };
  return normalize(sub(points[i0], points[i1]));
}

function dedupeConsecutive(points: Point2[], minDist: number): Point2[] {
  if (points.length === 0) return [];
  const out: Point2[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    if (Math.hypot(points[i].x - prev.x, points[i].y - prev.y) >= minDist) {
      out.push(points[i]);
    }
  }
  return out;
}

function add(a: Point2, b: Point2): Point2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function sub(a: Point2, b: Point2): Point2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function scale(a: Point2, s: number): Point2 {
  return { x: a.x * s, y: a.y * s };
}
function dot(a: Point2, b: Point2): number {
  return a.x * b.x + a.y * b.y;
}
function lerp(a: Point2, b: Point2, t: number): Point2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function normalize(v: Point2): Point2 {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-12) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}
function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}
