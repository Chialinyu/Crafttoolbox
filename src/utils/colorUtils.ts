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
  // Extract all pixels as [r, g, b] arrays
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < imageData.data.length; i += 4) {
    pixels.push([
      imageData.data[i],
      imageData.data[i + 1],
      imageData.data[i + 2]
    ]);
  }

  /**
   * Recursive median cut function
   * Splits color space into buckets and averages each bucket
   */
  const medianCut = (
    pixelList: [number, number, number][],
    depth: number
  ): string[] => {
    if (depth === 0 || pixelList.length === 0) {
      // Calculate average color for this bucket
      const sum = pixelList.reduce(
        (acc, pixel) => [acc[0] + pixel[0], acc[1] + pixel[1], acc[2] + pixel[2]],
        [0, 0, 0]
      );
      const len = pixelList.length || 1;
      return [
        `rgb(${Math.round(sum[0] / len)}, ${Math.round(sum[1] / len)}, ${Math.round(sum[2] / len)})`
      ];
    }

    // Find the channel with the largest range
    const ranges = [0, 1, 2].map(channel => {
      const values = pixelList.map(p => p[channel]);
      return Math.max(...values) - Math.min(...values);
    });

    const maxChannel = ranges.indexOf(Math.max(...ranges));
    
    // Sort by the channel with largest range
    pixelList.sort((a, b) => a[maxChannel] - b[maxChannel]);

    // Split at median
    const mid = Math.floor(pixelList.length / 2);
    return [
      ...medianCut(pixelList.slice(0, mid), depth - 1),
      ...medianCut(pixelList.slice(mid), depth - 1)
    ];
  };

  return medianCut(pixels, Math.ceil(Math.log2(targetNumColors)));
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