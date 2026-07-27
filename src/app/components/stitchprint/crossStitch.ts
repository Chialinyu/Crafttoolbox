import {
  canvasShapeOutline,
  cellInCanvasShape,
  pointInPolygon,
  shapeBounds,
  type CanvasShape,
} from './canvasShape';
import type { CrossStitchParams, PatternResult, Point2, Polyline } from './types';

/**
 * Generate graph-paper grid + X stitches only on occupied cells.
 * Coordinates in mm, origin top-left for SVG (y down); G-code flips Y.
 * Without occupancy (or all false): grid/border only — no full-field X.
 * Canvas silhouette (rect/circle/…) masks which cells and bars are printed.
 */
export function generateCrossStitch(params: CrossStitchParams): PatternResult {
  const {
    widthMm,
    heightMm,
    cellSize,
    strokeWidth,
    gridWeight,
    edgeMarginMm,
    fillPercent,
    showBorder,
    baseStrategy,
    canvasStyle,
    backboard,
    canvasShape,
    shapeOptions,
    colorMap,
    palette,
    gridColor,
    stitchColor,
    borderColor,
  } = params;

  const safeCell = Math.max(1, cellSize);
  const cols = Math.max(1, Math.floor(widthMm / safeCell));
  const rows = Math.max(1, Math.floor(heightMm / safeCell));
  const usedW = cols * safeCell;
  const usedH = rows * safeCell;
  const offsetX = (widthMm - usedW) / 2;
  const offsetY = (heightMm - usedH) / 2;
  const bounds = shapeBounds(offsetX, offsetY, usedW, usedH);
  const shape: CanvasShape = canvasShape ?? 'rect';
  const clipToShape = shape !== 'rect';

  const active = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cx = offsetX + (c + 0.5) * safeCell;
      const cy = offsetY + (r + 0.5) * safeCell;
      return cellInCanvasShape(shape, bounds, cx, cy, shapeOptions);
    })
  );

  const polylines: Polyline[] = [];
  let id = 0;
  const nextId = (prefix: string) => `${prefix}-${id++}`;

  const includePrintedGrid = baseStrategy === 'print-grid';
  const insertPauseBeforeStitch = baseStrategy === 'insert-mesh';
  const hasBackboard = includePrintedGrid && backboard === 'solid';
  const outline = canvasShapeOutline(shape, bounds, shapeOptions);

  // --- Solid back panel follows silhouette ---
  if (hasBackboard) {
    polylines.push({
      id: nextId('backboard'),
      layer: 'backboard',
      fill: true,
      closed: true,
      points: outline,
    });
  }

  // --- Printed canvas lattice ---
  // Real plastic canvas / Aida: holes sit at the grid INTERSECTIONS (the four
  // corners of each stitch square), spaced by the pitch. The solid material
  // between those holes is the bar/lattice. Bar width = pitch − holeSize,
  // driven by `gridWeight`. Rendered as one filled even-odd path.
  if (includePrintedGrid) {
    const bar = Math.min(Math.max(gridWeight, 0.1), safeCell * 0.85);
    const half = (safeCell - bar) / 2; // half hole size
    const edgeMargin = Math.max(0, edgeMarginMm);
    // Solid rim (skip incomplete edge holes) only for rectangles. Elsewhere
    // punch every intersection — even-odd + clip keep only the silhouette
    // intersection, so edge holes become partial and hug the outline.
    const applyRim = shape === 'rect';
    const holes: Point2[][] = [];
    if (half > 0.05) {
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          // For the rect rim, keep holes that belong to at least one active cell.
          if (applyRim) {
            const touchesActive =
              (r < rows && c < cols && active[r][c]) ||
              (r < rows && c > 0 && active[r][c - 1]) ||
              (r > 0 && c < cols && active[r - 1][c]) ||
              (r > 0 && c > 0 && active[r - 1][c - 1]);
            if (!touchesActive) continue;
          }
          const cx = offsetX + c * safeCell;
          const cy = offsetY + r * safeCell;
          const hole = buildHole(canvasStyle, cx, cy, half);
          if (applyRim && !holeFitsInsideOutline(hole, outline, edgeMargin)) {
            continue;
          }
          holes.push(hole);
        }
      }
    }
    polylines.push({
      id: nextId('grid'),
      layer: 'grid',
      fill: true,
      closed: true,
      points: outline,
      holes,
    });
  }

  // --- Cross stitches ---
  // Real cross-stitch: the X lives in the square BETWEEN four hole centers.
  // Endpoints are those hole centers (grid intersections), never the mid-sides
  // or visual "corners of a punched opening". fillPercent shortens the arms
  // toward the cell center while keeping the same hole-anchored axis.
  const fill = Math.max(0.2, Math.min(1, fillPercent / 100));
  const inset = safeCell * (1 - fill) * 0.5;
  let occupiedCount = 0;

  if (colorMap && colorMap.length > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const col = r % 2 === 0 ? c : cols - 1 - c;
        if (!active[r][col]) continue;
        const rowColors = colorMap[r];
        const paletteIndex = rowColors?.[col];
        if (paletteIndex === null || paletteIndex === undefined) continue;
        const color = palette[paletteIndex] ?? stitchColor;

        occupiedCount++;
        // Four hole centers at the corners of this stitch square.
        const x0 = offsetX + col * safeCell + inset;
        const y0 = offsetY + r * safeCell + inset;
        const x1 = offsetX + (col + 1) * safeCell - inset;
        const y1 = offsetY + (r + 1) * safeCell - inset;

        polylines.push({
          id: nextId('x-a'),
          layer: 'stitch',
          points: [
            { x: x0, y: y0 },
            { x: x1, y: y1 },
          ],
          color,
        });
        polylines.push({
          id: nextId('x-b'),
          layer: 'stitch',
          points: [
            { x: x1, y: y0 },
            { x: x0, y: y1 },
          ],
          color,
        });
      }
    }
  }

  if (showBorder) {
    polylines.push({
      id: nextId('border'),
      layer: 'border',
      points: outline,
      closed: true,
    });
  }

  return {
    widthMm,
    heightMm,
    cols,
    rows,
    polylines,
    insertPauseBeforeStitch,
    strokeWidthMm: strokeWidth,
    gridWeightMm: gridWeight,
    gridColor,
    stitchColor,
    borderColor,
    occupiedCount,
    palette,
    hasBackboard,
    outline,
    clipToShape,
  };
}

