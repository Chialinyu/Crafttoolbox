/**
 * SEGMENT MEMORY SYSTEM
 * 
 * This module manages segment-based color modifications using spatial similarity.
 * Unlike color-to-color mapping, this tracks WHICH SPATIAL REGION was modified,
 * and maintains that modification across re-segmentation.
 * 
 * CHANGELOG:
 * 
 * [2026-01-16] Deduplication Integration
 * - Works seamlessly with MosaicGeneratorV2's new deduplication system
 * - applyModificationsToPalette() can now return duplicate colors
 * - MosaicGeneratorV2 handles deduplication after applying modifications
 * - Ensures user color changes persist through canvas resizing and color count changes
 * 
 * [Earlier] Core Features
 * - Spatial region tracking with IoU (Intersection over Union) similarity
 * - Normalized 100x100 mask comparison for aspect ratio independence
 * - Supports canvas size changes without losing user modifications
 */

export interface SegmentMask {
  // Binary mask of this segment (2D array of booleans)
  // mask[y][x] = true if pixel (x,y) belongs to this segment
  mask: boolean[][];
  width: number;
  height: number;
}

export interface SegmentModification {
  // The spatial mask of the original segment
  segmentMask: SegmentMask;
  
  // The original color of this segment (before user modification)
  originalColor: string; // "r,g,b"
  
  // The new color user chose
  modifiedColor: string; // "r,g,b"
  
  // Timestamp
  timestamp: number;
}

/**
 * Calculate Intersection over Union (IoU) between two segment masks
 * Higher value = more similar spatial distribution
 */
function calculateSegmentIoU(mask1: SegmentMask, mask2: SegmentMask): number {
  // 🔥 FIX: Normalize both masks to a standard size (100x100) 
  // while preserving their aspect ratios
  // This ensures accurate spatial comparison regardless of canvas size changes
  const STANDARD_SIZE = 100;
  
  const resized1 = resizeMaskPreserveAspect(mask1, STANDARD_SIZE);
  const resized2 = resizeMaskPreserveAspect(mask2, STANDARD_SIZE);
  
  // Both masks are now in the same coordinate space (100x100 max dimension)
  // We need to compare them in this shared space
  let intersection = 0;
  let union = 0;
  
  for (let y = 0; y < STANDARD_SIZE; y++) {
    for (let x = 0; x < STANDARD_SIZE; x++) {
      const a = resized1[y]?.[x] ?? false;
      const b = resized2[y]?.[x] ?? false;
      
      if (a && b) intersection++;
      if (a || b) union++;
    }
  }
  
  const iou = union === 0 ? 0 : intersection / union;
  
  return iou;
}

/**
 * Resize a segment mask to fit within maxSize x maxSize, preserving aspect ratio
 * The mask is centered in the output space with padding
 */
function resizeMaskPreserveAspect(mask: SegmentMask, maxSize: number): boolean[][] {
  const { mask: originalMask, width: origWidth, height: origHeight } = mask;
  
  // Calculate the scale factor to fit within maxSize x maxSize
  const scale = Math.min(maxSize / origWidth, maxSize / origHeight);
  
  // Calculate actual output dimensions (maintains aspect ratio)
  const scaledWidth = Math.round(origWidth * scale);
  const scaledHeight = Math.round(origHeight * scale);
  
  // Calculate offset to center the mask
  const offsetX = Math.floor((maxSize - scaledWidth) / 2);
  const offsetY = Math.floor((maxSize - scaledHeight) / 2);
  
  // Create output mask (initialized to false)
  const resized: boolean[][] = Array(maxSize).fill(null).map(() => Array(maxSize).fill(false));
  
  // Fill in the scaled mask with UNIFORM scaling
  for (let y = 0; y < scaledHeight; y++) {
    for (let x = 0; x < scaledWidth; x++) {
      // Map back to original coordinates using SAME scale for both X and Y
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      
      const value = originalMask[srcY]?.[srcX] ?? false;
      resized[offsetY + y][offsetX + x] = value;
    }
  }
  
  return resized;
}

