import { colorDistanceLab, parseColorToRgb } from '@/utils/colorUtils';
import type {
  ImageToMaskOptions,
  OccupancyMask,
  QuantizedStitchPattern,
} from './types';

/**
 * Convert ImageData to a cols×rows occupancy mask for cross-stitch.
 */
export function imageDataToStitchMask(
  imageData: ImageData,
  options: ImageToMaskOptions
): OccupancyMask {
  return imageDataToColorPattern(imageData, options).colorMap.map((row) =>
    row.map((cell) => cell !== null)
  );
}

interface SampledCell {
  row: number;
  col: number;
  rgb: [number, number, number];
}

/**
 * Quantize source colors onto the stitch grid.
 * Empty cells are null. For paper/photo sources, prefer emptyMode 'background':
 * each cell keeps only foreground pixels (Lab ΔE vs paper), so thin strips survive.
 */
export function imageDataToColorPattern(
  imageData: ImageData,
  options: ImageToMaskOptions
): QuantizedStitchPattern {
  const {
    cols,
    rows,
    emptyMode,
    threshold,
    invert,
    fit,
    colorCount,
    backgroundColor,
    backgroundTolerance,
    minCoveragePercent,
  } = options;
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);

  const srcW = imageData.width;
  const srcH = imageData.height;
  const data = imageData.data;

  const { offsetX, offsetY, scale } = computeFit(srcW, srcH, safeCols, safeRows, fit);
  const bgRgb = parseColorToRgb(backgroundColor);
  const coverageFloor = Math.max(0.05, Math.min(0.8, minCoveragePercent / 100));

  const samples: SampledCell[] = [];
  const colorMap: Array<Array<number | null>> = Array.from(
    { length: safeRows },
    () => Array.from({ length: safeCols }, () => null)
  );

  for (let r = 0; r < safeRows; r++) {
    for (let c = 0; c < safeCols; c++) {
      const destCx = c + 0.5;
      const destCy = r + 0.5;
      const srcX = (destCx - offsetX) / scale;
      const srcY = (destCy - offsetY) / scale;

      if (srcX < 0 || srcY < 0 || srcX >= srcW || srcY >= srcH) continue;

      const x0 = Math.max(0, Math.floor((c - offsetX) / scale));
      const x1 = Math.min(srcW - 1, Math.ceil((c + 1 - offsetX) / scale) - 1);
      const y0 = Math.max(0, Math.floor((r - offsetY) / scale));
      const y1 = Math.min(srcH - 1, Math.ceil((r + 1 - offsetY) / scale) - 1);

      // Denser sampling helps thin paper-strip details survive averaging.
      const stepX = Math.max(1, Math.floor((x1 - x0 + 1) / 8));
      const stepY = Math.max(1, Math.floor((y1 - y0 + 1) / 8));

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let opaqueCount = 0;

      let fgSumR = 0;
      let fgSumG = 0;
      let fgSumB = 0;
      let fgSumA = 0;
      let fgCount = 0;

      for (let y = y0; y <= y1; y += stepY) {
        for (let x = x0; x <= x1; x += stepX) {
          const i = (y * srcW + x) * 4;
          const a = data[i + 3];
          if (a < 16) continue;
          const weight = a / 255;
          const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
          opaqueCount++;
          sumR += rgb[0] * weight;
          sumG += rgb[1] * weight;
          sumB += rgb[2] * weight;
          sumA += weight;

          if (emptyMode === 'background') {
            const deltaE = colorDistanceLab(rgb, bgRgb);
            if (deltaE >= backgroundTolerance) {
              fgCount++;
              fgSumR += rgb[0] * weight;
              fgSumG += rgb[1] * weight;
              fgSumB += rgb[2] * weight;
              fgSumA += weight;
            }
          }
        }
      }

      if (opaqueCount === 0 || sumA <= 0) continue;

      let occupied = true;
      let rgb: [number, number, number] = [sumR / sumA, sumG / sumA, sumB / sumA];

      if (emptyMode === 'background') {
        const coverage = fgCount / opaqueCount;
        occupied = coverage >= coverageFloor && fgSumA > 0;
        if (occupied) {
          rgb = [fgSumR / fgSumA, fgSumG / fgSumA, fgSumB / fgSumA];
        }
      } else if (emptyMode === 'luminance') {
        const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
        const dark = luma < threshold;
        occupied = invert ? !dark : dark;
      }

      if (occupied) samples.push({ row: r, col: c, rgb });
    }
  }

  if (samples.length === 0) {
    return { colorMap, palette: [], occupiedCount: 0 };
  }

  const k = Math.max(1, Math.min(Math.round(colorCount), 8, samples.length));
  const centroids = quantizeRgb(
    samples.map((sample) => sample.rgb),
    k
  );
  for (const sample of samples) {
    colorMap[sample.row][sample.col] = nearestColor(sample.rgb, centroids);
  }

  return {
    colorMap,
    palette: centroids.map(rgbToHex),
    occupiedCount: samples.length,
  };
}

