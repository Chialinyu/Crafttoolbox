/**
 * ============================================================================
 * RECTANGLE & POLYGON FITTING - Geometric primitive detection
 * ============================================================================
 *
 * Detects filled rectangles/squares (axis-aligned or lightly rotated)
 * and simple triangles for clean SVG primitives instead of Bezier paths.
 */

import type { RectanglePrimitive, PolygonPrimitive } from './vectorization';

export interface RectangleParams {
  cx: number;
  cy: number;
  width: number;
  height: number;
  angle: number; // degrees
}

/**
 * True when a rectangle covers nearly the whole canvas (background frame artifact).
 */
export function isNearFullCanvasRect(
  rect: { cx: number; cy: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  coverageThreshold: number = 0.88
): boolean {
  if (canvasWidth <= 0 || canvasHeight <= 0) return false;
  const covW = rect.width / canvasWidth;
  const covH = rect.height / canvasHeight;
  return covW >= coverageThreshold && covH >= coverageThreshold;
}

/**
 * True when a pixel region spans the canvas like a background plate / outer frame.
 * Touches all four borders, or its bbox covers nearly the entire image.
 */
export function isCanvasBackgroundRegion(
  pixels: Array<{ x: number; y: number }>,
  canvasWidth: number,
  canvasHeight: number
): boolean {
  if (pixels.length < 16 || canvasWidth <= 0 || canvasHeight <= 0) return false;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pixels) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const covW = (maxX - minX + 1) / canvasWidth;
  const covH = (maxY - minY + 1) / canvasHeight;
  const nearFullBBox = covW >= 0.9 && covH >= 0.9;

  const touchesLeft = minX <= 1;
  const touchesRight = maxX >= canvasWidth - 2;
  const touchesTop = minY <= 1;
  const touchesBottom = maxY >= canvasHeight - 2;
  const touchesAllBorders = touchesLeft && touchesRight && touchesTop && touchesBottom;

  if (touchesAllBorders && nearFullBBox) return true;

  // Large background plates that still leave a thin margin.
  const areaRatio = pixels.length / (canvasWidth * canvasHeight);
  if (nearFullBBox && areaRatio >= 0.45) return true;

  return false;
}

/**
 * Fit a solid filled rectangle/square from region pixels.
 * Prefers high bbox occupancy and filled corners over fragile contour corner counting.
 */
export function fitFilledRectangle(
  pixels: Array<{ x: number; y: number }>,
  canvasWidth?: number,
  canvasHeight?: number
): RectanglePrimitive | null {
  if (pixels.length < 16) return null;

  // Never promote the full-canvas background plate into a rectangle frame.
  if (
    canvasWidth != null &&
    canvasHeight != null &&
    isCanvasBackgroundRegion(pixels, canvasWidth, canvasHeight)
  ) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cy = 0;

  for (const pixel of pixels) {
    minX = Math.min(minX, pixel.x);
    maxX = Math.max(maxX, pixel.x);
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y);
    cx += pixel.x;
    cy += pixel.y;
  }

  cx /= pixels.length;
  cy /= pixels.length;

  const bboxWidth = maxX - minX + 1;
  const bboxHeight = maxY - minY + 1;
  const bboxArea = bboxWidth * bboxHeight;
  if (bboxArea <= 0) return null;

  const fillRatio = pixels.length / bboxArea;
  // Solid rectangles/squares fill most of their bounding box.
  // Allow slight erosion from clustering / anti-aliasing.
  if (fillRatio < 0.82) return null;

  const pixelSet = new Set(pixels.map((p) => `${p.x},${p.y}`));
  const cornerHits = [
    pixelSet.has(`${minX},${minY}`),
    pixelSet.has(`${maxX},${minY}`),
    pixelSet.has(`${minX},${maxY}`),
    pixelSet.has(`${maxX},${maxY}`),
  ].filter(Boolean).length;
  if (cornerHits < 3) return null;

  // Edge completeness: sample each side and require mostly filled.
  const edgeSamples = sampleRectangleEdges(minX, maxX, minY, maxY, pixelSet);
  if (edgeSamples.filled / edgeSamples.total < 0.78) return null;

  // Prefer axis-aligned when moment rotation is tiny.
  const oriented = fitOrientedRectangle(pixels, cx, cy);
  if (oriented && Math.abs(oriented.angle) > 8) {
    const orientedFill = estimateOrientedFillRatio(pixels, oriented);
    if (orientedFill >= 0.82) {
      return {
        type: 'rectangle',
        cx: oriented.cx,
        cy: oriented.cy,
        width: oriented.width,
        height: oriented.height,
        angle: oriented.angle,
      };
    }
  }

  return {
    type: 'rectangle',
    cx: minX + bboxWidth / 2,
    cy: minY + bboxHeight / 2,
    width: bboxWidth,
    height: bboxHeight,
    angle: 0,
  };
}

