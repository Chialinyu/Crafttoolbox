/**
 * Color Utilities for Mosaic Generator
 * Centralized color manipulation and quantization functions
 *
 * Palette extraction uses CIELAB + k-means++ (design-tool style),
 * not RGB median-cut — distances match human perception better.
 */

import chroma from 'chroma-js';

/**
 * Parse any supported color string to [r, g, b]
 * Supports: rgb(...), #RRGGBB, "r,g,b"
 */
export const parseColorToRgb = (color: string): [number, number, number] => {
  if (!color) return [0, 0, 0];

  if (color.startsWith('#')) {
    const hex = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    return [
      parseInt(hex.slice(1, 3), 16) || 0,
      parseInt(hex.slice(3, 5), 16) || 0,
      parseInt(hex.slice(5, 7), 16) || 0,
    ];
  }

  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
  }

  if (color.includes(',')) {
    const parts = color.split(',').map((p) => parseInt(p.trim(), 10));
    if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
      return [parts[0], parts[1], parts[2]];
    }
  }

  return [0, 0, 0];
};

/**
 * Parse RGB color string to [r, g, b] array
 */
export const parseRgbString = (rgb: string): [number, number, number] => {
  return parseColorToRgb(rgb);
};

/**
 * Convert RGB string to HEX color
 */
export const rgbToHex = (rgb: string): string => {
  if (!rgb) return '#000000';
  if (rgb.startsWith('#')) return rgb;
  
  const [r, g, b] = parseColorToRgb(rgb);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Convert HEX color to RGB string
 */
export const hexToRgb = (hex: string): string => {
  const [r, g, b] = parseColorToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Convert HEX color to RGB array
 */
export const hexToRgbArray = (hex: string): [number, number, number] => {
  return parseColorToRgb(hex);
};

/**
 * Euclidean distance in RGB. Prefer {@link colorDistanceLab} for perception.
 */
export const colorDistance = (
  rgb1: [number, number, number],
  rgb2: [number, number, number]
): number => {
  return Math.sqrt(
    Math.pow(rgb1[0] - rgb2[0], 2) +
    Math.pow(rgb1[1] - rgb2[1], 2) +
    Math.pow(rgb1[2] - rgb2[2], 2)
  );
};

type Lab = [number, number, number];

const rgbToLab = (rgb: [number, number, number]): Lab => {
  const lab = chroma.rgb(rgb[0], rgb[1], rgb[2]).lab();
  return [lab[0], lab[1], lab[2]];
};

const labToRgb = (lab: Lab): [number, number, number] => {
  const rgb = chroma.lab(lab[0], lab[1], lab[2]).rgb();
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0]))),
    Math.max(0, Math.min(255, Math.round(rgb[1]))),
    Math.max(0, Math.min(255, Math.round(rgb[2]))),
  ];
};

/** Euclidean distance in CIELAB (≈ ΔE76) */
export const colorDistanceLab = (
  rgb1: [number, number, number],
  rgb2: [number, number, number]
): number => {
  const a = rgbToLab(rgb1);
  const b = rgbToLab(rgb2);
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
};

const labDistance = (a: Lab, b: Lab): number =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const rgbKey = (rgb: [number, number, number]) =>
  `${rgb[0]},${rgb[1]},${rgb[2]}`;

