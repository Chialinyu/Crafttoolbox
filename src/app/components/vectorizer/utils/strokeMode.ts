/**
 * ============================================================================
 * STROKE MODE - Graph-based centerline extraction with primitive detection
 * ============================================================================
 * 
 * Pipeline:
 * 1. Detect closed shapes (circles/ellipses) → Geometric primitives
 * 2. Build skeleton graph for remaining pixels
 * 3. Prune short spurs
 * 4. Trace centerlines with width detection
 */

import type { VectorPath, Point } from './vectorization';
import { gaussianBlur, simplifyPath, pointsToSmoothBezierPath, pointsToSVGPath } from './vectorization';
import { detectCircleOrEllipse } from './ellipseFitting';
import { buildSkeletonGraph, pruneSkeletonGraph, graphToSkeleton } from './skeletonGraph';
import { zhangSuenThinning, traceSkeletonPaths, computeDistanceTransform } from './skeletonization';

interface ClosedShape {
  pixels: Array<{ x: number; y: number }>;
  contour: Array<{ x: number; y: number }>;
  area: number;
  circularity: number;
}

/**
 * Main stroke mode processing
 */
export async function processStrokeMode(
  imageData: ImageData,
  precision: number,
  simplify: boolean
): Promise<VectorPath[]> {
  const paths: VectorPath[] = [];
  const { data, width, height } = imageData;
  const tolerance = Math.max(0.2, (100 - precision) / 100);
  
  console.log('🎯 STROKE MODE: Graph-based centerline extraction...');
  
  // ========== Step 1: Preprocessing ==========
  console.log('📐 Step 1: Gaussian blur + binary threshold...');
  const blurred = gaussianBlur(data, width, height, 1.0);
  
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const pixelIdx = i * 4;
    binary[i] = blurred[pixelIdx] < 128 ? 255 : 0;
  }
  
  // ========== Step 2: Detect geometric primitives ==========
  console.log('⭕ Step 2: Detecting circles/ellipses...');
  const closedShapes = detectClosedShapes(binary, width, height);
  console.log(`  Found ${closedShapes.length} closed shapes`);
  
  // Process closed shapes as geometric primitives
  for (const shape of closedShapes) {
    if (shape.pixels.length < 5) continue;
    
    // Detect circle or ellipse primitive
    const primitive = detectCircleOrEllipse(shape.pixels);
    
    if (primitive) {
      // Calculate stroke width from shape size
      const avgRadius = primitive.type === 'circle' 
        ? primitive.r 
        : (primitive.rx + primitive.ry) / 2;
      const strokeWidth = Math.max(2, Math.round(avgRadius * 0.15));
      
      // Create vector path with primitive
      paths.push({
        points: [{ x: primitive.cx, y: primitive.cy }], // Just center for reference
        closed: true,
        type: 'stroke',
        color: '#000000',
        strokeWidth,
        primitive, // 🆕 Use geometric primitive!
      });
      
      console.log(`  ✨ ${primitive.type === 'circle' ? 'Circle' : 'Ellipse'}: r=${avgRadius.toFixed(1)}, stroke=${strokeWidth}px`);
    }
  }
  
  // ========== Step 3: Skeleton graph for centerlines ==========
  console.log('🦴 Step 3: Skeletonizing remaining pixels...');
  
  // Remove closed shapes from binary for skeletonization
  const binaryForSkeleton = new Uint8Array(binary);
  for (const shape of closedShapes) {
    for (const p of shape.pixels) {
      const idx = p.y * width + p.x;
      binaryForSkeleton[idx] = 0;
    }
  }
  
  // Skeletonize
  const skeletonRaw = zhangSuenThinning(binaryForSkeleton, width, height);
  
  // Distance transform for width detection
  const distanceMap = computeDistanceTransform(binaryForSkeleton, width, height);
  
  // ========== Step 4: Build and prune skeleton graph ==========
  console.log('📊 Step 4: Building skeleton graph...');
  const graph = buildSkeletonGraph(skeletonRaw, width, height, distanceMap);
  
  console.log('🌿 Step 5: Pruning short branches...');
  // 🆕 Dynamic threshold: 0.3% of image diagonal
  const imageDiagonal = Math.sqrt(width * width + height * height);
  const minSpurLength = Math.max(2, Math.round(imageDiagonal * 0.003));
  console.log(`   minSpurLength = ${minSpurLength}px (0.3% of ${imageDiagonal.toFixed(0)}px diagonal)`);
  const prunedGraph = pruneSkeletonGraph(graph, minSpurLength);
  
  // Convert back to skeleton
  const prunedSkeleton = graphToSkeleton(prunedGraph, width, height);
  
  // ========== Step 6: Trace centerlines ==========
  console.log('🎨 Step 6: Tracing centerlines...');
  const skeletonPaths = traceSkeletonPaths(prunedSkeleton, width, height);
  console.log(`  Found ${skeletonPaths.length} centerlines`);
  
  // Process centerlines
  for (const skPath of skeletonPaths) {
    if (skPath.points.length < 3) continue;
    
    // Calculate width for each point
    const widths: number[] = [];
    for (const pt of skPath.points) {
      const idx = Math.round(pt.y) * width + Math.round(pt.x);
      if (idx >= 0 && idx < distanceMap.length) {
        widths.push(distanceMap[idx] * 2);
      } else {
        widths.push(3);
      }
    }
    
    // Smooth width
    const smoothedWidths = smoothWidthArray(widths, 5);
    const avgWidth = smoothedWidths.reduce((sum, w) => sum + w, 0) / smoothedWidths.length;
    
    // Simplify path
    let points = skPath.points;
    if (simplify && tolerance > 0) {
      points = simplifyPath(points, tolerance * 2);
    }
    
    // Generate smooth bezier
    let svgPath: string | undefined;
    if (points.length >= 3) {
      try {
        svgPath = pointsToSmoothBezierPath(points, false);
      } catch (e) {
        svgPath = pointsToSVGPath(points, false);
      }
    } else {
      svgPath = pointsToSVGPath(points, false);
    }
    
    paths.push({
      points,
      closed: false,
      type: 'stroke',
      color: '#000000',
      svgPath,
      strokeWidth: Math.max(2, Math.round(avgWidth)),
    });
  }
  
  console.log(`✅ Stroke mode complete: ${paths.length} total paths (${closedShapes.length} primitives + ${skeletonPaths.length} centerlines)`);
  
  return paths;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Detect closed shapes (circles, ellipses)
 */
