import {
  BOARD_THICKNESS_MIN_MM,
  boardPassesFromThickness,
  DEFAULT_EXTRUSION_PER_MM,
  DEFAULT_LAYER_HEIGHT_MM,
} from './constants';
import { layerColor, layerStrokeWidth } from './crossStitch';
import { clipHorizontalToPolygon, clipSegmentToPolygon } from './canvasShape';
import type { PatternResult, Point2, Polyline } from './types';

export interface GcodeOptions {
  /** Bambu-friendly user pause */
  pauseCommand?: string;
  layerHeightMm?: number;
  extrusionPerMm?: number;
  feedrateMmMin?: number;
  travelFeedrateMmMin?: number;
  /**
   * Printed base thickness (lattice / solid panel) in mm.
   * Converted to stacked Z passes so thin boards can bend / act as bookmarks.
   */
  boardThicknessMm?: number;
}

/**
 * Convert pattern polylines to a simple single-toolpath G-code.
 * Y is flipped so origin is front-left like typical printer beds.
 */
export function patternToGcode(
  result: PatternResult,
  options: GcodeOptions = {}
): string {
  const pauseCommand = options.pauseCommand ?? 'M400 U1';
  const layerH = options.layerHeightMm ?? DEFAULT_LAYER_HEIGHT_MM;
  const ePerMm = options.extrusionPerMm ?? DEFAULT_EXTRUSION_PER_MM;
  const feed = options.feedrateMmMin ?? 1200;
  const travel = options.travelFeedrateMmMin ?? 6000;
  const boardThickness = Math.max(
    BOARD_THICKNESS_MIN_MM,
    options.boardThicknessMm ?? layerH
  );
  const basePasses = boardPassesFromThickness(boardThickness, layerH);

  const { widthMm, heightMm, polylines, insertPauseBeforeStitch } = result;
  const flipY = (y: number) => heightMm - y;

  const lines: string[] = [
    '; Stitchprint cross-stitch',
    `; size ${widthMm.toFixed(2)} x ${heightMm.toFixed(2)} mm`,
    `; cells ${result.cols} x ${result.rows}`,
    `; occupied ${result.occupiedCount}`,
    `; boardThickness ${boardThickness.toFixed(2)} mm (~${basePasses} base passes @ ${layerH}mm)`,
    `; gridColor ${result.gridColor}`,
    `; stitchColor ${result.stitchColor}`,
    `; palette ${result.palette.join(',')}`,
    'G21 ; mm',
    'G90 ; absolute',
    'M82 ; absolute extrusion',
    'G92 E0',
    `G1 Z${layerH.toFixed(3)} F300`,
  ];

  let e = 0;
  let currentZ = layerH;
  let paused = false;

  const emitPoly = (poly: Polyline, z: number) => {
    if (poly.points.length < 2) return;
    if (Math.abs(z - currentZ) > 1e-6) {
      lines.push(`G1 Z${z.toFixed(3)} F300`);
      currentZ = z;
    }

    const pts = poly.closed
      ? [...poly.points, poly.points[0]]
      : poly.points;

    const start = pts[0];
    lines.push(
      `G0 X${fmt(start.x)} Y${fmt(flipY(start.y))} F${travel}`
    );

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dist = hypot(a, b);
      if (dist < 1e-4) continue;
      e += dist * ePerMm * (layerStrokeWidth(result, poly.layer) / 0.4);
      lines.push(
        `G1 X${fmt(b.x)} Y${fmt(flipY(b.y))} E${e.toFixed(5)} F${feed}`
      );
    }
  };

  const emitGridAt = (grid: Polyline[], z: number) => {
    const clip = result.clipToShape && result.outline.length >= 3;
    for (const poly of grid) {
      if (!clip || poly.points.length !== 2) {
        emitPoly(poly, z);
        continue;
      }
      for (const [a, b] of clipSegmentToPolygon(
        result.outline,
        poly.points[0],
        poly.points[1]
      )) {
        emitPoly({ ...poly, points: [a, b] }, z);
      }
    }
  };

  const backboards = polylines.filter((p) => p.layer === 'backboard');
  const grid = polylines.filter((p) => p.layer === 'grid');
  const stitches = polylines.filter(
    (p) => p.layer === 'stitch' || p.layer === 'border'
  );

  let baseLayers = 0;

  // Stack the printed base (solid fill and/or lattice) to the chosen thickness.
  // Solid panel: fill every pass. Open lattice: grid every pass.
  // Solid + lattice: fill for passes, then one lattice pass on the top face.
  if (backboards.length > 0 || grid.length > 0) {
    const fillPasses = backboards.length > 0 ? basePasses : 0;
    const latticePasses =
      grid.length > 0 ? (backboards.length > 0 ? 1 : basePasses) : 0;

    if (fillPasses > 0) {
      lines.push(
        `; solid backboard fill ×${fillPasses} (≈${boardThickness.toFixed(2)}mm)`
      );
      for (let pass = 1; pass <= fillPasses; pass++) {
        const z = layerH * pass;
        if (pass > 1) {
          lines.push(`G1 Z${z.toFixed(3)} F300`);
          lines.push('G92 E0');
          e = 0;
          currentZ = z;
        }
        for (const board of backboards) {
          for (const fillLine of serpentineFill(board, 0.45)) {
            emitPoly(fillLine, z);
          }
        }
      }
      baseLayers = fillPasses;
    }

    if (latticePasses > 0) {
      lines.push(
        backboards.length > 0
          ? '; lattice on top face'
          : `; open lattice ×${latticePasses} (≈${boardThickness.toFixed(2)}mm)`
      );
      for (let pass = 1; pass <= latticePasses; pass++) {
        const z = layerH * (baseLayers + pass);
        if (baseLayers > 0 || pass > 1) {
          lines.push(`G1 Z${z.toFixed(3)} F300`);
          lines.push('G92 E0');
          e = 0;
          currentZ = z;
        }
        emitGridAt(grid, z);
      }
      baseLayers += latticePasses;
    }
  }

  // Pause for real mesh insert (instead of / after printed base)
  if (insertPauseBeforeStitch && !paused) {
    lines.push('; pause for mesh insert');
    lines.push(pauseCommand);
    paused = true;
    currentZ = layerH * (baseLayers + 1);
    lines.push(`G1 Z${currentZ.toFixed(3)} F300`);
    lines.push('G92 E0');
    e = 0;
  } else if (baseLayers > 0) {
    // Stitch layer sits on top of any printed base layers
    currentZ = layerH * (baseLayers + 1);
    lines.push(`G1 Z${currentZ.toFixed(3)} F300`);
    lines.push('G92 E0');
    e = 0;
  }

  let activeColor = '';
  for (const poly of stitches) {
    const color = layerColor(result, poly.layer, poly);
    if (color !== activeColor) {
      activeColor = color;
      lines.push(`; stitch color ${color}`);
    }
    emitPoly(poly, currentZ);
  }

  lines.push('G1 E-1 F1800 ; small retract');
  lines.push('G0 Z10 F300');
  lines.push('M84 ; motors off');
  lines.push('; end Stitchprint');

  return lines.join('\n') + '\n';
}

/**
 * Serpentine raster fill clipped to a closed polygon (any silhouette).
 */
function serpentineFill(board: Polyline, spacing: number): Polyline[] {
  const xs = board.points.map((p) => p.x);
  const ys = board.points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const height = y1 - y0;
  if (height <= 0 || x1 <= x0) return [];

  const step = Math.max(0.3, spacing);
  const rows = Math.min(4000, Math.floor(height / step));
  const out: Polyline[] = [];
  let flip = false;
  for (let i = 0; i <= rows; i++) {
    const y = y0 + i * step;
    const intervals = clipHorizontalToPolygon(board.points, y, x0, x1);
    const ordered = flip ? [...intervals].reverse() : intervals;
    for (const [left, right] of ordered) {
      out.push({
        id: `fill-${out.length}`,
        layer: 'backboard',
        points: flip
          ? [
              { x: right, y },
              { x: left, y },
            ]
          : [
              { x: left, y },
              { x: right, y },
            ],
      });
    }
    if (intervals.length > 0) flip = !flip;
  }
  return out;
}

function hypot(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}