/**
 * Detect rectangle/square from pixels (compat wrapper used by strokeMode).
 */
export function detectRectangle(
  pixels: Array<{ x: number; y: number }>,
  _angleThreshold: number = 15,
  canvasWidth?: number,
  canvasHeight?: number
): RectanglePrimitive | null {
  return fitFilledRectangle(pixels, canvasWidth, canvasHeight);
}

/**
 * Fit a rectangle from a closed contour via corner simplification.
 * Catches jagged/clustered rectangles that fail solid fillRatio checks,
 * and avoids Bezier rounding when four corners are already correct.
 */
export function fitRectangleFromContour(
  contour: Array<{ x: number; y: number }>,
  canvasWidth?: number,
  canvasHeight?: number
): RectanglePrimitive | null {
  if (contour.length < 8) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of contour) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  if (bboxW < 4 || bboxH < 4) return null;

  // Outer canvas frame contour → never emit as a rectangle stroke.
  if (
    canvasWidth != null &&
    canvasHeight != null &&
    isNearFullCanvasRect(
      { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width: bboxW + 1, height: bboxH + 1 },
      canvasWidth,
      canvasHeight
    )
  ) {
    return null;
  }

  const diag = Math.hypot(bboxW, bboxH);
  // Try a few epsilons so pixel-jagged sides collapse to 4 corners.
  const epsilons = [diag * 0.04, diag * 0.06, diag * 0.09, Math.max(1.5, diag * 0.03)];
  for (const epsilon of epsilons) {
    const simplified = douglasPeuckerClosed(contour, epsilon);
    const corners = simplified.length >= 4 ? pickDominantCorners(simplified, 4) : simplified;
    if (corners.length !== 4) continue;

    if (!cornersAreRectangular(corners)) continue;

    // Residual: remaining contour points should stay near the 4 edges.
    if (contourEdgeResidual(contour, corners) > Math.max(1.8, diag * 0.035)) continue;

    const rect = rectangleFromCorners(corners);
    if (
      canvasWidth != null &&
      canvasHeight != null &&
      isNearFullCanvasRect(rect, canvasWidth, canvasHeight)
    ) {
      return null;
    }
    return rect;
  }

  return null;
}

/**
 * True when a closed polyline has ~4 right-angle corners (rectangle-like).
 */
export function isRectangularPolyline(points: Array<{ x: number; y: number }>): boolean {
  if (points.length < 4 || points.length > 6) return false;
  const corners = points.length === 4 ? points : pickDominantCorners(points, 4);
  return corners.length === 4 && cornersAreRectangular(corners);
}

/**
 * Detect if shape is a triangle
 */
export function detectTriangle(
  pixels: Array<{ x: number; y: number }>
): PolygonPrimitive | null {
  if (pixels.length < 16) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pixel of pixels) {
    minX = Math.min(minX, pixel.x);
    maxX = Math.max(maxX, pixel.x);
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y);
  }

  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
  const fillRatio = pixels.length / bboxArea;
  // Filled triangle occupies roughly half of its bbox.
  if (fillRatio < 0.42 || fillRatio > 0.68) return null;

  const contour = extractContour(pixels);
  if (contour.length < 3) return null;

  const epsilon = Math.max(1.5, Math.sqrt(pixels.length) * 0.35);
  const simplified = douglasPeuckerClosed(contour, epsilon);
  if (simplified.length < 3 || simplified.length > 4) return null;

  const corners = simplified.length === 4 ? simplified.slice(0, 3) : simplified;
  if (corners.length !== 3) return null;

  return {
    type: 'polygon',
    points: corners,
    sides: 3,
  };
}

