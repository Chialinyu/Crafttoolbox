/**
 * ============================================================================
 * CV PROCESSING - Computer Vision & Image Preprocessing
 * ============================================================================
 * 
 * OVERVIEW:
 * Handles image preprocessing, K-means clustering, and color extraction
 * for the vectorization pipeline.
 * 
 * KEY FEATURES:
 * ✅ K-means Clustering (color quantization)
 * ✅ Sequential Label System (0, 1, 2, ... n-1)
 * ✅ ColorMap Index Mapping (preserves color assignments)
 * ✅ Morandi Color Palette (10 aesthetic colors)
 * ✅ Gaussian Blur & Edge Detection
 * ✅ Threshold & Binary conversion
 * ✅ Region Classification & Visualization
 * 
 * WORKFLOW:
 * 1. Load Image → ImageData
 * 2. K-means Clustering → Sequential Labels (0, 1, 2, ...)
 * 3. ColorMap Mapping → Stable color assignments
 * 4. Render Preview → Morandi palette colors
 * 5. Pass to Vectorizer → Each cluster becomes vector paths
 * 
 * CRITICAL SYSTEM: ColorMap Index Mapping
 * - Problem: Cluster IDs can change when parameters change
 * - Solution: Store colorIndex mapping for each cluster
 * - Result: Colors stay consistent across parameter changes
 * 
 * LABEL SYSTEM:
 * - Labels stored as Uint8Array (memory efficient)
 * - Values: 0 to (colorCount-1) for clusters, 255 for transparent
 * - Size: width × height pixels
 * - Storage: Cached in React state for fast access
 * ============================================================================
 */

import chroma from 'chroma-js';
import { CLUSTER_LABELS } from '../constants';
import { evaluateSkeletonQuality } from './skeletonGraph';

/**
 * Convert image to grayscale
 */
export function toGrayscale(imageData: ImageData): ImageData {
  const data = imageData.data;
  const grayscale = new ImageData(imageData.width, imageData.height);
  
  for (let i = 0; i < data.length; i += 4) {
    // Use luminosity method: 0.299R + 0.587G + 0.114B
    const gray = Math.round(
      data[i] * 0.299 + 
      data[i + 1] * 0.587 + 
      data[i + 2] * 0.114
    );
    
    grayscale.data[i] = gray;
    grayscale.data[i + 1] = gray;
    grayscale.data[i + 2] = gray;
    grayscale.data[i + 3] = data[i + 3]; // Keep alpha
  }
  
  return grayscale;
}

/**
 * Apply Gaussian blur for noise reduction
 */
export function gaussianBlur(imageData: ImageData, radius: number = 2): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const blurred = new ImageData(width, height);
  
  // Generate Gaussian kernel
  const size = radius * 2 + 1;
  const kernel: number[] = [];
  const sigma = radius / 3;
  let sum = 0;
  
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      kernel.push(value);
      sum += value;
    }
  }
  
  // Normalize kernel
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }
  
  // Apply convolution
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      let ki = 0;
      
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;
          
          r += data[idx] * kernel[ki];
          g += data[idx + 1] * kernel[ki];
          b += data[idx + 2] * kernel[ki];
          ki++;
        }
      }
      
      const idx = (y * width + x) * 4;
      blurred.data[idx] = Math.round(r);
      blurred.data[idx + 1] = Math.round(g);
      blurred.data[idx + 2] = Math.round(b);
      blurred.data[idx + 3] = data[idx + 3]; // Keep alpha
    }
  }
  
  return blurred;
}

/**
 * Calculate optimal threshold using Otsu's method
 * This is one of the most popular automatic threshold selection methods
 */
export function calculateOptimalThreshold(imageData: ImageData): number {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  const totalPixels = imageData.width * imageData.height;
  
  // Build histogram (use R channel, assuming grayscale)
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }
  
  // Otsu's method
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }
  
  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 0;
  
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    
    wF = totalPixels - wB;
    if (wF === 0) break;
    
    sumB += t * histogram[t];
    
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    
    const variance = wB * wF * (mB - mF) * (mB - mF);
    
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  
  return threshold;
}