/**
 * Create a segment mask from a color map
 * @param colorMap - 2D array where each value is a segment index
 * @param segmentIndex - Which segment to extract
 */
export function createSegmentMask(colorMap: number[][], segmentIndex: number): SegmentMask {
  const height = colorMap.length;
  const width = colorMap[0]?.length ?? 0;
  
  const mask: boolean[][] = [];
  
  for (let y = 0; y < height; y++) {
    mask[y] = [];
    for (let x = 0; x < width; x++) {
      mask[y][x] = colorMap[y][x] === segmentIndex;
    }
  }
  
  return { mask, width, height };
}

/**
 * Calculate the centroid (center of mass) of a segment
 * Used as a secondary metric for similarity
 */
function calculateCentroid(mask: SegmentMask): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.mask[y][x]) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  
  return count > 0 
    ? { x: sumX / count / mask.width, y: sumY / count / mask.height } 
    : { x: 0.5, y: 0.5 };
}

/**
 * Calculate the area (number of pixels) of a segment
 */
function calculateArea(mask: SegmentMask): number {
  let count = 0;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.mask[y][x]) count++;
    }
  }
  return count;
}

/**
 * Segment Memory - tracks spatial regions that user has modified
 */
export class SegmentMemory {
  private modifications: SegmentModification[] = [];
  
  /**
   * Record a segment modification
   * @param colorMap - Current color map
   * @param segmentIndex - Which segment was modified
   * @param originalColor - Original color before modification
   * @param newColor - New color after modification
   */
  recordModification(
    colorMap: number[][],
    segmentIndex: number,
    originalColor: string,
    newColor: string
  ): void {
    const segmentMask = createSegmentMask(colorMap, segmentIndex);
    
    // Check if we already have a modification for this EXACT segment index and spatial location
    // We need to check BOTH the original color AND the spatial similarity
    // This prevents different segments from being merged incorrectly
    const existingIndex = this.modifications.findIndex(mod => {
      const iou = calculateSegmentIoU(mod.segmentMask, segmentMask);
      const sameOriginalColor = mod.originalColor === originalColor;
      
      // Only treat as "same segment" if BOTH conditions are met:
      // 1. High spatial overlap (IoU > 0.9)
      // 2. Same original color
      return iou > 0.9 && sameOriginalColor;
    });
    
    if (existingIndex !== -1) {
      // Update existing modification (user changed the same segment again)
      this.modifications[existingIndex] = {
        segmentMask,
        originalColor,
        modifiedColor: newColor,
        timestamp: Date.now(),
      };
    } else {
      // Add new modification (new segment being modified)
      this.modifications.push({
        segmentMask,
        originalColor,
        modifiedColor: newColor,
        timestamp: Date.now(),
      });
    }
  }
  
  /**
   * Find the best matching segment from new segmentation
   * and return the color it should use
   * 
   * @param newColorMap - New color map after re-segmentation
   * @param newSegmentIndex - Segment index in the new color map
   * @returns Modified color if a good match is found, null otherwise
   */
  findMatchingModification(
    newColorMap: number[][],
    newSegmentIndex: number
  ): string | null {
    if (this.modifications.length === 0) return null;
    
    const newSegmentMask = createSegmentMask(newColorMap, newSegmentIndex);
    
    let bestMatch: SegmentModification | null = null;
    let bestIoU = 0;
    
    // Find the modification with highest spatial similarity
    for (let i = 0; i < this.modifications.length; i++) {
      const mod = this.modifications[i];
      const iou = calculateSegmentIoU(mod.segmentMask, newSegmentMask);
      
      if (iou > bestIoU) {
        bestIoU = iou;
        bestMatch = mod;
      }
    }
    
    // Only apply modification if IoU is significant
    // Threshold: 0.3 = at least 30% overlap
    if (bestIoU > 0.3 && bestMatch) {
      return bestMatch.modifiedColor;
    }
    
    return null;
  }
  