/**
 * Estimate paper/background color from image corners (common for scans/photos).
 */
export function sampleCornerBackground(imageData: ImageData): string {
  const { width, height, data } = imageData;
  const insetX = Math.max(1, Math.floor(width * 0.04));
  const insetY = Math.max(1, Math.floor(height * 0.04));
  const points = [
    [insetX, insetY],
    [width - 1 - insetX, insetY],
    [insetX, height - 1 - insetY],
    [width - 1 - insetX, height - 1 - insetY],
  ] as const;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (const [cx, cy] of points) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.min(width - 1, Math.max(0, cx + dx));
        const y = Math.min(height - 1, Math.max(0, cy + dy));
        const i = (y * width + x) * 4;
        if (data[i + 3] < 16) continue;
        sumR += data[i];
        sumG += data[i + 1];
        sumB += data[i + 2];
        count++;
      }
    }
  }

  if (count === 0) return '#ffffff';
  return rgbToHex([sumR / count, sumG / count, sumB / count]);
}

function quantizeRgb(
  colors: Array<[number, number, number]>,
  k: number
): Array<[number, number, number]> {
  const centroids: Array<[number, number, number]> = [[...colors[0]]];

  // Deterministic farthest-point initialization avoids unstable palette jumps.
  while (centroids.length < k) {
    let best = colors[0];
    let bestDistance = -1;
    for (const color of colors) {
      const distance = Math.min(
        ...centroids.map((centroid) => colorDistanceSquared(color, centroid))
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        best = color;
      }
    }
    centroids.push([...best]);
  }

  for (let iteration = 0; iteration < 12; iteration++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (const color of colors) {
      const index = nearestColor(color, centroids);
      sums[index][0] += color[0];
      sums[index][1] += color[1];
      sums[index][2] += color[2];
      sums[index][3] += 1;
    }

    let moved = false;
    for (let i = 0; i < k; i++) {
      const count = sums[i][3];
      if (count === 0) continue;
      const next: [number, number, number] = [
        sums[i][0] / count,
        sums[i][1] / count,
        sums[i][2] / count,
      ];
      if (colorDistanceSquared(next, centroids[i]) > 0.25) moved = true;
      centroids[i] = next;
    }
    if (!moved) break;
  }

  // Stable visual ordering: dark → light.
  return centroids.sort(
    (a, b) =>
      0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2] -
      (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2])
  );
}

function nearestColor(
  color: [number, number, number],
  centroids: Array<[number, number, number]>
): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const distance = colorDistanceSquared(color, centroids[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

function colorDistanceSquared(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return (
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2
  );
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

function computeFit(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  fit: ImageToMaskOptions['fit']
): { offsetX: number; offsetY: number; scale: number } {
  const scaleX = destW / srcW;
  const scaleY = destH / srcH;
  const scale = fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const offsetX = (destW - srcW * scale) / 2;
  const offsetY = (destH - srcH * scale) / 2;
  return { offsetX, offsetY, scale };
}

/** Empty mask (no stitches) */
export function emptyOccupancy(cols: number, rows: number): OccupancyMask {
  return Array.from({ length: Math.max(1, rows) }, () =>
    Array.from({ length: Math.max(1, cols) }, () => false)
  );
}

export function countOccupied(mask: OccupancyMask | null): number {
  if (!mask) return 0;
  let n = 0;
  for (const row of mask) {
    for (const cell of row) {
      if (cell) n++;
    }
  }
  return n;
}

/** Grid dimensions from physical size */
export function gridDimensions(
  widthMm: number,
  heightMm: number,
  cellSize: number
): { cols: number; rows: number; safeCell: number } {
  const safeCell = Math.max(1, cellSize);
  return {
    safeCell,
    cols: Math.max(1, Math.floor(widthMm / safeCell)),
    rows: Math.max(1, Math.floor(heightMm / safeCell)),
  };
}