/**
 * SVG path for a rectangle primitive (axis-aligned or rotated).
 */
export function rectangleToSVGPath(rect: RectanglePrimitive): string {
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const rad = ((rect.angle || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => ({
    x: rect.cx + p.x * cos - p.y * sin,
    y: rect.cy + p.x * sin + p.y * cos,
  }));

  return [
    `M ${corners[0].x.toFixed(2)} ${corners[0].y.toFixed(2)}`,
    `L ${corners[1].x.toFixed(2)} ${corners[1].y.toFixed(2)}`,
    `L ${corners[2].x.toFixed(2)} ${corners[2].y.toFixed(2)}`,
    `L ${corners[3].x.toFixed(2)} ${corners[3].y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * SVG path for a simple polygon primitive.
 */
export function polygonToSVGPath(polygon: PolygonPrimitive): string {
  if (polygon.points.length === 0) return '';
  const [first, ...rest] = polygon.points;
  const commands = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
  for (const point of rest) {
    commands.push(`L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  commands.push('Z');
  return commands.join(' ');
}

function pickDominantCorners(
  points: Array<{ x: number; y: number }>,
  count: number
): Array<{ x: number; y: number }> {
  if (points.length <= count) return points;

  // Score by turning angle; keep the strongest corners in contour order.
  const scored = points.map((curr, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const turn = Math.abs(turningAngle(prev, curr, next));
    return { i, turn, point: curr };
  });
  scored.sort((a, b) => b.turn - a.turn);
  const chosen = scored
    .slice(0, count)
    .sort((a, b) => a.i - b.i)
    .map((s) => s.point);
  return chosen;
}

function turningAngle(
  prev: { x: number; y: number },
  curr: { x: number; y: number },
  next: { x: number; y: number }
): number {
  const v1x = curr.x - prev.x;
  const v1y = curr.y - prev.y;
  const v2x = next.x - curr.x;
  const v2y = next.y - curr.y;
  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  return Math.atan2(cross, dot);
}

function cornersAreRectangular(corners: Array<{ x: number; y: number }>): boolean {
  if (corners.length !== 4) return false;

  const angles: number[] = [];
  const sideLens: number[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4];
    const curr = corners[i];
    const next = corners[(i + 1) % 4];
    const turn = Math.abs(turningAngle(prev, curr, next));
    // Near ±90° (allow 55°–125° for jagged clustering).
    if (turn < Math.PI * 0.30 || turn > Math.PI * 0.70) return false;
    angles.push(turn);
    sideLens.push(Math.hypot(next.x - curr.x, next.y - curr.y));
  }

  if (sideLens.some((len) => len < 3)) return false;

  // Opposite sides should be similar for a rectangle.
  const opp0 = Math.min(sideLens[0], sideLens[2]) / Math.max(sideLens[0], sideLens[2]);
  const opp1 = Math.min(sideLens[1], sideLens[3]) / Math.max(sideLens[1], sideLens[3]);
  if (opp0 < 0.72 || opp1 < 0.72) return false;

  return true;
}

function contourEdgeResidual(
  contour: Array<{ x: number; y: number }>,
  corners: Array<{ x: number; y: number }>
): number {
  let sum = 0;
  for (const p of contour) {
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      best = Math.min(best, perpendicularDistance(p, a, b));
    }
    sum += best * best;
  }
  return Math.sqrt(sum / contour.length);
}

