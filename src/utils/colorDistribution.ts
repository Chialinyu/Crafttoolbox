import chroma from 'chroma-js';

/**
 * Color Distribution Analyzer
 * 
 * Analyzes the color distribution characteristics of an image
 * to dynamically determine appropriate thresholds for color mapping.
 */

export interface ColorDistributionStats {
  // Average distance between colors in the palette
  averageColorDistance: number;
  
  // Standard deviation of color distances
  colorDistanceStdDev: number;
  
  // Minimum distance between any two colors
  minColorDistance: number;
  
  // Maximum distance between any two colors
  maxColorDistance: number;
  
  // Color density (how tightly packed colors are)
  // Low value = colors are very similar (high density)
  // High value = colors are very different (low density)
  colorDensity: number;
  
  // Recommended threshold for color mapping (Delta E)
  recommendedThreshold: number;
  
  // Recommended strict threshold for exact matching
  strictThreshold: number;
}

/**
 * Calculate Delta E (CIE2000) distance between two RGB colors
 */
function calculateDeltaE(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  try {
    const c1 = chroma.rgb(rgb1[0], rgb1[1], rgb1[2]);
    const c2 = chroma.rgb(rgb2[0], rgb2[1], rgb2[2]);
    return chroma.deltaE(c1, c2);
  } catch (e) {
    return Infinity;
  }
}

/**
 * Parse color string to RGB array
 */
function parseColorToRgb(color: string): [number, number, number] {
  if (color.startsWith('rgb(')) {
    // "rgb(255, 128, 0)" format
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    }
  } else if (color.startsWith('#')) {
    // Hex format
    const c = chroma(color);
    return c.rgb() as [number, number, number];
  } else if (color.includes(',')) {
    // "255,128,0" format
    const parts = color.split(',').map(Number);
    return [parts[0], parts[1], parts[2]];
  }
  
  // Fallback
  return [0, 0, 0];
}

/**
 * Analyze the color distribution of a palette
 * 
 * This function calculates various statistics about how colors are distributed
 * in the palette, which helps determine appropriate thresholds for color matching.
 */
export function analyzeColorDistribution(palette: string[]): ColorDistributionStats {
  if (palette.length < 2) {
    // Not enough colors to analyze
    return {
      averageColorDistance: 50,
      colorDistanceStdDev: 20,
      minColorDistance: 10,
      maxColorDistance: 100,
      colorDensity: 50,
      recommendedThreshold: 15,
      strictThreshold: 5,
    };
  }

  // Convert all colors to RGB arrays
  const rgbColors = palette.map(parseColorToRgb);

  // Calculate all pairwise distances
  const distances: number[] = [];
  for (let i = 0; i < rgbColors.length; i++) {
    for (let j = i + 1; j < rgbColors.length; j++) {
      const distance = calculateDeltaE(rgbColors[i], rgbColors[j]);
      if (isFinite(distance)) {
        distances.push(distance);
      }
    }
  }

  if (distances.length === 0) {
    // Fallback if no valid distances
    return {
      averageColorDistance: 50,
      colorDistanceStdDev: 20,
      minColorDistance: 10,
      maxColorDistance: 100,
      colorDensity: 50,
      recommendedThreshold: 15,
      strictThreshold: 5,
    };
  }

  // Sort distances for easier analysis
  distances.sort((a, b) => a - b);

  // Calculate statistics
  const minColorDistance = distances[0];
  const maxColorDistance = distances[distances.length - 1];
  const averageColorDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;

  // Calculate standard deviation
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - averageColorDistance, 2), 0) / distances.length;
  const colorDistanceStdDev = Math.sqrt(variance);

  // Calculate color density
  // Lower average distance = higher density (colors are similar)
  // Higher average distance = lower density (colors are diverse)
  const colorDensity = averageColorDistance;

  // Dynamic threshold calculation
  // Strategy:
  // 1. For high-density palettes (similar colors): use stricter thresholds
  // 2. For low-density palettes (diverse colors): use looser thresholds
  // 3. Consider the minimum distance to avoid false positives

  // Recommended threshold for general color mapping
  // Should be between minDistance and avgDistance
  let recommendedThreshold: number;
  
  if (averageColorDistance < 20) {
    // Very tight color distribution (e.g., subtle variations)
    // Use very strict threshold to avoid cross-contamination
    recommendedThreshold = Math.max(5, minColorDistance * 1.5);
  } else if (averageColorDistance < 40) {
    // Moderate color distribution
    // Use threshold around 25-40% of average distance
    recommendedThreshold = Math.max(8, averageColorDistance * 0.3);
  } else if (averageColorDistance < 60) {
    // Diverse color distribution
    // Use threshold around 20-30% of average distance
    recommendedThreshold = Math.max(12, averageColorDistance * 0.25);
  } else {
    // Very diverse colors
    // Use more conservative threshold
    recommendedThreshold = Math.max(15, averageColorDistance * 0.2);
  }

  // Ensure threshold doesn't exceed minimum distance (to avoid matching distinct colors)
  recommendedThreshold = Math.min(recommendedThreshold, minColorDistance * 0.8);

  // Clamp to reasonable range
  recommendedThreshold = Math.max(5, Math.min(30, recommendedThreshold));

  // Strict threshold for exact matching (used when user modifies a color)
  // This should be very small to only match nearly identical colors
  const strictThreshold = Math.max(3, Math.min(10, minColorDistance * 0.5));

  return {
    averageColorDistance,
    colorDistanceStdDev,
    minColorDistance,
    maxColorDistance,
    colorDensity,
    recommendedThreshold,
    strictThreshold,
  };
}

