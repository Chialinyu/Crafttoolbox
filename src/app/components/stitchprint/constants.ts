import type { SizeTemplate } from './types';

export const SIZE_TEMPLATES: Record<
  SizeTemplate,
  { widthMm: number; heightMm: number }
> = {
  bookmark: { widthMm: 40, heightMm: 120 },
  coaster: { widthMm: 85, heightMm: 85 },
  custom: { widthMm: 60, heightMm: 90 },
};

export type CanvasPresetId =
  | 'custom'
  | 'aida-11'
  | 'aida-14'
  | 'aida-16'
  | 'aida-18'
  | 'plastic-5'
  | 'plastic-7'
  | 'plastic-10'
  | 'plastic-14';

export interface CanvasPreset {
  id: CanvasPresetId;
  kind: 'custom' | 'aida' | 'plastic';
  /** Fabric/canvas count = holes/stitches per inch (undefined for custom) */
  count?: number;
  /** Cell pitch in mm (25.4 / count) */
  cellMm: number;
  /** Suggested printed lattice bar width (mm) */
  gridWeight: number;
  /** Suggested X stitch stroke width (mm) */
  strokeWidth: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function preset(
  id: CanvasPresetId,
  kind: 'aida' | 'plastic',
  count: number
): CanvasPreset {
  const cellMm = Math.round((25.4 / count) * 100) / 100;
  return {
    id,
    kind,
    count,
    cellMm,
    // Plastic canvas has chunkier bars than woven Aida.
    gridWeight: clamp(cellMm * (kind === 'plastic' ? 0.3 : 0.22), 0.3, 0.9),
    strokeWidth: clamp(cellMm * (kind === 'plastic' ? 0.28 : 0.24), 0.3, 1.2),
  };
}

/** Common off-the-shelf cross-stitch / plastic-canvas gauges. */
export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'custom', kind: 'custom', cellMm: 4, gridWeight: 0.3, strokeWidth: 0.4 },
  preset('aida-11', 'aida', 11),
  preset('aida-14', 'aida', 14),
  preset('aida-16', 'aida', 16),
  preset('aida-18', 'aida', 18),
  preset('plastic-5', 'plastic', 5),
  preset('plastic-7', 'plastic', 7),
  preset('plastic-10', 'plastic', 10),
  preset('plastic-14', 'plastic', 14),
];

export const CANVAS_PRESET_MAP: Record<CanvasPresetId, CanvasPreset> =
  CANVAS_PRESETS.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<CanvasPresetId, CanvasPreset>
  );

/** Default layer height hint for single-extrusion-ish art (mm) */
export const DEFAULT_LAYER_HEIGHT_MM = 0.2;

/** Rough extrusion factor: mm filament per mm path at ~0.4 line width */
export const DEFAULT_EXTRUSION_PER_MM = 0.033;

/**
 * Board / plate style — independent of canvas gauge (pitch).
 * Controls printed thickness so the piece can be stiff, bendable, or bookmark-thin.
 */
export type BoardStyleId = 'rigid' | 'bendable' | 'bookmark' | 'custom';

export interface BoardStyle {
  id: BoardStyleId;
  /** Suggested total base thickness (mm) for the printed lattice / panel */
  thicknessMm: number;
  /** How the piece is expected to flex */
  flex: 'stiff' | 'bendable' | 'sheet';
}

export const BOARD_THICKNESS_MIN_MM = 0.3;
export const BOARD_THICKNESS_MAX_MM = 3.0;

export const BOARD_STYLES: BoardStyle[] = [
  // Thick plastic board — coasters / standing pieces
  { id: 'rigid', thicknessMm: 1.8, flex: 'stiff' },
  // Typical plastic canvas — can bend a little
  { id: 'bendable', thicknessMm: 1.0, flex: 'bendable' },
  // Thin sheet — bookmarks / keytags
  { id: 'bookmark', thicknessMm: 0.5, flex: 'sheet' },
  { id: 'custom', thicknessMm: 1.0, flex: 'bendable' },
];

export const BOARD_STYLE_MAP: Record<BoardStyleId, BoardStyle> =
  BOARD_STYLES.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<BoardStyleId, BoardStyle>
  );

/** How many Z passes to print for a given board thickness. */
export function boardPassesFromThickness(
  thicknessMm: number,
  layerHeightMm: number = DEFAULT_LAYER_HEIGHT_MM
): number {
  const lh = Math.max(0.05, layerHeightMm);
  return Math.max(1, Math.round(thicknessMm / lh));
}
