/**
 * Color merging utilities for vector tool
 * Handles merging multiple color groups into one
 */

import { CLUSTER_LABELS } from '../constants';

/**
 * Morandi color palette (must match cvProcessing.ts)
 */
const morandiPalette = [
  [168, 159, 145], // 0: Coffee
  [232, 180, 184], // 1: Pink
  [198, 219, 213], // 2: Mint
  [229, 206, 192], // 3: Beige
  [183, 196, 207], // 4: Blue-gray
  [208, 193, 201], // 5: Lavender
  [196, 186, 167], // 6: Warm gray
  [217, 206, 185], // 7: Sand
  [172, 184, 177], // 8: Sage
  [201, 179, 169], // 9: Taupe
];

/**
 * Result of color merging operation
 */
export interface ColorMergeResult {
  mergedImageData: ImageData;
  newColorCount: number;
  newLabels: Uint8Array; // 🎯 Sequential cluster labels (0, 1, 2, ...)
  clusterToMorandiMap: number[]; // 🎯 Mapping from cluster ID to Morandi palette index
}

/**
 * Merges multiple color groups into a single target color
 * @param imageData - Source image data with Morandi colors
 * @param targetColorIndices - Morandi palette indices (0-9) to merge
 * @returns Result containing merged image data and new color count
 */
export function mergeColorGroups(
  imageData: ImageData,
  targetColorIndices: number[]
): ColorMergeResult {
  if (targetColorIndices.length < 2) {
    throw new Error('At least 2 color groups required for merging');
  }
  
  // 🎯 Convert Morandi indices to actual RGB colors
  const selectedColors = targetColorIndices.map(idx => {
    const [r, g, b] = morandiPalette[idx];
    return { r, g, b, key: `${r},${g},${b}`, index: idx };
  });
  
  // 🎯 Count pixels for each selected color to find the largest
  const data = imageData.data;
  const colorCounts = new Map<string, number>();
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    // Skip transparent pixels
    if (a < 128) continue;
    
    const key = `${r},${g},${b}`;
    
    // Only count selected colors
    if (selectedColors.some(c => c.key === key)) {
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }
  
  // 🎯 Find the largest selected color (target for merge)
  let targetColor = selectedColors[0];
  let maxCount = 0;
  
  for (const color of selectedColors) {
    const count = colorCounts.get(color.key) || 0;
    if (count > maxCount) {
      maxCount = count;
      targetColor = color;
    }
  }
  
  const targetR = targetColor.r;
  const targetG = targetColor.g;
  const targetB = targetColor.b;
  
  // 🎯 Get keys of colors to merge (excluding the target)
  const keysToMerge = selectedColors
    .filter(c => c.key !== targetColor.key)
    .map(c => c.key);
  
  // Create new ImageData with merged colors
  const newData = new Uint8ClampedArray(imageData.data);
  const newImageData = new ImageData(
    newData,
    imageData.width,
    imageData.height
  );
  
  // Replace pixels of smaller groups with target color
  for (let i = 0; i < newData.length; i += 4) {
    const r = newData[i];
    const g = newData[i + 1];
    const b = newData[i + 2];
    const a = newData[i + 3];
    
    // Skip transparent pixels
    if (a < 128) continue;
    
    const key = `${r},${g},${b}`;
    
    if (keysToMerge.includes(key)) {
      newData[i] = targetR;
      newData[i + 1] = targetG;
      newData[i + 2] = targetB;
    }
  }
  
  // 🎯 Count unique Morandi colors after merge (skip white/transparent)
  const remainingColors = new Set<string>();
  const remainingColorIndices: number[] = []; // Track which Morandi palette indices are used
  
  for (let i = 0; i < newData.length; i += 4) {
    const r = newData[i];
    const g = newData[i + 1];
    const b = newData[i + 2];
    const a = newData[i + 3];
    
    // Skip transparent or white background
    if (a < 128 || (r > 250 && g > 250 && b > 250)) {
      continue;
    }
    
    const key = `${r},${g},${b}`;
    
    // Only count Morandi colors and track their indices
    for (let paletteIdx = 0; paletteIdx < morandiPalette.length; paletteIdx++) {
      const [pr, pg, pb] = morandiPalette[paletteIdx];
      if (pr === r && pg === g && pb === b) {
        if (!remainingColors.has(key)) {
          remainingColors.add(key);
          remainingColorIndices.push(paletteIdx);
        }
        break;
      }
    }
  }
  
  // 🎯 Create mapping from Morandi palette index to sequential cluster ID
  // Example: Morandi indices [0, 3, 4] → cluster IDs [0, 1, 2]
  const morandiToClusterMap = new Map<number, number>();
  remainingColorIndices.forEach((morandiIdx, sequentialIdx) => {
    morandiToClusterMap.set(morandiIdx, sequentialIdx);
  });
  
  // 🎯 Generate new labels with SEQUENTIAL cluster IDs (0, 1, 2, ...)
  const totalPixels = imageData.width * imageData.height;
  const newLabels = new Uint8Array(totalPixels);
  let pixelIdx = 0;
  
  for (let i = 0; i < newData.length; i += 4) {
    const r = newData[i];
    const g = newData[i + 1];
    const b = newData[i + 2];
    const a = newData[i + 3];
    
    // 🎯 Mark transparent pixels with special label
    if (a < 128) {
      newLabels[pixelIdx] = CLUSTER_LABELS.TRANSPARENT;
      pixelIdx++;
      continue;
    }
    
    // 🎯 Find Morandi palette index, then map to sequential cluster ID
    let clusterId = CLUSTER_LABELS.TRANSPARENT; // Default to transparent
    for (let paletteIdx = 0; paletteIdx < morandiPalette.length; paletteIdx++) {
      const [pr, pg, pb] = morandiPalette[paletteIdx];
      if (pr === r && pg === g && pb === b) {
        // Map from Morandi index to sequential cluster ID
        clusterId = morandiToClusterMap.get(paletteIdx) ?? CLUSTER_LABELS.TRANSPARENT;
        break;
      }
    }
    
    newLabels[pixelIdx] = clusterId;
    pixelIdx++;
  }
  
  // 🎯 Create mapping from cluster ID to Morandi palette index
  const clusterToMorandiMap: number[] = [];
  remainingColorIndices.forEach((morandiIdx, clusterIdx) => {
    clusterToMorandiMap[clusterIdx] = morandiIdx;
  });
  
  return {
    mergedImageData: newImageData,
    newColorCount: remainingColors.size,
    newLabels: newLabels,
    clusterToMorandiMap: clusterToMorandiMap,
  };
}