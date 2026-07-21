import { parseColorToRgb, rgbToHex } from '@/utils/colorUtils';
import type { StitchColorMap } from './types';

/** Sentinel for transparent / empty stitch cells in the editor. */
export const TRANSPARENT_STITCH_INDEX = -1;

export function normalizeHexColor(color: string): string {
  return rgbToHex(color).toLowerCase();
}

export function cloneColorMap(colorMap: StitchColorMap): StitchColorMap {
  return colorMap.map((row) => [...row]);
}

export function emptyColorMap(cols: number, rows: number): StitchColorMap {
  return Array.from({ length: Math.max(1, rows) }, () =>
    Array.from({ length: Math.max(1, cols) }, () => null)
  );
}

export function countPaletteUsage(
  colorMap: StitchColorMap | null,
  paletteLength: number
): { counts: number[]; transparentCount: number; occupiedCount: number } {
  const counts = Array.from({ length: Math.max(0, paletteLength) }, () => 0);
  let transparentCount = 0;
  let occupiedCount = 0;

  if (!colorMap) {
    return { counts, transparentCount, occupiedCount };
  }

  for (const row of colorMap) {
    for (const cell of row) {
      if (cell === null || cell === undefined) {
        transparentCount++;
        continue;
      }
      if (cell >= 0 && cell < counts.length) {
        counts[cell]++;
        occupiedCount++;
      }
    }
  }

  return { counts, transparentCount, occupiedCount };
}

/**
 * Remap every palette index through a mapping table. Nulls stay empty.
 */
export function remapColorMap(
  colorMap: StitchColorMap,
  indexMap: Array<number | null>
): StitchColorMap {
  return colorMap.map((row) =>
    row.map((cell) => {
      if (cell === null || cell === undefined) return null;
      return indexMap[cell] ?? null;
    })
  );
}

/**
 * Change a palette swatch. Exact duplicate colors merge into the existing entry
 * (Mosaic-style segment merge).
 */
export function changePaletteColor(
  colorMap: StitchColorMap,
  palette: string[],
  colorIndex: number,
  nextColor: string
): { colorMap: StitchColorMap; palette: string[]; mergedInto: number | null } {
  if (colorIndex < 0 || colorIndex >= palette.length) {
    return { colorMap, palette, mergedInto: null };
  }

  const normalized = normalizeHexColor(nextColor);
  const existingIndex = palette.findIndex(
    (color, index) => index !== colorIndex && normalizeHexColor(color) === normalized
  );

  if (existingIndex === -1) {
    const nextPalette = [...palette];
    nextPalette[colorIndex] = normalized;
    return { colorMap: cloneColorMap(colorMap), palette: nextPalette, mergedInto: null };
  }

  const indexMap = palette.map((_, index) => {
    if (index === colorIndex) return existingIndex > colorIndex ? existingIndex - 1 : existingIndex;
    if (index > colorIndex) return index - 1;
    return index;
  });

  return {
    colorMap: remapColorMap(colorMap, indexMap),
    palette: palette.filter((_, index) => index !== colorIndex),
    mergedInto: existingIndex > colorIndex ? existingIndex - 1 : existingIndex,
  };
}

export function paintCell(
  colorMap: StitchColorMap,
  row: number,
  col: number,
  paintIndex: number
): StitchColorMap | null {
  const current = colorMap[row]?.[col];
  const nextValue = paintIndex === TRANSPARENT_STITCH_INDEX ? null : paintIndex;
  if (current === nextValue) return null;

  const next = cloneColorMap(colorMap);
  next[row][col] = nextValue;
  return next;
}

export function colorsEqual(a: string, b: string): boolean {
  const [ar, ag, ab] = parseColorToRgb(a);
  const [br, bg, bb] = parseColorToRgb(b);
  return ar === br && ag === bg && ab === bb;
}