/**
 * 🆕 Calculate suggested detail level based on image complexity
 * Analyzes edge density to recommend appropriate detail preservation level
 * 
 * @returns Suggested detail level (0-100)
 *   - Simple images (low edge density) → Lower detail level (faster, cleaner)
 *   - Complex images (high edge density) → Higher detail level (preserve details)
 */
export function calculateSuggestedDetailLevel(imageData: ImageData): number {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // Convert to grayscale and calculate edge density using Sobel
  let edgeCount = 0;
  const threshold = 30; // Edge detection threshold
  
  // Sample every 4th pixel for performance (still representative)
  const step = 4;
  
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const idx = (y * width + x) * 4;
      
      // Get pixel intensity (grayscale)
      const intensity = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      
      // Sobel X
      const rightIdx = (y * width + (x + step)) * 4;
      const leftIdx = (y * width + (x - step)) * 4;
      const rightIntensity = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;
      const leftIntensity = (data[leftIdx] + data[leftIdx + 1] + data[leftIdx + 2]) / 3;
      const gx = rightIntensity - leftIntensity;
      
      // Sobel Y
      const topIdx = ((y - step) * width + x) * 4;
      const bottomIdx = ((y + step) * width + x) * 4;
      const topIntensity = (data[topIdx] + data[topIdx + 1] + data[topIdx + 2]) / 3;
      const bottomIntensity = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;
      const gy = bottomIntensity - topIntensity;
      
      // Edge magnitude
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      
      if (magnitude > threshold) {
        edgeCount++;
      }
    }
  }
  
  // Calculate edge density (edges per 1000 sampled pixels)
  const sampledPixels = Math.floor((width / step) * (height / step));
  const edgeDensity = (edgeCount / sampledPixels) * 1000;
  
  // Map edge density to detail level (0-100)
  // Low density (< 50 edges/1000px) → 30-50 detail level
  // Medium density (50-150) → 50-70 detail level
  // High density (> 150) → 70-90 detail level
  let suggestedLevel: number;
  
  if (edgeDensity < 50) {
    // Simple image: low detail level
    suggestedLevel = 30 + (edgeDensity / 50) * 20; // 30-50
  } else if (edgeDensity < 150) {
    // Medium complexity: moderate detail level
    suggestedLevel = 50 + ((edgeDensity - 50) / 100) * 20; // 50-70
  } else {
    // Complex image: high detail level
    suggestedLevel = 70 + Math.min((edgeDensity - 150) / 200, 1) * 20; // 70-90
  }
  
  // Round to nearest 5
  return Math.round(suggestedLevel / 5) * 5;
}

/**
 * Apply threshold to create binary image
 */
export function binarize(imageData: ImageData, threshold: number): ImageData {
  const data = imageData.data;
  const binary = new ImageData(imageData.width, imageData.height);
  
  for (let i = 0; i < data.length; i += 4) {
    // Use R channel (assume grayscale)
    const value = data[i] > threshold ? 255 : 0;
    
    binary.data[i] = value;
    binary.data[i + 1] = value;
    binary.data[i + 2] = value;
    binary.data[i + 3] = 255; // Full opacity
  }
  
  return binary;
}

/**
 * Detect edges using Sobel operator
 */
export function detectEdges(imageData: ImageData): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const edges = new ImageData(width, height);
  
  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  // Apply Sobel operator
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      let ki = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const pixel = data[idx]; // Use R channel (assume grayscale)
          
          gx += pixel * sobelX[ki];
          gy += pixel * sobelY[ki];
          ki++;
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const value = Math.min(255, magnitude);
      
      const idx = (y * width + x) * 4;
      edges.data[idx] = value;
      edges.data[idx + 1] = value;
      edges.data[idx + 2] = value;
      edges.data[idx + 3] = 255;
    }
  }
  
  return edges;
}

/**
 * Complete preprocessing pipeline
 */