/**
 * Analyze color distribution directly from ImageData
 * 
 * This samples colors from the image to get a quick distribution analysis
 * without needing to generate a full palette first.
 */
export function analyzeImageColorDistribution(
  imageData: ImageData,
  sampleSize: number = 1000
): ColorDistributionStats {
  const { width, height, data } = imageData;
  const totalPixels = width * height;
  
  // Sample colors uniformly from the image
  const sampledColors: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(totalPixels / sampleSize));
  
  for (let i = 0; i < totalPixels; i += step) {
    const index = i * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    sampledColors.push([r, g, b]);
  }

  // Calculate pairwise distances between sampled colors
  const distances: number[] = [];
  const numSamples = Math.min(sampledColors.length, 100); // Limit for performance
  
  for (let i = 0; i < numSamples; i++) {
    for (let j = i + 1; j < numSamples; j++) {
      const distance = calculateDeltaE(sampledColors[i], sampledColors[j]);
      if (isFinite(distance)) {
        distances.push(distance);
      }
    }
  }

  if (distances.length === 0) {
    return {
      averageColorDistance: 50,
      colorDistanceStdDev: 20,
      minColorDistance: 10,
      maxColorDistance: 100,
      colorDensity: 50,
      recommendedThreshold: 15,
      strictThreshold: 5,
    };
  }

  distances.sort((a, b) => a - b);

  const minColorDistance = distances[0];
  const maxColorDistance = distances[distances.length - 1];
  const averageColorDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - averageColorDistance, 2), 0) / distances.length;
  const colorDistanceStdDev = Math.sqrt(variance);

  // Dynamic threshold based on image characteristics
  let recommendedThreshold: number;
  
  if (averageColorDistance < 30) {
    recommendedThreshold = Math.max(8, averageColorDistance * 0.4);
  } else if (averageColorDistance < 50) {
    recommendedThreshold = Math.max(12, averageColorDistance * 0.3);
  } else {
    recommendedThreshold = Math.max(15, averageColorDistance * 0.25);
  }

  recommendedThreshold = Math.max(8, Math.min(35, recommendedThreshold));
  const strictThreshold = Math.max(3, Math.min(12, minColorDistance * 0.6));

  return {
    averageColorDistance,
    colorDistanceStdDev,
    minColorDistance,
    maxColorDistance,
    colorDensity: averageColorDistance,
    recommendedThreshold,
    strictThreshold,
  };
}

/**
 * Get adaptive threshold based on the number of color mappings
 * 
 * When user has made many color modifications, we should be more conservative
 * to avoid unwanted color transformations.
 */
export function getAdaptiveThreshold(
  baseThreshold: number,
  numMappings: number,
  strategy: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
): number {
  const strategyMultipliers = {
    conservative: 0.6,  // Very strict - only map very similar colors
    moderate: 0.8,      // Balanced - map reasonably similar colors
    aggressive: 1.0,    // Loose - map more broadly
  };

  const multiplier = strategyMultipliers[strategy];

  // As user makes more modifications, be more conservative to avoid mistakes
  const mappingPenalty = Math.min(0.3, numMappings * 0.02); // Max 30% reduction
  
  const adaptiveThreshold = baseThreshold * multiplier * (1 - mappingPenalty);
  
  return Math.max(3, adaptiveThreshold); // Minimum threshold of 3
}