function rectangleFromCorners(
  corners: Array<{ x: number; y: number }>
): RectanglePrimitive {
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    cx += c.x;
    cy += c.y;
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  cx /= 4;
  cy /= 4;

  // Edge 0 direction as primary axis.
  const e0x = corners[1].x - corners[0].x;
  const e0y = corners[1].y - corners[0].y;
  const angle = (Math.atan2(e0y, e0x) * 180) / Math.PI;
  const norm = ((angle % 90) + 90) % 90;
  const axisAligned = norm < 6 || norm > 84;

  if (axisAligned) {
    return {
      type: 'rectangle',
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      angle: 0,
    };
  }

  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const c of corners) {
    const dx = c.x - cx;
    const dy = c.y - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  return {
    type: 'rectangle',
    cx,
    cy,
    width: Math.max(1, maxU - minU),
    height: Math.max(1, maxV - minV),
    angle,
  };
}

function sampleRectangleEdges(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  pixelSet: Set<string>
): { filled: number; total: number } {
  let filled = 0;
  let total = 0;

  for (let x = minX; x <= maxX; x++) {
    total += 2;
    if (pixelSet.has(`${x},${minY}`)) filled++;
    if (pixelSet.has(`${x},${maxY}`)) filled++;
  }
  for (let y = minY + 1; y <= maxY - 1; y++) {
    total += 2;
    if (pixelSet.has(`${minX},${y}`)) filled++;
    if (pixelSet.has(`${maxX},${y}`)) filled++;
  }

  return { filled, total: Math.max(1, total) };
}

function fitOrientedRectangle(
  pixels: Array<{ x: number; y: number }>,
  cx: number,
  cy: number
): RectangleParams | null {
  let mxx = 0;
  let myy = 0;
  let mxy = 0;
  for (const pixel of pixels) {
    const dx = pixel.x - cx;
    const dy = pixel.y - cy;
    mxx += dx * dx;
    myy += dy * dy;
    mxy += dx * dy;
  }
  mxx /= pixels.length;
  myy /= pixels.length;
  mxy /= pixels.length;

  const angleRad = 0.5 * Math.atan2(2 * mxy, mxx - myy);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const pixel of pixels) {
    const dx = pixel.x - cx;
    const dy = pixel.y - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  const width = maxU - minU + 1;
  const height = maxV - minV + 1;
  if (width < 2 || height < 2) return null;

  const localCx = (minU + maxU) / 2;
  const localCy = (minV + maxV) / 2;

  return {
    cx: cx + localCx * cos - localCy * sin,
    cy: cy + localCx * sin + localCy * cos,
    width,
    height,
    angle: (angleRad * 180) / Math.PI,
  };
}

function estimateOrientedFillRatio(
  pixels: Array<{ x: number; y: number }>,
  rect: RectangleParams
): number {
  const area = Math.max(1, rect.width * rect.height);
  return pixels.length / area;
}

function extractContour(pixels: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (pixels.length === 0) return [];

  const pixelSet = new Set(pixels.map((p) => `${p.x},${p.y}`));
  const contour: Array<{ x: number; y: number }> = [];

  for (const pixel of pixels) {
    const { x, y } = pixel;
    let isBoundary = false;
    for (let dy = -1; dy <= 1 && !isBoundary; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (!pixelSet.has(`${x + dx},${y + dy}`)) {
          isBoundary = true;
          break;
        }
      }
    }
    if (isBoundary) contour.push(pixel);
  }

  return sortContourClockwise(contour);
}

function sortContourClockwise(contour: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (contour.length === 0) return [];

  let cx = 0;
  let cy = 0;
  for (const p of contour) {
    cx += p.x;
    cy += p.y;
  }
  cx /= contour.length;
  cy /= contour.length;

  return [...contour].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
}

function douglasPeuckerClosed(
  points: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  if (points.length <= 3) return points;
  const open = douglasPeucker(points, epsilon);
  if (open.length >= 2) {
    const first = open[0];
    const last = open[open.length - 1];
    if (first.x === last.x && first.y === last.y) {
      return open.slice(0, -1);
    }
  }
  return open;
}

function douglasPeucker(
  points: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  const denominator = Math.hypot(dx, dy);
  return numerator / denominator;
}