export interface PreprocessConfig {
  blurRadius: number;
  threshold: number;
  useAutoThreshold: boolean;
  colorCount?: number; // For fill/mixed and color-outline clustering
  mode?: 'line' | 'fill' | 'mixed';
  lineStyle?: 'skeleton' | 'color-outline';
}

/**
 * Perceptual CIELAB k-means++ clustering for multi-color vectorization.
 * Centroids are fitted on a representative sample, then every full-resolution
 * pixel is assigned once. The external labels/RGB-centroid contract is unchanged.
 */
function kMeansColorClustering(imageData: ImageData, k: number): { labels: Uint8Array; colors: number[][] } {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  type Lab = [number, number, number];
  const toLab = (r: number, g: number, b: number): Lab => {
    const lab = chroma.rgb(r, g, b).lab();
    return [lab[0], lab[1], lab[2]];
  };
  const labDistanceSquared = (a: Lab, b: Lab) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // Seeded random number generator for consistent results
  let seed = 12345; // Fixed seed for reproducibility
  const seededRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  
  // Optimization 1: Downsample image for clustering (max 300px on longest side)
  const maxDimension = Math.max(width, height);
  const scale = Math.min(1, 300 / maxDimension);
  const sampledWidth = Math.round(width * scale);
  const sampledHeight = Math.round(height * scale);
  
  // Sample visible pixels in perceptual Lab space for clustering
  const pixels: Lab[] = [];
  for (let y = 0; y < sampledHeight; y++) {
    for (let x = 0; x < sampledWidth; x++) {
      const srcX = Math.min(width - 1, Math.round(x / scale));
      const srcY = Math.min(height - 1, Math.round(y / scale));
      const idx = (srcY * width + srcX) * 4;
      
      if (data[idx + 3] > 128) { // Only visible pixels
        pixels.push(toLab(data[idx], data[idx + 1], data[idx + 2]));
      }
    }
  }
  
  if (pixels.length === 0) {
    return { labels: new Uint8Array(width * height), colors: [] };
  }
  
  const clusterCount = Math.min(k, pixels.length);

  // Initialize Lab centroids with k-means++ (using seeded random)
  const centroids: Lab[] = [];
  const firstIdx = Math.floor(seededRandom() * pixels.length);
  centroids.push([...pixels[firstIdx]]);
  
  for (let i = 1; i < clusterCount; i++) {
    const distances = pixels.map(pixel => {
      return Math.min(...centroids.map(c => labDistanceSquared(pixel, c)));
    });
    
    const sum = distances.reduce((a, b) => a + b, 0);
    if (sum <= 0) break;
    let target = seededRandom() * sum;
    
    for (let j = 0; j < distances.length; j++) {
      target -= distances[j];
      if (target <= 0) {
        centroids.push([...pixels[j]]);
        break;
      }
    }
  }
  
  // Fit centroids on the representative sample in Lab.
  const maxIterations = 12;
  const sampleLabels = new Uint8Array(pixels.length);
  for (let iter = 0; iter < maxIterations; iter++) {
    const oldCentroids = centroids.map(c => [...c]);

    for (let i = 0; i < pixels.length; i++) {
      let bestCluster = 0;
      let minDistance = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const distance = labDistanceSquared(pixels[i], centroids[c]);
        if (distance < minDistance) {
          minDistance = distance;
          bestCluster = c;
        }
      }
      sampleLabels[i] = bestCluster;
    }
    
    const sums: Lab[] = centroids.map(() => [0, 0, 0]);
    const counts = new Uint32Array(centroids.length);
    for (let i = 0; i < pixels.length; i++) {
      const cluster = sampleLabels[i];
      sums[cluster][0] += pixels[i][0];
      sums[cluster][1] += pixels[i][1];
      sums[cluster][2] += pixels[i][2];
      counts[cluster]++;
    }
    
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] > 0) {
        centroids[c] = [
          sums[c][0] / counts[c],
          sums[c][1] / counts[c],
          sums[c][2] / counts[c],
        ];
      }
    }
    
    let maxChange = 0;
    for (let c = 0; c < centroids.length; c++) {
      const change = Math.sqrt(labDistanceSquared(centroids[c], oldCentroids[c] as Lab));
      maxChange = Math.max(maxChange, change);
    }
    
    if (maxChange < 0.5) break;
  }

  // Assign full-resolution pixels once using the fitted Lab centroids.
  const labels = new Uint8Array(width * height);
  labels.fill(CLUSTER_LABELS.TRANSPARENT);
  for (let pixelIdx = 0; pixelIdx < width * height; pixelIdx++) {
    const offset = pixelIdx * 4;
    if (data[offset + 3] <= 128) continue;

    const pixelLab = toLab(data[offset], data[offset + 1], data[offset + 2]);
    let bestCluster = 0;
    let minDistance = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const distance = labDistanceSquared(pixelLab, centroids[c]);
      if (distance < minDistance) {
        minDistance = distance;
        bestCluster = c;
      }
    }
    labels[pixelIdx] = bestCluster;
  }
  
  // Sort clusters by pixel count (largest first) to maintain color consistency
  const clusterCounts = new Array(centroids.length).fill(0);
  for (let i = 0; i < labels.length; i++) {
    // 🎯 Only count real clusters, skip transparent pixels (label = 255)
    if (labels[i] < centroids.length) {
      clusterCounts[labels[i]]++;
    }
  }
  
  // Create mapping from old cluster index to new sorted index
  const sortedIndices = clusterCounts
    .map((count, idx) => ({ count, idx }))
    .sort((a, b) => b.count - a.count)
    .map(item => item.idx);
  
  const indexMapping = new Map<number, number>();
  sortedIndices.forEach((oldIdx, newIdx) => {
    indexMapping.set(oldIdx, newIdx);
  });
  
  // Remap labels to sorted order
  const sortedLabels = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i++) {
    // 🎯 Preserve transparent pixel label (255), only remap real clusters
    if (labels[i] === 255) {
      sortedLabels[i] = 255;
    } else {
      sortedLabels[i] = indexMapping.get(labels[i]) || 0;
    }
  }
  
  // Remap centroids to sorted order
  const sortedCentroids = sortedIndices.map(idx => {
    const rgb = chroma.lab(...centroids[idx]).rgb();
    return rgb.map(value => Math.max(0, Math.min(255, Math.round(value))));
  });
  
  return { labels: sortedLabels, colors: sortedCentroids };
}

