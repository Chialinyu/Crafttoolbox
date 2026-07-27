/**
 * Stitchprint shared types
 */

import type { CanvasShape, ShapeOptions } from './canvasShape';

export type PatternMode = 'cross-stitch' | 'lace' | 'line-fabric';
export type BaseStrategy = 'pattern-only' | 'print-grid' | 'insert-mesh';
export type SizeTemplate = 'bookmark' | 'coaster' | 'custom';
export type PatternLayer = 'backboard' | 'grid' | 'stitch' | 'border';
/** Printed canvas lattice geometry */
export type CanvasStyle = 'square' | 'rounded' | 'diagonal';
/** Whether the printed canvas has a solid back panel */
export type Backboard = 'none' | 'solid';
export type { CanvasShape, ShapeOptions };
export type ImageFitMode = 'contain' | 'cover';
/**
 * How empty (no-stitch) cells are detected from the source image.
 * - transparent: only alpha / out-of-bounds
 * - background: Lab ΔE vs a paper/bg color + foreground coverage (keeps fine details)
 * - luminance: legacy brightness punch
 */
export type EmptyCellMode = 'transparent' | 'background' | 'luminance';

export interface Point2 {
  x: number;
  y: number;
}

export interface Polyline {
  id: string;
  layer: PatternLayer;
  points: Point2[];
  closed?: boolean;
  /** Per-stitch palette color; grid/border use result-level colors. */
  color?: string;
  /** Render as a filled shape (solid backboard / holey board) rather than a stroke. */
  fill?: boolean;
  /**
   * Inner subpaths punched out of a filled shape (even-odd), e.g. the holes of
   * a plastic-canvas board. Only meaningful when `fill` is true.
   */
  holes?: Point2[][];
}

/** rows × cols; true = place an X in that cell */
export type OccupancyMask = boolean[][];
/** rows × cols; null = empty, number = palette index */
export type StitchColorMap = Array<Array<number | null>>;

export interface QuantizedStitchPattern {
  colorMap: StitchColorMap;
  palette: string[];
  occupiedCount: number;
}

export interface CrossStitchParams {
  widthMm: number;
  heightMm: number;
  cellSize: number;
  strokeWidth: number;
  gridWeight: number;
  /** Minimum material rim between any printed hole and the outer silhouette. */
  edgeMarginMm: number;
  /**
   * 20–100: how far each X fills its cell (inset).
   * Does NOT control which cells get stitches — that's occupancy.
   */
  fillPercent: number;
  showBorder: boolean;
  baseStrategy: BaseStrategy;
  /** Printed lattice geometry (only used when a grid is printed) */
  canvasStyle: CanvasStyle;
  /** Solid back panel behind the printed canvas */
  backboard: Backboard;
  /** Outer silhouette of the canvas (rect / circle / …) */
  canvasShape: CanvasShape;
  /** Per-shape tunables (polygon sides, star points, heart fullness) */
  shapeOptions?: ShapeOptions;
  /** If null/empty, only grid/border are generated (no X) */
  colorMap: StitchColorMap | null;
  palette: string[];
  gridColor: string;
  stitchColor: string;
  borderColor: string;
}

export interface PatternResult {
  widthMm: number;
  heightMm: number;
  cols: number;
  rows: number;
  polylines: Polyline[];
  /** Insert pause in G-code before stitch layer when true */
  insertPauseBeforeStitch: boolean;
  strokeWidthMm: number;
  gridWeightMm: number;
  gridColor: string;
  stitchColor: string;
  borderColor: string;
  occupiedCount: number;
  palette: string[];
  hasBackboard: boolean;
  /** Closed silhouette polygon (mm) used for clipping the grid. */
  outline: Point2[];
  /** When true, the grid lattice must be clipped to `outline`. */
  clipToShape: boolean;
}

export interface ImageToMaskOptions {
  cols: number;
  rows: number;
  emptyMode: EmptyCellMode;
  /** 0–255; used only when emptyMode === 'luminance' */
  threshold: number;
  invert: boolean;
  fit: ImageFitMode;
  colorCount: number;
  /** Hex/rgb background (paper) color for emptyMode === 'background' */
  backgroundColor: string;
  /** Lab ΔE tolerance; pixels closer than this count as background */
  backgroundTolerance: number;
  /**
   * 5–80: minimum % of non-background samples in a cell to keep a stitch.
   * Lower = keep thinner paper-strip details; higher = cleaner silhouette.
   */
  minCoveragePercent: number;
}