  /**
   * Apply all modifications to a new palette
   * 
   * This is called after re-segmentation to apply user's color choices
   * to the segments that best match the original modified segments.
   * 
   * @param newColorMap - New color map after re-segmentation
   * @param newPalette - New palette generated from re-segmentation
   * @returns Modified palette with user's color choices applied
   */
  applyModificationsToPalette(
    newColorMap: number[][],
    newPalette: string[]
  ): string[] {
    if (this.modifications.length === 0) {
      return newPalette;
    }
    
    const modifiedPalette = [...newPalette];
    const usedSegments = new Set<number>(); // Track which segments have been modified
    
    // 🔥 Iterate through MODIFICATIONS (not palette segments)
    // This ensures ALL user modifications are considered, even if palette is smaller
    for (let i = 0; i < this.modifications.length; i++) {
      const mod = this.modifications[i];
      
      // Find the best matching segment in the new color map
      let bestSegmentIndex = -1;
      let bestIoU = 0;
      
      for (let segmentIndex = 0; segmentIndex < newPalette.length; segmentIndex++) {
        // Skip segments that have already been modified by a better match
        // This prevents one segment from being overwritten by multiple modifications
        if (usedSegments.has(segmentIndex)) continue;
        
        const newSegmentMask = createSegmentMask(newColorMap, segmentIndex);
        const iou = calculateSegmentIoU(mod.segmentMask, newSegmentMask);
        
        if (iou > bestIoU) {
          bestIoU = iou;
          bestSegmentIndex = segmentIndex;
        }
      }
      
      // Apply modification if we found a good match
      // Threshold: 0.3 = at least 30% overlap
      if (bestIoU > 0.3 && bestSegmentIndex !== -1) {
        // Convert "r,g,b" to "rgb(r, g, b)" format
        const [r, g, b] = mod.modifiedColor.split(',').map(Number);
        const colorKey = `rgb(${r}, ${g}, ${b})`;
        modifiedPalette[bestSegmentIndex] = colorKey;
        usedSegments.add(bestSegmentIndex);
      }
    }
    
    return modifiedPalette;
  }
  
  /**
   * Get similarity metrics between a segment and all stored modifications
   * Useful for debugging
   */
  getSegmentSimilarities(
    colorMap: number[][],
    segmentIndex: number
  ): Array<{ modification: SegmentModification; iou: number; centroidDist: number }> {
    const segmentMask = createSegmentMask(colorMap, segmentIndex);
    const segmentCentroid = calculateCentroid(segmentMask);
    
    return this.modifications.map(mod => {
      const iou = calculateSegmentIoU(mod.segmentMask, segmentMask);
      const modCentroid = calculateCentroid(mod.segmentMask);
      const centroidDist = Math.sqrt(
        Math.pow(segmentCentroid.x - modCentroid.x, 2) +
        Math.pow(segmentCentroid.y - modCentroid.y, 2)
      );
      
      return { modification: mod, iou, centroidDist };
    });
  }
  
  /**
   * Clear all modifications
   */
  clear(): void {
    this.modifications = [];
  }
  
  /**
   * Remove modifications for a specific color that was merged/deleted
   * This should be called when colors are merged in the palette
   * 
   * @param deletedColorRgb - The RGB string of the color that was removed (e.g., "255,0,0")
   */
  removeModificationsForColor(deletedColorRgb: string): void {
    this.modifications = this.modifications.filter(
      mod => mod.originalColor !== deletedColorRgb && mod.modifiedColor !== deletedColorRgb
    );
  }
  
  /**
   * Get number of stored modifications
   */
  size(): number {
    return this.modifications.length;
  }
  
  /**
   * Export modifications
   */
  export(): SegmentModification[] {
    return this.modifications;
  }
  
  /**
   * Import modifications
   */
  import(modifications: SegmentModification[]): void {
    this.modifications = modifications;
  }
}