/**
 * Morandi color palette for cluster visualization
 * Ordered by visual prominence: darker/neutral colors first
 */
const morandiPalette = [
  [168, 159, 145], // #A89F91 - Coffee (占比最大)
  [232, 180, 184], // #E8B4B8 - Pink
  [198, 219, 213], // #C6DBD5 - Mint
  [229, 206, 192], // #E5CEC0 - Beige
  [183, 196, 207], // #B7C4CF - Blue-gray
  [208, 193, 201], // #D0C1C9 - Lavender
  [196, 186, 167], // #C4BAA7 - Warm gray
  [217, 206, 185], // #D9CEB9 - Sand
  [172, 184, 177], // #ACB8B1 - Sage
  [201, 179, 169], // #C9B3A9 - Taupe
];

function renderClusterPreview(
  source: ImageData,
  labels: Uint8Array,
  clusterCount: number,
  style: 'fill' | 'outline' | 'fill-outline'
): ImageData {
  const { width, height } = source;
  const output = new ImageData(width, height);

  for (let index = 0; index < labels.length; index++) {
    const offset = index * 4;
    const cluster = labels[index];
    if (cluster >= clusterCount || source.data[offset + 3] <= 128) continue;

    const x = index % width;
    const y = Math.floor(index / width);
    const isBoundary =
      x === 0 ||
      y === 0 ||
      x === width - 1 ||
      y === height - 1 ||
      labels[index - 1] !== cluster ||
      labels[index + 1] !== cluster ||
      labels[index - width] !== cluster ||
      labels[index + width] !== cluster;

    if (style !== 'fill' && isBoundary) {
      output.data[offset] = 0;
      output.data[offset + 1] = 0;
      output.data[offset + 2] = 0;
      output.data[offset + 3] = 255;
    } else if (style !== 'outline') {
      const color = morandiPalette[cluster % morandiPalette.length];
      output.data[offset] = color[0];
      output.data[offset + 1] = color[1];
      output.data[offset + 2] = color[2];
      output.data[offset + 3] = 255;
    } else {
      output.data[offset] = 255;
      output.data[offset + 1] = 255;
      output.data[offset + 2] = 255;
      output.data[offset + 3] = 255;
    }
  }

  return output;
}

