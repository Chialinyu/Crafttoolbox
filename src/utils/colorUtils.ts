/**
 * Color Utilities for Mosaic Generator
 * Centralized color manipulation and quantization functions
 */

/**
 * Parse RGB color string to [r, g, b] array
 * @param rgb - RGB color string like "rgb(255, 128, 0)"
 * @returns [r, g, b] array or [0, 0, 0] if invalid
 */
export const parseRgbString = (rgb: string): [number, number, number] => {
  const match = rgb.match(/rgb\((\d+), (\d+), (\d+)\)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
};

/**
 * Convert RGB string to HEX color
 * @param rgb - RGB color string like "rgb(255, 128, 0)" or already hex
 * @returns HEX color string like "#ff8000"
 */
export const rgbToHex = (rgb: string): string => {
  if (!rgb) return '#000000';  // Guard against undefined/null
  if (rgb.startsWith('#')) return rgb;
  
  const [r, g, b] = parseRgbString(rgb);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Convert HEX color to RGB string
 * @param hex - HEX color string like "#ff8000"
 * @returns RGB string like "rgb(255, 128, 0)"
 */
export const hexToRgb = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Convert HEX color to RGB array
 * @param hex - HEX color string like "#ff8000"
 * @returns RGB array [r, g, b]
 */
export const hexToRgbArray = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
};

/**
 * Calculate Euclidean distance between two colors in RGB space
 * @param rgb1 - First RGB values [r, g, b]
 * @param rgb2 - Second RGB values [r, g, b]
 * @returns Distance value
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

/**
 * Find the closest color in palette for given RGB values
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @param colorPalette - Array of RGB color strings
 * @returns Index of the closest color in the palette
 */
export const findClosestColor = (
  r: number,
  g: number,
  b: number,
  colorPalette: string[]
): number => {
  let minDist = Infinity;
  let closestIndex = 0;

  colorPalette.forEach((color, index) => {
    const paletteRgb = parseRgbString(color);
    const dist = colorDistance([r, g, b], paletteRgb);
    
    if (dist < minDist) {
      minDist = dist;
      closestIndex = index;
    }
  });

  return closestIndex;
};

/**
 * Color quantization using median cut algorithm
 * Reduces an image to a specific number of representative colors
 * @param imageData - ImageData from canvas
 * @param targetNumColors - Target number of colors
 * @returns Array of RGB color strings
 */
export const quantizeColors = (
  imageData: ImageData,
  targetNumColors: number
): string[] => {
  if (targetNumColors <= 0) return [];

  // Extract all pixels as [r, g, b] arrays and track global frequency
  const pixels: [number, number, number][] = [];
  const globalFrequency = new Map<string, number>();
  for (let i = 0; i < imageData.data.length; i += 4) {
    const pixel: [number, number, number] = [
      imageData.data[i],
      imageData.data[i + 1],
      imageData.data[i + 2]
    ];
    pixels.push(pixel);
    const key = `${pixel[0]},${pixel[1]},${pixel[2]}`;
    globalFrequency.set(key, (globalFrequency.get(key) ?? 0) + 1);
  }

  if (pixels.length === 0) return [];

  const toRgb = (key: string) => {
    const [r, g, b] = key.split(',').map(Number);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const dominantGlobal = Array.from(globalFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  if (globalFrequency.size <= targetNumColors) {
    return dominantGlobal.slice(0, targetNumColors).map(toRgb);
  }

  const channelRange = (bucket: [number, number, number][]) => {
    const ranges = [0, 1, 2].map((channel) => {
      let min = 255;
      let max = 0;
      for (let i = 0; i < bucket.length; i++) {
        const value = bucket[i][channel];
        if (value < min) min = value;
        if (value > max) max = value;
      }
      return max - min;
    });
    const maxRange = Math.max(...ranges);
    return {
      maxRange,
      maxChannel: ranges.indexOf(maxRange),
    };
  };

  const buckets: [number, number, number][][] = [pixels];
  while (buckets.length < targetNumColors) {
    let bestIndex = -1;
    let bestRange = -1;
    let splitChannel = 0;

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      if (bucket.length <= 1) continue;
      const { maxRange, maxChannel: channel } = channelRange(bucket);
      if (maxRange > bestRange) {
        bestRange = maxRange;
        bestIndex = i;
        splitChannel = channel;
      }
    }

    if (bestIndex === -1) break;

    const bucket = buckets[bestIndex];
    bucket.sort((a, b) => a[splitChannel] - b[splitChannel]);
    const mid = Math.floor(bucket.length / 2);
    const left = bucket.slice(0, mid);
    const right = bucket.slice(mid);
    if (left.length === 0 || right.length === 0) break;
    buckets.splice(bestIndex, 1, left, right);
  }

  const chosenKeys: string[] = [];
  const used = new Set<string>();

  // Pick representative colors that actually exist in the image (mode per bucket).
  buckets.forEach((bucket) => {
    const localFrequency = new Map<string, number>();
    for (let i = 0; i < bucket.length; i++) {
      const key = `${bucket[i][0]},${bucket[i][1]},${bucket[i][2]}`;
      localFrequency.set(key, (localFrequency.get(key) ?? 0) + 1);
    }
    const candidates = Array.from(localFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);
    const uniqueCandidate = candidates.find((key) => !used.has(key)) ?? candidates[0];
    if (uniqueCandidate && !used.has(uniqueCandidate)) {
      used.add(uniqueCandidate);
      chosenKeys.push(uniqueCandidate);
    }
  });

  for (let i = 0; i < dominantGlobal.length && chosenKeys.length < targetNumColors; i++) {
    const key = dominantGlobal[i];
    if (!used.has(key)) {
      used.add(key);
      chosenKeys.push(key);
    }
  }

  return chosenKeys.slice(0, targetNumColors).map(toRgb);
};

/**
 * Remove duplicate colors from palette and create mapping
 * @param colors - Array of RGB color strings
 * @returns Object with unique colors and mapping array
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
 * Reduce palette to target size by merging similar colors
 * Uses iterative merging of closest color pairs
 * @param colors - Array of RGB color strings
 * @param targetSize - Target palette size
 * @returns Object with reduced colors and mapping array
 */
export const reducePalette = (
  colors: string[],
  targetSize: number
): { reducedColors: string[]; mapping: number[] } => {
  if (colors.length <= targetSize) {
    return { 
      reducedColors: colors, 
      mapping: colors.map((_, i) => i) 
    };
  }

  // Parse RGB values for all colors
  const rgbColors = colors.map(color => parseRgbString(color));

  // Keep merging until we reach target size
  let workingColors = [...rgbColors];
  let workingMapping = colors.map((_, i) => i);

  while (workingColors.length > targetSize) {
    // Find two most similar colors
    let minDist = Infinity;
    let mergeI = 0;
    let mergeJ = 1;

    for (let i = 0; i < workingColors.length; i++) {
      for (let j = i + 1; j < workingColors.length; j++) {
        const dist = colorDistance(workingColors[i], workingColors[j]);
        if (dist < minDist) {
          minDist = dist;
          mergeI = i;
          mergeJ = j;
        }
      }
    }

    // Merge the two colors (average them)
    const merged: [number, number, number] = [
      Math.round((workingColors[mergeI][0] + workingColors[mergeJ][0]) / 2),
      Math.round((workingColors[mergeI][1] + workingColors[mergeJ][1]) / 2),
      Math.round((workingColors[mergeI][2] + workingColors[mergeJ][2]) / 2)
    ];

    // Update mapping
    workingMapping = workingMapping.map(idx => {
      if (idx === mergeJ) return mergeI;
      if (idx > mergeJ) return idx - 1;
      return idx;
    });

    // Remove merged color and update the kept one
    workingColors[mergeI] = merged;
    workingColors.splice(mergeJ, 1);
  }

  // Convert back to RGB strings
  const reducedColors = workingColors.map(
    ([r, g, b]) => `rgb(${r}, ${g}, ${b})`
  );

  return { reducedColors, mapping: workingMapping };
};

/**
 * Process ImageData to handle transparency:
 * - Fully transparent pixels (alpha === 0) are marked in a mask
 * - Semi-transparent pixels (alpha 1-254) are composited to white background
 * - Fully opaque pixels (alpha === 255) are unchanged
 * 
 * @param imageData - The image data to process
 * @param backgroundColor - Background color for alpha compositing (default: white)
 * @returns Processed image data and transparent mask
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
      // Fully transparent - mark in mask
      transparentMask[pixelIndex] = 1;
      // Don't modify RGB values
    } else if (a < 255) {
      // Semi-transparent - alpha compositing to white background
      const alpha = a / 255;
      data[i] = Math.round(r * alpha + backgroundColor.r * (1 - alpha));
      data[i + 1] = Math.round(g * alpha + backgroundColor.g * (1 - alpha));
      data[i + 2] = Math.round(b * alpha + backgroundColor.b * (1 - alpha));
      data[i + 3] = 255; // Make fully opaque
      transparentMask[pixelIndex] = 0;
    } else {
      // Fully opaque - no processing needed
      transparentMask[pixelIndex] = 0;
    }
  }
  
  return { imageData, transparentMask };
};

/**
 * Check if image data contains any transparent pixels
 * @param imageData - The image data to check
 * @returns True if any pixel has alpha < 255
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