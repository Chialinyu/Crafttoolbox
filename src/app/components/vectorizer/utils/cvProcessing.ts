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

import { CLUSTER_LABELS } from '../constants';

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
  colorCount?: number; // For fill/mixed mode color clustering
  mode?: 'line' | 'fill' | 'mixed';
}

/**
 * K-means color clustering for multi-color vectorization
 * Optimized version with downsampling for faster preview
 */
function kMeansColorClustering(imageData: ImageData, k: number): { labels: Uint8Array; colors: number[][] } {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
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
  
  // Sample pixels for clustering
  const pixels: number[][] = [];
  for (let y = 0; y < sampledHeight; y++) {
    for (let x = 0; x < sampledWidth; x++) {
      const srcX = Math.round(x / scale);
      const srcY = Math.round(y / scale);
      const idx = (srcY * width + srcX) * 4;
      
      if (data[idx + 3] > 128) { // Only visible pixels
        pixels.push([data[idx], data[idx + 1], data[idx + 2]]);
      }
    }
  }
  
  if (pixels.length === 0) {
    return { labels: new Uint8Array(width * height), colors: [] };
  }
  
  // Initialize centroids with k-means++ (using seeded random)
  const centroids: number[][] = [];
  const firstIdx = Math.floor(seededRandom() * pixels.length);
  centroids.push([...pixels[firstIdx]]);
  
  for (let i = 1; i < k; i++) {
    const distances = pixels.map(pixel => {
      const minDist = Math.min(...centroids.map(c => 
        Math.sqrt((pixel[0] - c[0]) ** 2 + (pixel[1] - c[1]) ** 2 + (pixel[2] - c[2]) ** 2)
      ));
      return minDist * minDist;
    });
    
    const sum = distances.reduce((a, b) => a + b, 0);
    let target = seededRandom() * sum;
    
    for (let j = 0; j < distances.length; j++) {
      target -= distances[j];
      if (target <= 0) {
        centroids.push([...pixels[j]]);
        break;
      }
    }
  }
  
  // Optimization 2: Reduce iterations and add early stopping
  const maxIterations = 8; // Reduced from 20
  const labels = new Uint8Array(width * height);
  
  // 🎯 CRITICAL: Initialize transparent pixels with special label (CLUSTER_LABELS.TRANSPARENT)
  // This prevents transparent background from being treated as cluster 0
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] <= 128) {
      labels[i] = CLUSTER_LABELS.TRANSPARENT; // Special label for transparent pixels
    }
  }
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const oldCentroids = centroids.map(c => [...c]);
    
    // Assign labels to full resolution image
    let pixelIdx = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = pixelIdx * 4;
        if (data[i + 3] > 128) {
          const pixel = [data[i], data[i + 1], data[i + 2]];
          let minDist = Infinity;
          let bestCluster = 0;
          
          for (let c = 0; c < k; c++) {
            const dist = Math.sqrt(
              (pixel[0] - centroids[c][0]) ** 2 + 
              (pixel[1] - centroids[c][1]) ** 2 + 
              (pixel[2] - centroids[c][2]) ** 2
            );
            if (dist < minDist) {
              minDist = dist;
              bestCluster = c;
            }
          }
          
          labels[pixelIdx] = bestCluster;
        }
        // else: keep label = 255 for transparent pixels
        pixelIdx++;
      }
    }
    
    // Update centroids
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    
    pixelIdx = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 128) {
        const cluster = labels[pixelIdx];
        sums[cluster][0] += data[i];
        sums[cluster][1] += data[i + 1];
        sums[cluster][2] += data[i + 2];
        counts[cluster]++;
      }
      pixelIdx++;
    }
    
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = [
          Math.round(sums[c][0] / counts[c]),
          Math.round(sums[c][1] / counts[c]),
          Math.round(sums[c][2] / counts[c])
        ];
      }
    }
    
    // Early stopping: check if centroids changed significantly
    let maxChange = 0;
    for (let c = 0; c < k; c++) {
      const change = Math.sqrt(
        (centroids[c][0] - oldCentroids[c][0]) ** 2 +
        (centroids[c][1] - oldCentroids[c][1]) ** 2 +
        (centroids[c][2] - oldCentroids[c][2]) ** 2
      );
      maxChange = Math.max(maxChange, change);
    }
    
    // Stop if centroids barely changed
    if (maxChange < 2) {
      break;
    }
  }
  
  // Sort clusters by pixel count (largest first) to maintain color consistency
  const clusterCounts = new Array(k).fill(0);
  for (let i = 0; i < labels.length; i++) {
    // 🎯 Only count real clusters, skip transparent pixels (label = 255)
    if (labels[i] < k) {
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
  const sortedCentroids = sortedIndices.map(idx => centroids[idx]);
  
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
  
  // For fill/mixed mode with color clustering
  if ((mode === 'fill' || mode === 'mixed') && config.colorCount && config.colorCount > 1) {
    // Step 1: Apply blur for noise reduction
    let processed = imageData;
    if (config.blurRadius > 0) {
      processed = gaussianBlur(processed, config.blurRadius);
    }
    
    // Step 2: Color clustering
    const { labels, colors } = kMeansColorClustering(processed, config.colorCount);
    
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
  
  // For line mode - use original binary processing
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
  
  // 🎯 Line mode doesn't need labels
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