/**
 * Preprocessing result with optional cluster information
 */
export interface PreprocessResult {
  imageData: ImageData;
  labels?: Uint8Array; // Cluster ID for each pixel (for fill/mixed mode)
  clusterCount?: number; // Number of clusters (for fill/mixed mode)
}

export function preprocessImage(
  imageData: ImageData, 
  config: PreprocessConfig
): PreprocessResult {
  const mode = config.mode || 'line';
  
  // ========================================
  // 🎨 Mixed Mode: Color clustering + region classification
  // ========================================
  if (mode === 'mixed' && config.colorCount && config.colorCount > 1) {
    // Step 1: Apply blur for noise reduction
    let processed = imageData;
    if (config.blurRadius > 0) {
      processed = gaussianBlur(processed, config.blurRadius);
    }
    
    // Step 2: 🎯 Use COLOR CLUSTERING instead of binarization
    const { labels } = kMeansColorClustering(processed, config.colorCount);
    
    // Mixed mode is explicitly filled regions plus their outlines.
    const output = renderClusterPreview(processed, labels, config.colorCount, 'fill-outline');
    
    return {
      imageData: output,
      labels: labels,
      clusterCount: config.colorCount,
    };
  }
  
  // ========================================
  // 🖊️ Line Mode: Simple binarization (no region classification)
  // ========================================
  if (mode === 'line') {
    // Apply blur
    let processed = imageData;
    if (config.blurRadius > 0) {
      processed = gaussianBlur(processed, config.blurRadius);
    }

    if (config.lineStyle === 'color-outline' && config.colorCount && config.colorCount > 1) {
      const { labels } = kMeansColorClustering(processed, config.colorCount);
      return {
        imageData: renderClusterPreview(processed, labels, config.colorCount, 'outline'),
        labels,
        clusterCount: config.colorCount,
      };
    }
    
    // Convert to grayscale
    processed = toGrayscale(processed);
    
    // Binarize with threshold
    const threshold = config.threshold;
    processed = binarize(processed, threshold);
    
    // Step 4: Extract binary data for polarity detection
    const { width, height, data } = processed;
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const pixelIdx = i * 4;
      binary[i] = data[pixelIdx] < 128 ? 255 : 0; // Black pixels = 255
    }
    
    // Step 5: Auto-detect polarity
    const binaryInverted = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      binaryInverted[i] = binary[i] === 255 ? 0 : 255;
    }
    
    const scoreOriginal = evaluateSkeletonQuality(binary, width, height);
    const scoreInverted = evaluateSkeletonQuality(binaryInverted, width, height);
    
    // If inverted is better, flip the ImageData
    if (scoreInverted > scoreOriginal) {
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i];
        const inverted = 255 - value;
        data[i] = inverted;
        data[i + 1] = inverted;
        data[i + 2] = inverted;
        // Alpha stays the same
      }
    }
    
    // 🎯 Line mode returns simple binary image (no labels)
    return {
      imageData: processed,
    };
  }
  
  // For fill/mixed mode with color clustering
  if ((mode === 'fill') && config.colorCount && config.colorCount > 1) {
    // Step 1: Apply blur for noise reduction
    let processed = imageData;
    if (config.blurRadius > 0) {
      processed = gaussianBlur(processed, config.blurRadius);
    }
    
    // Step 2: Color clustering
    const { labels } = kMeansColorClustering(processed, config.colorCount);
    
    // Step 3: Create output with Morandi colors for visualization
    const output = new ImageData(imageData.width, imageData.height);
    let pixelIdx = 0;
    
    for (let i = 0; i < processed.data.length; i += 4) {
      const cluster = labels[pixelIdx];
      
      // 🎯 Only render pixels with real cluster labels (0 to colorCount-1)
      // Skip transparent pixels (label = 255)
      if (cluster < config.colorCount && processed.data[i + 3] > 128) {
        const color = morandiPalette[cluster % morandiPalette.length];
        output.data[i] = color[0];
        output.data[i + 1] = color[1];
        output.data[i + 2] = color[2];
        output.data[i + 3] = 255;
      } else {
        // Transparent background
        output.data[i] = 255;
        output.data[i + 1] = 255;
        output.data[i + 2] = 255;
        output.data[i + 3] = 0;
      }
      pixelIdx++;
    }
    
    // 🎯 Return both the visualized image AND the cluster labels
    return {
      imageData: output,
      labels: labels,
      clusterCount: config.colorCount,
    };
  }
  
  // Fallback path (e.g. mixed without clustering) — grayscale + binarize
  // Step 1: Convert to grayscale
  let processed = toGrayscale(imageData);
  
  // Step 2: Apply blur for noise reduction
  if (config.blurRadius > 0) {
    processed = gaussianBlur(processed, config.blurRadius);
  }
  
  // Step 3: Use the threshold value directly (caller should handle auto calculation)
  const threshold = config.threshold;
  
  // Step 4: Binarize
  processed = binarize(processed, threshold);
  
  // Step 5: AUTO-DETECT and invert if needed
  {
    const { width, height, data } = processed;
    
    // Extract binary data for evaluation
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const pixelIdx = i * 4;
      binary[i] = data[pixelIdx] < 128 ? 255 : 0; // Black pixels = 255
    }
    
    // Test both polarities
    const binaryInverted = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      binaryInverted[i] = binary[i] === 255 ? 0 : 255;
    }
    
    const scoreOriginal = evaluateSkeletonQuality(binary, width, height);
    const scoreInverted = evaluateSkeletonQuality(binaryInverted, width, height);
    
    // If inverted is better, flip the ImageData
    if (scoreInverted > scoreOriginal) {
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i];
        const inverted = 255 - value;
        data[i] = inverted;
        data[i + 1] = inverted;
        data[i + 2] = inverted;
        // Alpha stays the same
      }
    }
  }
  
  return {
    imageData: processed,
  };
}

