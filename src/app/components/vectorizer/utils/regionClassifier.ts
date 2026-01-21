/**
 * Region Classifier for Mixed Mode
 * 
 * Analyzes connected regions and classifies them as either:
 * - LINE: Thin, elongated regions suitable for stroke rendering
 * - FILL: Thick, blob-like regions suitable for fill rendering
 */

import { zhangSuenThinning } from './skeletonization';

export type RegionType = 'line' | 'fill';

export interface RegionInfo {
  id: number;
  type: RegionType;
  pixels: number[]; // Pixel indices belonging to this region
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  area: number;
  perimeter: number;
}

/**
 * Calculate shape features to classify region type
 */
function analyzeRegionFeatures(
  pixels: number[],
  width: number,
  height: number,
  binary: Uint8Array
): {
  aspectRatio: number;
  skeletonDensity: number;
  perimeterAreaRatio: number;
  isLine: boolean;
} {
  if (pixels.length === 0) {
    return { aspectRatio: 1, skeletonDensity: 0, perimeterAreaRatio: 0, isLine: false };
  }

  // Calculate bounding box
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (const idx of pixels) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  // 1. Aspect Ratio (how elongated is the region)
  const regionWidth = maxX - minX + 1;
  const regionHeight = maxY - minY + 1;
  const aspectRatio = Math.max(regionWidth, regionHeight) / Math.min(regionWidth, regionHeight);

  // 2. 🚀 OPTIMIZED: Skip expensive skeletonization, use simple heuristics
  // Calculate average thickness by dividing area by bounding box perimeter
  const bboxPerimeter = 2 * (regionWidth + regionHeight);
  const avgThickness = (pixels.length / bboxPerimeter) || 1;
  const skeletonDensity = 1 / avgThickness; // Inverse of thickness

  // 3. Perimeter/Area Ratio (higher for thin regions)
  // Estimate perimeter by counting boundary pixels
  let perimeterPixels = 0;
  for (const idx of pixels) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    // Check 4-neighbors
    const neighbors = [
      y > 0 ? binary[(y - 1) * width + x] : 0,
      y < height - 1 ? binary[(y + 1) * width + x] : 0,
      x > 0 ? binary[y * width + (x - 1)] : 0,
      x < width - 1 ? binary[y * width + (x + 1)] : 0,
    ];
    
    // If any neighbor is background, this is a boundary pixel
    if (neighbors.some(n => n === 0)) {
      perimeterPixels++;
    }
  }
  const perimeterAreaRatio = perimeterPixels / pixels.length;

  // Decision: Classify as line if it meets threshold criteria
  // 🎯 RELAXED THRESHOLDS for better detection
  const isLine = (
    (aspectRatio > 1.8 && avgThickness < 15) ||  // 🔧 更宽松: 稍微细长 + 稍薄
    perimeterAreaRatio > 0.5 || // 🔧 降低周长比阈值
    (aspectRatio > 3.0) || // 🔧 降低长宽比要求
    (avgThickness < 5) // 🔧 新增: 非常细的区域直接判定为线
  ) && pixels.length > 20 && pixels.length < 50000; // 🔧 增加最大面积限制

  return { aspectRatio, skeletonDensity, perimeterAreaRatio, isLine };
}

/**
 * Label connected components using flood-fill
 */
function labelConnectedComponents(
  binary: Uint8Array,
  width: number,
  height: number
): { labels: Uint8Array; componentCount: number; components: Map<number, number[]> } {
  const labels = new Uint8Array(width * height);
  const components = new Map<number, number[]>();
  let currentLabel = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      // Skip if already labeled or is background
      if (labels[idx] !== 0 || binary[idx] === 0) continue;

      // Flood fill from this pixel
      const stack: number[] = [idx];
      const componentPixels: number[] = [];
      labels[idx] = currentLabel;

      while (stack.length > 0) {
        const current = stack.pop()!;
        componentPixels.push(current);

        const cx = current % width;
        const cy = Math.floor(current / width);

        // Check 8-neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;

            const nx = cx + dx;
            const ny = cy + dy;

            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

            const nIdx = ny * width + nx;
            if (binary[nIdx] === 255 && labels[nIdx] === 0) {
              labels[nIdx] = currentLabel;
              stack.push(nIdx);
            }
          }
        }
      }

      components.set(currentLabel, componentPixels);
      currentLabel++;
    }
  }

  return { labels, componentCount: currentLabel - 1, components };
}

