import {
  canvasShapeOutline,
  cellInCanvasShape,
  shapeBounds,
  type CanvasShape,
} from './canvasShape';
import type { CrossStitchParams, PatternResult, Polyline } from './types';

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
  // Bars are generated across the full used area; for non-rect silhouettes
  // the exporters clip every grid segment to `outline`, so cells stay filled
  // right up to the boundary and anything past it is trimmed.
  if (includePrintedGrid) {
    const detailBudget = cols * rows <= 4000;
    const style: typeof canvasStyle =
      canvasStyle !== 'square' && !detailBudget ? 'square' : canvasStyle;

    if (style === 'diagonal') {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = offsetX + c * safeCell;
          const y0 = offsetY + r * safeCell;
          const x1 = x0 + safeCell;
          const y1 = y0 + safeCell;
          polylines.push({
            id: nextId('mesh-a'),
            layer: 'grid',
            points: [
              { x: x0, y: y0 },
              { x: x1, y: y1 },
            ],
          });
          polylines.push({
            id: nextId('mesh-b'),
            layer: 'grid',
            points: [
              { x: x1, y: y0 },
              { x: x0, y: y1 },
            ],
          });
        }
      }
    } else {
      for (let c = 0; c <= cols; c++) {
        const x = offsetX + c * safeCell;
        polylines.push({
          id: nextId('grid-v'),
          layer: 'grid',
          points: [
            { x, y: offsetY },
            { x, y: offsetY + rows * safeCell },
          ],
        });
      }
      for (let r = 0; r <= rows; r++) {
        const y = offsetY + r * safeCell;
        polylines.push({
          id: nextId('grid-h'),
          layer: 'grid',
          points: [
            { x: offsetX, y },
            { x: offsetX + cols * safeCell, y },
          ],
        });
      }

      if (style === 'rounded') {
        const g = Math.min(gridWeight / 2, safeCell * 0.3);
        const fillet = Math.min(safeCell * 0.42, safeCell / 2 - g - 0.05);
        if (fillet > 0.05) {
          for (let r = 1; r < rows; r++) {
            for (let c = 1; c < cols; c++) {
              const nx = offsetX + c * safeCell;
              const ny = offsetY + r * safeCell;
              const corners = [
                [1, 1],
                [-1, 1],
                [1, -1],
                [-1, -1],
              ] as const;
              for (const [sx, sy] of corners) {
                polylines.push({
                  id: nextId('grid-fillet'),
                  layer: 'grid',
                  points: [
                    { x: nx + sx * (g + fillet), y: ny + sy * g },
                    { x: nx + sx * g, y: ny + sy * (g + fillet) },
                  ],
                });
              }
            }
          }
        }
      }
    }
  }

  // --- Cross stitches: only occupied cells inside silhouette ---
  const fill = Math.max(0.2, Math.min(1, fillPercent / 100));
  const inset = safeCell * (1 - fill) * 0.45;
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