const toRgbString = (rgb: [number, number, number]) =>
  `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

/** Deterministic PRNG so the same image + K yields the same palette */
const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const hashImageSeed = (imageData: ImageData): number => {
  const { data, width, height } = imageData;
  let h = (width * 73856093) ^ (height * 19349663) ^ data.length;
  const step = Math.max(4, Math.floor(data.length / 256) * 4);
  for (let i = 0; i < data.length; i += step) {
    h = Math.imul(h ^ data[i], 0x01000193);
    h = Math.imul(h ^ data[i + 1], 0x01000193);
    h = Math.imul(h ^ data[i + 2], 0x01000193);
  }
  return h >>> 0;
};

/**
 * Find the closest palette color using CIELAB distance
 */
export const createLabColorMatcher = (
  colorPalette: string[]
): ((r: number, g: number, b: number) => number) => {
  // Palette colors are constant for a mapping pass. Convert them once instead
  // of repeating the same chroma RGB → Lab conversion for every tile.
  const paletteLab = colorPalette.map((color) =>
    rgbToLab(parseColorToRgb(color))
  );

  return (r: number, g: number, b: number): number => {
    if (paletteLab.length === 0) return 0;

    const sampleLab = rgbToLab([r, g, b]);
    let minDist = Infinity;
    let closestIndex = 0;

    for (let index = 0; index < paletteLab.length; index++) {
      const dist = labDistance(sampleLab, paletteLab[index]);
      if (dist < minDist) {
        minDist = dist;
        closestIndex = index;
      }
    }

    return closestIndex;
  };
};

export const findClosestColor = (
  r: number,
  g: number,
  b: number,
  colorPalette: string[]
): number => {
  return createLabColorMatcher(colorPalette)(r, g, b);
};

/**
 * Color quantization via CIELAB + k-means++.
 *
 * Design-tool style:
 * - Cluster in perceptually uniform Lab space
 * - k-means++ initialization for well-spread centers
 * - Deterministic seed from image content (stable when changing K)
 */
export const quantizeColors = (
  imageData: ImageData,
  targetNumColors: number
): string[] => {
  if (targetNumColors <= 0) return [];

  const globalFrequency = new Map<string, number>();

  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 3] === 0) continue;

    const pixel: [number, number, number] = [
      imageData.data[i],
      imageData.data[i + 1],
      imageData.data[i + 2],
    ];
    const key = rgbKey(pixel);
    globalFrequency.set(key, (globalFrequency.get(key) ?? 0) + 1);
  }

  if (globalFrequency.size === 0) return [];

  if (globalFrequency.size <= targetNumColors) {
    return Array.from(globalFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, targetNumColors)
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number) as [number, number, number];
        return toRgbString([r, g, b]);
      });
  }

  // Unique colors weighted by frequency (fast + correct for mosaic grids)
  const uniqueEntries = Array.from(globalFrequency.entries());
  const labPoints: Lab[] = [];
  const weights: number[] = [];

  for (const [key, weight] of uniqueEntries) {
    const [r, g, b] = key.split(',').map(Number) as [number, number, number];
    labPoints.push(rgbToLab([r, g, b]));
    weights.push(weight);
  }

  const k = Math.min(targetNumColors, labPoints.length);
  const MAX_ITERS = 20;
  const ATTEMPTS = 3;
  const baseSeed = hashImageSeed(imageData) ^ (k * 2654435761);

  const runKMeans = (attempt: number) => {
    const random = mulberry32(baseSeed ^ Math.imul(attempt + 1, 0x9e3779b1));
    const centers: Lab[] = [];
    const firstIdx = Math.floor(random() * labPoints.length);
    centers.push([...labPoints[firstIdx]] as Lab);

    const minDistSq = new Float64Array(labPoints.length).fill(Infinity);
    while (centers.length < k) {
      let sum = 0;
      const probabilities = new Float64Array(labPoints.length);
      const last = centers[centers.length - 1];

      for (let i = 0; i < labPoints.length; i++) {
        const distance = labDistance(labPoints[i], last);
        const distanceSq = distance * distance;
        if (distanceSq < minDistSq[i]) minDistSq[i] = distanceSq;
        probabilities[i] = minDistSq[i] * weights[i];
        sum += probabilities[i];
      }

      if (sum <= 0) break;

      let threshold = random() * sum;
      let chosen = labPoints.length - 1;
      for (let i = 0; i < labPoints.length; i++) {
        threshold -= probabilities[i];
        if (threshold <= 0) {
          chosen = i;
          break;
        }
      }
      centers.push([...labPoints[chosen]] as Lab);
    }

    const assignments = new Int32Array(labPoints.length).fill(-1);
    for (let iter = 0; iter < MAX_ITERS; iter++) {
      let changed = false;

      for (let i = 0; i < labPoints.length; i++) {
        let best = 0;
        let bestDistance = Infinity;
        for (let c = 0; c < centers.length; c++) {
          const distance = labDistance(labPoints[i], centers[c]);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = c;
          }
        }
        if (assignments[i] !== best) {
          assignments[i] = best;
          changed = true;
        }
      }

      const sums: Lab[] = centers.map(() => [0, 0, 0]);
      const counts = new Float64Array(centers.length);
      for (let i = 0; i < labPoints.length; i++) {
        const cluster = assignments[i];
        const weight = weights[i];
        sums[cluster][0] += labPoints[i][0] * weight;
        sums[cluster][1] += labPoints[i][1] * weight;
        sums[cluster][2] += labPoints[i][2] * weight;
        counts[cluster] += weight;
      }

      for (let c = 0; c < centers.length; c++) {
        if (counts[c] > 0) {
          centers[c] = [
            sums[c][0] / counts[c],
            sums[c][1] / counts[c],
            sums[c][2] / counts[c],
          ];
        }
      }

      if (!changed) break;
    }

    let inertia = 0;
    for (let i = 0; i < labPoints.length; i++) {
      const distance = labDistance(labPoints[i], centers[assignments[i]]);
      inertia += distance * distance * weights[i];
    }

    return { centers, assignments, inertia };
  };

  let bestRun = runKMeans(0);
  for (let attempt = 1; attempt < ATTEMPTS; attempt++) {
    const candidate = runKMeans(attempt);
    if (candidate.inertia < bestRun.inertia) {
      bestRun = candidate;
    }
  }

  const { centers, assignments } = bestRun;

  const clusterWeights = new Float64Array(centers.length);
  for (let i = 0; i < assignments.length; i++) {
    clusterWeights[assignments[i]] += weights[i];
  }

  const ordered = centers
    .map((lab, index) => ({ lab, weight: clusterWeights[index] }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const result: string[] = [];
  const used = new Set<string>();
  for (const { lab } of ordered) {
    if (result.length >= targetNumColors) break;
    const rgb = labToRgb(lab);
    const key = rgbKey(rgb);
    if (used.has(key)) continue;
    used.add(key);
    result.push(toRgbString(rgb));
  }

  if (result.length < targetNumColors) {
    const globals = Array.from(globalFrequency.entries()).sort((a, b) => b[1] - a[1]);
    for (const [key] of globals) {
      if (result.length >= targetNumColors) break;
      if (used.has(key)) continue;
      used.add(key);
      const [r, g, b] = key.split(',').map(Number) as [number, number, number];
      result.push(toRgbString([r, g, b]));
    }
  }

  return result;
};

/**
 * Remove duplicate colors from palette and create mapping
 */
export const deduplicatePalette = (
  colors: string[]
): { uniqueColors: string[]; mapping: number[] } => {
  const uniqueColors: string[] = [];
  const mapping: number[] = [];
  
  colors.forEach((color, index) => {
    const existingIndex = uniqueColors.findIndex(c => c === color);
    if (existingIndex === -1) {
      mapping[index] = uniqueColors.length;
      uniqueColors.push(color);
    } else {
      mapping[index] = existingIndex;
    }
  });
  
  return { uniqueColors, mapping };
};

/**
 * Reduce palette using Lab distance; keep heavier color (no muddy averages).
 */
export const reducePalette = (
  colors: string[],
  targetSize: number,
  weights?: number[]
): { reducedColors: string[]; mapping: number[] } => {
  if (colors.length <= targetSize) {
    return { 
      reducedColors: colors, 
      mapping: colors.map((_, i) => i) 
    };
  }

  type Slot = {
    rgb: [number, number, number];
    weight: number;
    origins: number[];
  };

  const slots: Slot[] = colors.map((color, i) => ({
    rgb: parseColorToRgb(color),
    weight: weights?.[i] ?? 1,
    origins: [i],
  }));

  while (slots.length > targetSize) {
    let minDist = Infinity;
    let mergeI = 0;
    let mergeJ = 1;

    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const dist = colorDistanceLab(slots[i].rgb, slots[j].rgb);
        if (dist < minDist) {
          minDist = dist;
          mergeI = i;
          mergeJ = j;
        }
      }
    }

    const keep = slots[mergeI].weight >= slots[mergeJ].weight ? mergeI : mergeJ;
    const drop = keep === mergeI ? mergeJ : mergeI;

    slots[keep] = {
      rgb: slots[keep].rgb,
      weight: slots[keep].weight + slots[drop].weight,
      origins: [...slots[keep].origins, ...slots[drop].origins],
    };
    slots.splice(drop, 1);
  }

  const reducedColors = slots.map((s) => toRgbString(s.rgb));
  const mapping = new Array(colors.length).fill(0);
  slots.forEach((slot, newIndex) => {
    slot.origins.forEach((origin) => {
      mapping[origin] = newIndex;
    });
  });

  return { reducedColors, mapping };
};

/**
 * Process ImageData to handle transparency
 */
export const processImageDataForTransparency = (
  imageData: ImageData,
  backgroundColor = { r: 255, g: 255, b: 255 }
): { imageData: ImageData; transparentMask: Uint8Array } => {
  const data = imageData.data;
  const transparentMask = new Uint8Array(imageData.width * imageData.height);
  
  for (let i = 0, pixelIndex = 0; i < data.length; i += 4, pixelIndex++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    if (a === 0) {
      transparentMask[pixelIndex] = 1;
    } else if (a < 255) {
      const alpha = a / 255;
      data[i] = Math.round(r * alpha + backgroundColor.r * (1 - alpha));
      data[i + 1] = Math.round(g * alpha + backgroundColor.g * (1 - alpha));
      data[i + 2] = Math.round(b * alpha + backgroundColor.b * (1 - alpha));
      data[i + 3] = 255;
      transparentMask[pixelIndex] = 0;
    } else {
      transparentMask[pixelIndex] = 0;
    }
  }
  
  return { imageData, transparentMask };
};

/**
 * Check if image data contains any transparent pixels
 */
export const hasTransparency = (imageData: ImageData): boolean => {
  const data = imageData.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      return true;
    }
  }
  return false;
};