/**
 * Classify all connected regions in a binary image
 * Returns a map where each region is marked as 'line' or 'fill'
 */
export function classifyRegions(
  binary: Uint8Array,
  width: number,
  height: number
): {
  regionTypes: Map<number, RegionType>;
  regionInfo: Map<number, RegionInfo>;
  labels: Uint8Array;
} {
  // Step 1: Label connected components
  const { labels, componentCount, components } = labelConnectedComponents(binary, width, height);

  const regionTypes = new Map<number, RegionType>();
  const regionInfo = new Map<number, RegionInfo>();

  // Step 2: Analyze each component
  for (let regionId = 1; regionId <= componentCount; regionId++) {
    const pixels = components.get(regionId);
    if (!pixels || pixels.length === 0) continue;

    // Skip very small regions (noise)
    if (pixels.length < 10) {
      regionTypes.set(regionId, 'fill'); // Treat noise as fill
      continue;
    }

    // Analyze features
    const features = analyzeRegionFeatures(pixels, width, height, binary);
    const type: RegionType = features.isLine ? 'line' : 'fill';
    regionTypes.set(regionId, type);

    // Calculate bounding box
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (const idx of pixels) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    // Estimate perimeter
    let perimeterPixels = 0;
    for (const idx of pixels) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      
      const neighbors = [
        y > 0 ? binary[(y - 1) * width + x] : 0,
        y < height - 1 ? binary[(y + 1) * width + x] : 0,
        x > 0 ? binary[y * width + (x - 1)] : 0,
        x < width - 1 ? binary[y * width + (x + 1)] : 0,
      ];
      
      if (neighbors.some(n => n === 0)) {
        perimeterPixels++;
      }
    }

    regionInfo.set(regionId, {
      id: regionId,
      type,
      pixels,
      bbox: { minX, maxX, minY, maxY },
      area: pixels.length,
      perimeter: perimeterPixels,
    });
  }

  return { regionTypes, regionInfo, labels };
}

/**
 * Create a visualization of classified regions
 * - Line regions: Black strokes (skeleton)
 * - Fill regions: Colored fills
 */
export function visualizeClassifiedRegions(
  regionTypes: Map<number, RegionType>,
  labels: Uint8Array,
  width: number,
  height: number,
  morandiColors: number[][]
): ImageData {
  const output = new ImageData(width, height);
  
  // First pass: Render ALL regions
  for (let i = 0; i < width * height; i++) {
    const regionId = labels[i];
    if (regionId === 0) {
      // Background - transparent
      output.data[i * 4] = 255;
      output.data[i * 4 + 1] = 255;
      output.data[i * 4 + 2] = 255;
      output.data[i * 4 + 3] = 0;
      continue;
    }

    const type = regionTypes.get(regionId);
    
    if (type === 'fill') {
      // Use Morandi colors for fill regions
      const color = morandiColors[regionId % morandiColors.length];
      output.data[i * 4] = color[0];
      output.data[i * 4 + 1] = color[1];
      output.data[i * 4 + 2] = color[2];
      output.data[i * 4 + 3] = 255;
    } else if (type === 'line') {
      // 🎯 IMPROVED: Render entire line region as black
      output.data[i * 4] = 0;
      output.data[i * 4 + 1] = 0;
      output.data[i * 4 + 2] = 0;
      output.data[i * 4 + 3] = 255;
    }
  }

  return output;
}