function detectClosedShapes(
  binary: Uint8Array,
  width: number,
  height: number
): ClosedShape[] {
  const visited = new Uint8Array(width * height);
  const shapes: ClosedShape[] = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      if (binary[idx] > 0 && !visited[idx]) {
        const region = floodFill(binary, width, height, x, y, visited);
        
        if (region.pixels.length < 20) continue;
        
        // Calculate circularity
        const area = region.pixels.length;
        const perimeter = calculatePerimeter(region.pixels, width, height);
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
        
        // Check aspect ratio
        const bounds = getBoundingBox(region.pixels);
        const aspectRatio = Math.max(bounds.width, bounds.height) / Math.min(bounds.width, bounds.height);
        
        // 🔥 STRICT: Only detect very circular shapes (圓形門檻提高)
        // circularity: 1.0 = perfect circle, 0.785 = square, lower = more irregular
        const isClosedShape = circularity > 0.75 && aspectRatio < 1.5;
        
        if (isClosedShape) {
          const contour = extractBoundary(region.pixels, width, height, binary);
          shapes.push({
            pixels: region.pixels,
            contour,
            area,
            circularity,
          });
        }
      }
    }
  }
  
  return shapes;
}

function floodFill(
  binary: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  visited: Uint8Array
): { pixels: Array<{ x: number; y: number }> } {
  const pixels: Array<{ x: number; y: number }> = [];
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const idx = y * width + x;
    
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (binary[idx] === 0) continue;
    if (visited[idx]) continue;
    
    visited[idx] = 1;
    pixels.push({ x, y });
    
    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }
  
  return { pixels };
}

function calculatePerimeter(
  pixels: Array<{ x: number; y: number }>,
  width: number,
  height: number
): number {
  const pixelSet = new Set(pixels.map(p => p.y * width + p.x));
  let perimeter = 0;
  
  for (const p of pixels) {
    const neighbors = [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ];
    
    for (const n of neighbors) {
      const nidx = n.y * width + n.x;
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height || !pixelSet.has(nidx)) {
        perimeter++;
      }
    }
  }
  
  return perimeter;
}

function getBoundingBox(pixels: Array<{ x: number; y: number }>): {
  x: number; y: number; width: number; height: number;
} {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const p of pixels) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function extractBoundary(
  pixels: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  binary: Uint8Array
): Array<{ x: number; y: number }> {
  const pixelSet = new Set(pixels.map(p => p.y * width + p.x));
  const boundary: Array<{ x: number; y: number }> = [];
  
  for (const p of pixels) {
    let isBoundary = false;
    
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = p.x + dx;
        const ny = p.y + dy;
        const nidx = ny * width + nx;
        
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || !pixelSet.has(nidx)) {
          isBoundary = true;
          break;
        }
      }
      if (isBoundary) break;
    }
    
    if (isBoundary) {
      boundary.push(p);
    }
  }
  
  return orderBoundaryPixels(boundary);
}

function orderBoundaryPixels(pixels: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (pixels.length === 0) return [];
  
  const ordered: Array<{ x: number; y: number }> = [pixels[0]];
  const remaining = new Set(pixels.slice(1).map((_, i) => i + 1));
  
  while (remaining.size > 0 && ordered.length < pixels.length) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = -1;
    let nearestDist = Infinity;
    
    for (const idx of remaining) {
      const dx = pixels[idx].x - last.x;
      const dy = pixels[idx].y - last.y;
      const dist = dx * dx + dy * dy;
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    }
    
    if (nearestIdx >= 0 && nearestDist <= 4) {
      ordered.push(pixels[nearestIdx]);
      remaining.delete(nearestIdx);
    } else {
      break;
    }
  }
  
  return ordered;
}

function smoothWidthArray(widths: number[], windowSize: number): number[] {
  const smoothed: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < widths.length; i++) {
    let sum = 0;
    let count = 0;
    
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(widths.length - 1, i + halfWindow); j++) {
      sum += widths[j];
      count++;
    }
    
    smoothed.push(sum / count);
  }
  
  return smoothed;
}