/**
 * One hole polygon centered at a grid INTERSECTION (cx,cy). `half` is half
 * the hole size so the remaining material between neighboring holes equals
 * the bar width.
 * - square   → straight square hole
 * - rounded  → circular hole (real plastic-canvas look)
 * - diagonal → diamond hole (woven / diagonal weave look)
 */
function buildHole(
  style: 'square' | 'rounded' | 'diagonal',
  cx: number,
  cy: number,
  half: number
): { x: number; y: number }[] {
  if (style === 'rounded') {
    const segments = 14;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * half, y: cy + Math.sin(a) * half });
    }
    return pts;
  }
  if (style === 'diagonal') {
    return [
      { x: cx, y: cy - half },
      { x: cx + half, y: cy },
      { x: cx, y: cy + half },
      { x: cx - half, y: cy },
    ];
  }
  return [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];
}

/**
 * Keep complete holes inside the silhouette and preserve the requested solid
 * rim. Midpoint checks also protect concave silhouettes (star / heart) where
 * an edge could otherwise cross outside while both endpoints remain inside.
 */
function holeFitsInsideOutline(
  hole: Point2[],
  outline: Point2[],
  edgeMargin: number
): boolean {
  if (outline.length < 3) return false;
  for (let i = 0; i < hole.length; i++) {
    const a = hole[i];
    const b = hole[(i + 1) % hole.length];
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (const sample of [a, midpoint]) {
      if (!pointInPolygon(outline, sample.x, sample.y)) return false;
      if (distanceToPolygonBoundary(sample, outline) + 1e-6 < edgeMargin) return false;
    }
  }
  return true;
}

function distanceToPolygonBoundary(point: Point2, polygon: Point2[]): number {
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    nearest = Math.min(nearest, distanceToSegment(point, a, b));
  }
  return nearest;
}

function distanceToSegment(point: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)
  );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function layerStrokeWidth(
  result: PatternResult,
  layer: Polyline['layer']
): number {
  if (layer === 'grid' || layer === 'backboard') return result.gridWeightMm;
  return result.strokeWidthMm;
}

export function layerColor(
  result: PatternResult,
  layer: Polyline['layer'],
  polyline?: Polyline
): string {
  if (polyline?.color) return polyline.color;
  if (layer === 'grid' || layer === 'backboard') return result.gridColor;
  if (layer === 'border') return result.borderColor;
  return result.stitchColor;
}