/**
 * Extract color information from image after K-means clustering
 * Returns colors with pixel counts and percentages
 * 🎯 Returns colors in FIXED Morandi palette order (index 0-9)
 * This ensures color index matches cluster ID for hover preview
 */
export function extractColorInfo(imageData: ImageData): Array<{
  color: [number, number, number];
  pixelCount: number;
  percentage: number;
}> {
  const colorMap = new Map<string, number>();
  const data = imageData.data;
  let totalNonWhitePixels = 0;
  
  // Count pixels for each color, ignoring white/transparent background
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    // Skip transparent or white pixels (background)
    if (a < 128 || (r > 250 && g > 250 && b > 250)) {
      continue;
    }
    
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
    totalNonWhitePixels++;
  }
  
  // 🎯 Return colors in FIXED Morandi palette order
  // Each Morandi color represents a cluster ID (0, 1, 2, ...)
  const colorInfo: Array<{
    color: [number, number, number];
    pixelCount: number;
    percentage: number;
  }> = [];
  
  for (let i = 0; i < morandiPalette.length; i++) {
    const [r, g, b] = morandiPalette[i];
    const key = `${r},${g},${b}`;
    const count = colorMap.get(key) || 0;
    
    // Only include colors that exist in the image
    if (count > 0) {
      colorInfo.push({
        color: [r, g, b],
        pixelCount: count,
        percentage: totalNonWhitePixels > 0 ? (count / totalNonWhitePixels) * 100 : 0,
      });
    }
  }
  
  return colorInfo;
}