/**
 * ============================================================================
 * VECTORIZATION ENGINE - Image to SVG Vector Path Conversion
 * ============================================================================
 * 
 * OVERVIEW:
 * Converts raster images to vector paths using a hybrid approach:
 * - Primary: Potrace algorithm (smooth bezier curves)
 * - Fallback: Custom contour tracing (when Potrace fails)
 * 
 * ARCHITECTURE:
 * 1. Cluster-based Processing: Each color cluster processed independently
 * 2. Region Batching: Generator yields 1 region at a time (memory efficient)
 * 3. Adaptive Region Selection: Unlimited for simple images (≤4 colors), top 200 for complex
 * 4. Multi-level Protection: Complexity, aspect ratio, timeout guards
 * 5. Adaptive Downsampling: Adaptive resolution based on region complexity
 * 
 * KEY FEATURES:
 * ✅ Potrace Integration with timeout protection (15s)
 * ✅ Complexity Detection (perimeter/√area > 20 → skip Potrace)
 * ✅ Extreme Aspect Ratio Detection (>20:1 or <1:20 → skip Potrace)
 * ✅ Adaptive Downsampling (>500K px → downsample to 500K)
 * ✅ Generator-based Batching (1 region/batch → low memory peaks)
 * ✅ Adaptive Region Filtering (unlimited for ≤4 colors, 200 for complex images)
 * ✅ Mask Color Inversion (255-value → correct Potrace shape filling)
 * 
 * PERFORMANCE:
 * - Memory: ~100-200 MB peak (vs 400-500 MB without batching)
 * - Speed: No artificial delays (removed GC breathing)
 * - Limits: Adaptive based on complexity
 *   • Simple images (≤4 colors): No region/path limits (handles thousands)
 *   • Complex images (>4 colors): 200 regions/cluster, 500 total paths
 * 
 * PROTECTION MECHANISMS:
 * 1. Adaptive Limits → Simple shapes (≤4 colors) = unlimited regions/paths
 * 2. Region count > 200 (complex images) → Keep only largest regions (silent filtering)
 * 3. Complexity > 20 → Fallback algorithm
 * 3. Aspect ratio > 20 or < 0.05 → Fallback algorithm
 * 4. Region > 500K px → Downsample first
 * 5. Potrace timeout 15s → Fallback algorithm
 * 6. Empty/invalid paths → Fallback algorithm
 * 
 * WORKFLOW:
 * Upload → Cluster (K-means) → Vectorize each cluster → Export SVG
 * ============================================================================
 */

import Potrace from 'potrace';
import { zhangSuenThinning, traceSkeletonPaths, extractContours, smoothContourPoints, computeDistanceTransform, morphologicalClose } from './skeletonization';
import { fitEllipse, ellipseToSVGPath, detectCircleOrEllipse } from './ellipseFitting';
import { buildSkeletonGraph, pruneSkeletonGraph, graphToSkeleton } from './skeletonGraph';

// ============================================================================
// Types
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

// 🆕 Geometric primitives
export interface CirclePrimitive {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface EllipsePrimitive {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle?: number; // Rotation in degrees
}

export type ShapePrimitive = CirclePrimitive | EllipsePrimitive;

export interface VectorPath {
  points: Point[];
  closed: boolean;
  type: 'stroke' | 'fill';
  color?: string;
  svgPath?: string; // Direct SVG path string with bezier curves
  strokeWidth?: number; // Detected stroke width for line art
  primitive?: ShapePrimitive; // 🆕 Geometric primitive (circle/ellipse)
}

export interface VectorizationConfig {
  mode: 'stroke' | 'fill' | 'mixed';
  precision: number;
  minArea: number;
  simplify: boolean;
  // ❌ REMOVED: useBezierCurves, bezierAlgorithm - now always uses Potrace fallback strategy
  useImprovedTracing?: boolean; // 🆕 NEW: Use improved contour tracing (default: true)
  isCancelledRef?: React.MutableRefObject<boolean>; // Optional cancellation flag
  labels?: Uint8Array; // 🎯 Cluster labels from preprocessing (sequential: 0, 1, 2, ...)
  clusterCount?: number; // 🎯 Number of clusters
  clusterToMorandiMap?: number[]; // 🎯 Mapping from cluster ID to Morandi palette index
}

// ============================================================================
// Potrace Integration
// ============================================================================

/**
 * Convert Uint8Array mask to ImageData for Potrace
 * Inverts colors so Potrace traces the SHAPE, not the background
 * - Input mask: 255 (white) = shape, 0 (black) = background
 * - Output: 0 (black) = shape, 255 (white) = background
 * - Potrace traces BLACK regions, so this ensures it traces the shape correctly
 */
function maskToImageData(
  mask: Uint8Array,
  width: number,
  height: number
): ImageData {
  const imageData = new ImageData(width, height);
  const data = imageData.data;
  
  for (let i = 0; i < mask.length; i++) {
    const value = mask[i];
    const inverted = 255 - value; // Invert: Black = shape, White = background
    data[i * 4] = inverted;       // R
    data[i * 4 + 1] = inverted;   // G
    data[i * 4 + 2] = inverted;   // B
    data[i * 4 + 3] = 255;        // A
  }
  
  return imageData;
}

/**
 * 🆕 Extract sample points from SVG path string (for reference/display)
 * This is a simple parser that extracts coordinate pairs
 */
function extractPointsFromSVGPath(pathData: string): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const commands = pathData.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi);
  
  if (!commands) return points;
  
  let currentX = 0;
  let currentY = 0;
  
  for (const cmd of commands) {
    const type = cmd[0].toUpperCase();
    const coords = cmd.slice(1).trim().split(/[\s,]+/).filter(s => s).map(Number);
    
    switch (type) {
      case 'M': // MoveTo
      case 'L': // LineTo
        for (let i = 0; i < coords.length; i += 2) {
          currentX = coords[i];
          currentY = coords[i + 1];
          points.push({ x: currentX, y: currentY });
        }
        break;
      case 'C': // Cubic Bezier
        for (let i = 0; i < coords.length; i += 6) {
          currentX = coords[i + 4];
          currentY = coords[i + 5];
          points.push({ x: currentX, y: currentY });
        }
        break;
      case 'Q': // Quadratic Bezier
        for (let i = 0; i < coords.length; i += 4) {
          currentX = coords[i + 2];
          currentY = coords[i + 3];
          points.push({ x: currentX, y: currentY });
        }
        break;
      case 'H': // Horizontal line
        for (const x of coords) {
          currentX = x;
          points.push({ x: currentX, y: currentY });
        }
        break;
      case 'V': // Vertical line
        for (const y of coords) {
          currentY = y;
          points.push({ x: currentX, y: currentY });
        }
        break;
    }
  }
  
  return points;
}

/**
 * 🆕 Calculate bounding box of non-zero pixels in mask
 */
function calculateBoundingBox(
  mask: Uint8Array,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] > 0) {
        found = true;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  if (!found) return null;
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * 🆕 Crop mask to bounding box
 */
function cropMask(
  mask: Uint8Array,
  fullWidth: number,
  fullHeight: number,
  bbox: { x: number; y: number; width: number; height: number }
): Uint8Array {
  const cropped = new Uint8Array(bbox.width * bbox.height);
  
  for (let y = 0; y < bbox.height; y++) {
    for (let x = 0; x < bbox.width; x++) {
      const srcIdx = (bbox.y + y) * fullWidth + (bbox.x + x);
      const dstIdx = y * bbox.width + x;
      cropped[dstIdx] = mask[srcIdx];
    }
  }
  
  return cropped;
}

/**
 * 🆕 Estimate perimeter of a binary mask region
 * Counts boundary pixels (pixels with at least one empty neighbor)
 */
function estimatePerimeter(
  mask: Uint8Array,
  width: number,
  height: number,
  bbox: { x: number; y: number; width: number; height: number }
): number {
  let perimeterPixels = 0;
  
  for (let y = bbox.y; y < bbox.y + bbox.height; y++) {
    for (let x = bbox.x; x < bbox.x + bbox.width; x++) {
      const idx = y * width + x;
      
      if (mask[idx] > 0) {
        // Check if this is a boundary pixel (has at least one empty neighbor)
        let isBoundary = false;
        
        // Check 4-connected neighbors
        const neighbors = [
          [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
        ];
        
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            isBoundary = true;
            break;
          }
          const nIdx = ny * width + nx;
          if (mask[nIdx] === 0) {
            isBoundary = true;
            break;
          }
        }
        
        if (isBoundary) {
          perimeterPixels++;
        }
      }
    }
  }
  
  return perimeterPixels;
}

/**
 * 🆕 Resize mask using nearest-neighbor sampling (fast, preserves binary values)
 */
function resizeMask(
  mask: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8Array {
  const resized = new Uint8Array(dstWidth * dstHeight);
  
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;
  
  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = srcY * srcWidth + srcX;
      const dstIdx = y * dstWidth + x;
      resized[dstIdx] = mask[srcIdx];
    }
  }
  
  return resized;
}

/**
 * 🆕 Scale SVG path coordinates by a factor
 */
function scaleSVGPath(pathString: string, scale: number): string {
  if (scale === 1.0) return pathString;
  
  // Parse SVG path using a command-aware parser
  let result = '';
  let i = 0;
  
  while (i < pathString.length) {
    const char = pathString[i];
    
    // Check if this is a command letter
    if (/[MLHVCSQTAZmlhvcsqtaz]/.test(char)) {
      result += char;
      i++;
      
      const cmd = char.toUpperCase();
      
      // Skip whitespace/commas after command
      while (i < pathString.length && /[\s,]/.test(pathString[i])) {
        result += pathString[i];
        i++;
      }
      
      // Handle Z (closepath) - no coordinates
      if (cmd === 'Z') {
        continue;
      }
      
      // Parse coordinates based on command type
      let coordIndex = 0;
      while (i < pathString.length) {
        // Check if next char is a new command
        if (/[MLHVCSQTAZmlhvcsqtaz]/.test(pathString[i])) {
          break;
        }
        
        // Skip whitespace/commas
        while (i < pathString.length && /[\s,]/.test(pathString[i])) {
          result += pathString[i];
          i++;
        }
        
        if (i >= pathString.length || /[MLHVCSQTAZmlhvcsqtaz]/.test(pathString[i])) {
          break;
        }
        
        // Parse number
        const numMatch = pathString.substring(i).match(/^-?\d+\.?\d*/);
        if (!numMatch) break;
        
        const num = parseFloat(numMatch[0]);
        let scaled = num;
        
        // Scale coordinates (all coordinates need scaling, not just X/Y distinction)
        if (cmd === 'A') {
          // Arc - scale rx, ry, x, y (but NOT rotation, large-arc, sweep flags)
          const posInGroup = coordIndex % 7;
          if (posInGroup === 0 || posInGroup === 1 || posInGroup === 5 || posInGroup === 6) {
            scaled = num * scale;
          }
        } else {
          // All other commands - scale all coordinates
          scaled = num * scale;
        }
        
        result += scaled.toString();
        i += numMatch[0].length;
        coordIndex++;
      }
    } else {
      // Copy other characters
      result += char;
      i++;
    }
  }
  
  return result;
}

/**
 * Extract SVG path from Potrace SVG output
 * 🔧 FIX: Improved path extraction with better empty path detection
 */
function extractPathFromSVG(svg: string): string | null {
  // Extract all path elements using regex
  // 🔧 FIX: Use \b (word boundary) instead of \s, and allow empty d=""
  const pathRegex = /<path[^>]*\bd="([^"]*)"/g;
  const paths: string[] = [];
  
  let match;
  while ((match = pathRegex.exec(svg)) !== null) {
    const pathData = match[1];
    
    // 🔧 FIX: Skip empty paths silently (no warning spam)
    if (pathData && pathData.trim().length > 0) {
      paths.push(pathData);
    }
  }
  
  
  if (paths.length === 0) {
    return null;
  }
  
  if (paths.length === 1) {
    const path = paths[0];
    
    // 🎯 Improved validation: Check if path is actually empty or invalid
    const trimmedPath = path.trim();
    if (!trimmedPath || trimmedPath.length < 5) {
      console.warn('⚠️ Potrace: Path too short or empty');
      return null;
    }
    
    // Detect if it's ONLY a simple bounding box rectangle (very restrictive check)
    const isEdgeRect = /^M\s*0[\s,]0/.test(path);
    const hasOnlyLines = !/[CQA]/.test(path); // No curves at all
    const isVeryShort = path.length < 50; // Very short path
    
    // Only reject if ALL three conditions are true (strict filtering)
    if (isEdgeRect && hasOnlyLines && isVeryShort) {
      console.warn('⚠️ Potrace: Only found minimal bounding box, no actual shape');
      return null;
    }
    
    // ✅ Valid path found
    return path;
  }
  
  // Multiple paths found - filter out bounding box if present
  let startIndex = 0;
  
  // Check if Path 0 is a bounding box (only skip if very obvious)
  if (paths.length >= 2) {
    const path0 = paths[0];
    const isEdgeRect = /^M\s*0[\s,]0/.test(path0);
    const hasOnlyLines = !/[CQA]/.test(path0);
    const isVeryShort = path0.length < 50;
    
    // Only skip first path if it's clearly a bounding box
    if (isEdgeRect && hasOnlyLines && isVeryShort) {
      startIndex = 1;
    }
  }
  
  // Extract shape paths
  const shapePaths = paths.slice(startIndex);
  
  if (shapePaths.length === 0) {
    console.warn('⚠️ Potrace: All paths filtered out (suspected bounding boxes only)');
    return null;
  }
  
  // Combine paths directly (no reversal needed)
  const result = shapePaths.join(' ');
  
  // 🎯 Final validation: Check if result is actually empty
  const trimmedResult = result.trim();
  if (!trimmedResult || trimmedResult.length < 5) {
    console.warn('⚠️ Potrace: Combined path is empty or too short');
    return null;
  }
  
  return trimmedResult;
}

/**
 * Trace a binary mask using Potrace to generate smooth bezier curves
 * Returns a Promise that resolves to the SVG path string
 */
function traceWithPotrace(
  mask: Uint8Array,
  width: number,
  height: number,
  config: VectorizationConfig
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      // 🧪 Memory monitoring removed for production
      
      // 🔧 FIX: Calculate bounding box to avoid processing entire canvas
      const bbox = calculateBoundingBox(mask, width, height);
      
      if (!bbox) {
        console.warn('⚠️ Potrace: Empty mask, skipping');
        resolve(null);
        return;
      }
      
      // ✅ FIXED: More lenient size check - allow thin lines
      // Skip only if BOTH dimensions are tiny (< 2px), or total area is < 4px
      // This allows thin lines like 31x1, 2x29, 69x1 to be processed
      const area = bbox.width * bbox.height;
      if ((bbox.width < 2 && bbox.height < 2) || area < 4) {
        console.warn(`⚠️ Potrace: Region too small (${bbox.width}x${bbox.height}, area=${area}), skipping`);
        resolve(null);
        return;
      }
      
      // 🔧 FIX: Crop mask to bounding box
      const croppedMask = cropMask(mask, width, height, bbox);
      
      // 🚀 NEW: Complexity-based adaptive downsampling
      // Strategy:
      // - Simple small shapes (<100K px) → Full resolution
      // - Large regions (>500K px) → Downsample to 500K
      // - Complex textures (complexity > 20) → Estimate and decide
      
      const regionPixels = bbox.width * bbox.height;
      const perimeter = estimatePerimeter(mask, width, height, bbox);
      const complexity = perimeter / Math.sqrt(regionPixels);
      const aspectRatio = bbox.width / bbox.height;
      
      let downsampleScale = 1.0;
      let processWidth = bbox.width;
      let processHeight = bbox.height;
      let processMask = croppedMask;
      
      // 🔧 FIX: Skip extreme aspect ratios (very thin lines/strips)
      // Potrace has bugs with extreme shapes (width/height >= 20 or <= 0.05)
      if (aspectRatio >= 20 || aspectRatio <= 0.05) {
        resolve(null);
        return;
      }
      
      if (complexity > 20) {
        // Very complex texture - skip Potrace entirely
        resolve(null);
        return;
      } else if (regionPixels > 500_000) {
        // Large region - downsample to 500K pixels
        downsampleScale = Math.sqrt(500_000 / regionPixels);
        processWidth = Math.round(bbox.width * downsampleScale);
        processHeight = Math.round(bbox.height * downsampleScale);
        processMask = resizeMask(croppedMask, bbox.width, bbox.height, processWidth, processHeight);
      } else if (regionPixels > 100_000 && complexity > 10) {
        // Medium region with moderate complexity - mild downsample
        downsampleScale = Math.sqrt(100_000 / regionPixels);
        processWidth = Math.round(bbox.width * downsampleScale);
        processHeight = Math.round(bbox.height * downsampleScale);
        processMask = resizeMask(croppedMask, bbox.width, bbox.height, processWidth, processHeight);
      }
      
      // Convert processed mask to ImageData
      const imageData = maskToImageData(processMask, processWidth, processHeight);
      
      // Create a canvas for Potrace
      const canvas = document.createElement('canvas');
      canvas.width = processWidth;
      canvas.height = processHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.warn('Failed to create canvas context for Potrace');
        resolve(null);
        return;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // 🔧 FIX: Convert canvas to data URL (Potrace expects image data, not raw canvas)
      const dataURL = canvas.toDataURL('image/png');
      
      // Potrace options
      const tolerance = Math.max(0.2, (100 - config.precision) / 100);
      const params = {
        threshold: 128,
        turdSize: config.minArea,  // Minimum area (remove noise)
        optCurve: true,             // Enable curve optimization ✅ KEY!
        optTolerance: tolerance,    // Optimization tolerance
        color: 'black',
        background: 'transparent',
      };
      
      // 🔧 FIX: Trace with data URL instead of canvas
      Potrace.trace(dataURL, params, (err: Error | null, svg: string) => {
        // 🧪 TEST: Manual canvas cleanup to free memory ASAP
        try {
          canvas.width = 0;
          canvas.height = 0;
          // @ts-ignore - force cleanup
          canvas.remove();
        } catch (cleanupError) {
          // Silent cleanup error
        }
        
        if (err) {
          // Silent return - let fallback handle it
          resolve(null);
          return;
        }
        
        // Extract path from SVG
        const pathString = extractPathFromSVG(svg);
        
        if (!pathString) {
          // Silent return - this is expected for tiny/thin regions
          resolve(null);
          return;
        }
        
        // 🚀 NEW: Scale path back to original size if downsampled
        let scaledPath = pathString;
        if (downsampleScale !== 1.0) {
          const upscale = 1.0 / downsampleScale;
          scaledPath = scaleSVGPath(pathString, upscale);
        }
        
        // 🔧 FIX: Translate path coordinates back to original position
        const translatedPath = translateSVGPath(scaledPath, bbox.x, bbox.y);
        
        resolve(translatedPath);
      });
    } catch (error) {
      console.warn('❌ Potrace error:', error);
      resolve(null);
    }
  });
}

/**
 * 🆕 Translate SVG path coordinates by offset
 * 🔧 CRITICAL FIX: Properly parse SVG commands (M, L, C, H, V, etc.)
 * - Absolute commands (M, L, C, etc.) need coordinate translation
 * - Relative commands (m, l, c, etc.) don't need translation
 * - Must handle different command argument counts (H=1, M/L=2, C=6, etc.)
 */
function translateSVGPath(pathString: string, offsetX: number, offsetY: number): string {
  if (offsetX === 0 && offsetY === 0) {
    return pathString; // No translation needed
  }
  
  // Parse SVG path using a command-aware parser
  let result = '';
  let i = 0;
  
  while (i < pathString.length) {
    const char = pathString[i];
    
    // Check if this is a command letter
    if (/[MLHVCSQTAZmlhvcsqtaz]/.test(char)) {
      result += char;
      i++;
      
      const isAbsolute = char === char.toUpperCase();
      const cmd = char.toUpperCase();
      
      // Skip whitespace/commas after command
      while (i < pathString.length && /[\s,]/.test(pathString[i])) {
        result += pathString[i];
        i++;
      }
      
      // Handle Z (closepath) - no coordinates
      if (cmd === 'Z') {
        continue;
      }
      
      // Parse coordinates based on command type
      let coordIndex = 0;
      while (i < pathString.length) {
        // Check if next char is a new command
        if (/[MLHVCSQTAZmlhvcsqtaz]/.test(pathString[i])) {
          break;
        }
        
        // Skip whitespace/commas
        while (i < pathString.length && /[\s,]/.test(pathString[i])) {
          result += pathString[i];
          i++;
        }
        
        if (i >= pathString.length || /[MLHVCSQTAZmlhvcsqtaz]/.test(pathString[i])) {
          break;
        }
        
        // Parse number
        const numMatch = pathString.substring(i).match(/^-?\d+\.?\d*/);
        if (!numMatch) break;
        
        const num = parseFloat(numMatch[0]);
        let translated = num;
        
        // Translate only absolute coordinates
        if (isAbsolute) {
          if (cmd === 'H') {
            // Horizontal line - only X coordinate
            translated = num + offsetX;
          } else if (cmd === 'V') {
            // Vertical line - only Y coordinate
            translated = num + offsetY;
          } else if (cmd === 'M' || cmd === 'L' || cmd === 'T') {
            // MoveTo, LineTo, Smooth quadratic - (x,y) pairs
            const isXCoord = coordIndex % 2 === 0;
            translated = isXCoord ? num + offsetX : num + offsetY;
          } else if (cmd === 'C') {
            // Cubic bezier - (x1,y1,x2,y2,x,y) groups
            const posInGroup = coordIndex % 6;
            const isXCoord = posInGroup % 2 === 0;
            translated = isXCoord ? num + offsetX : num + offsetY;
          } else if (cmd === 'S' || cmd === 'Q') {
            // Smooth cubic / Quadratic - (x1,y1,x,y) groups
            const posInGroup = coordIndex % 4;
            const isXCoord = posInGroup % 2 === 0;
            translated = isXCoord ? num + offsetX : num + offsetY;
          } else if (cmd === 'A') {
            // Arc - (rx,ry,rotation,large-arc,sweep,x,y) groups
            const posInGroup = coordIndex % 7;
            // Only translate x,y (positions 5,6)
            if (posInGroup === 5) translated = num + offsetX;
            else if (posInGroup === 6) translated = num + offsetY;
          }
        }
        // Relative commands (lowercase) don't need translation
        
        result += translated.toString();
        i += numMatch[0].length;
        coordIndex++;
      }
    } else {
      // Copy other characters
      result += char;
      i++;
    }
  }
  
  return result;
}

// ⚠️ REMOVED: reverseSVGPathWinding function (Line 417-586, ~170 lines)
// Reason: Legacy path winding reversal approach, no longer used
// Replaced by: Mask color inversion in maskToImageData() (Line 50-65)
// Date: 2026-01-12

// ============================================================================
// Helper: Convert points array to simple SVG path (fallback)
// ============================================================================

/**
 * Convert array of points to SVG path string (straight lines, no curves)
 * This is a fallback when bezier curves are disabled or fail
 */
export function pointsToSVGPath(points: Point[], closed: boolean): string {
  if (points.length === 0) return '';
  
  let path = `M ${points[0].x},${points[0].y}`;
  
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x},${points[i].y}`;
  }
  
  if (closed) {
    path += ' Z';
  }
  
  return path;
}

// ============================================================================
// Smooth Bezier Curve Generation
// ============================================================================

/**
 * 🆕 NEW: Convert array of points to smooth SVG path with bezier curves
 * Uses adaptive curvature analysis to determine optimal smoothness
 */
export function pointsToSmoothBezierPath(points: Point[], closed: boolean): string {
  if (points.length < 3) {
    // Too few points - use straight lines
    return pointsToSVGPath(points, closed);
  }
  
  // Note: Simplification is done externally via simplifyPath(), no need to downsample here
  
  // 🎯 Adaptive curvature analysis
  // Measure how much the path curves to determine smoothness factor
  let totalCurvature = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    // Calculate angle change
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    
    const dot = v1x * v2x + v1y * v2y;
    const cross = Math.abs(v1x * v2y - v1y * v2x);
    const angle = Math.atan2(cross, dot);
    
    totalCurvature += angle;
  }
  
  const avgCurvature = totalCurvature / (points.length - 2);
  
  // 🎯 Balanced smoothness for flowing curves (0.38-0.58)
  let adaptiveSmoothness: number;
  if (avgCurvature < 0.05) {
    // Very smooth curve (e.g., circle) - high smoothness
    adaptiveSmoothness = 0.58;
  } else if (avgCurvature < 0.10) {
    // Moderate curve - medium-high smoothness
    adaptiveSmoothness = 0.50;
  } else if (avgCurvature < 0.20) {
    // Sharp turns - medium smoothness
    adaptiveSmoothness = 0.44;
  } else {
    // Very sharp turns - preserve details
    adaptiveSmoothness = 0.38;
  }
  
  console.log(`🎨 Bezier: ${points.length}pts, curve=${avgCurvature.toFixed(3)}, smooth=${adaptiveSmoothness.toFixed(2)}`);
  
  // Calculate control points for each segment
  const controlPoints: { cp1: Point; cp2: Point }[] = [];
  
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    
    // Tangent vector
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.sqrt(tx * tx + ty * ty);
    
    if (tLen === 0) {
      controlPoints.push({ cp1: curr, cp2: curr });
      continue;
    }
    
    // Normalized tangent
    const tnx = tx / tLen;
    const tny = ty / tLen;
    
    // Distance to next point
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Control point distance (adaptive)
    const cpDist = dist * adaptiveSmoothness;
    
    // Control points
    const cp1 = {
      x: curr.x + tnx * cpDist,
      y: curr.y + tny * cpDist,
    };
    const cp2 = {
      x: next.x - tnx * cpDist,
      y: next.y - tny * cpDist,
    };
    
    controlPoints.push({ cp1, cp2 });
  }
  
  // Build SVG path with cubic bezier curves
  let path = `M ${points[0].x},${points[0].y}`;
  
  for (let i = 0; i < points.length; i++) {
    const nextIndex = (i + 1) % points.length;
    const { cp1, cp2 } = controlPoints[i];
    const nextPoint = points[nextIndex];
    
    if (!closed && i === points.length - 1) {
      // Last segment in open path - don't curve back
      break;
    }
    
    path += ` C ${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${nextPoint.x},${nextPoint.y}`;
  }
  
  if (closed) {
    path += ' Z';
  }
  
  return path;
}

// ============================================================================
// Main Vectorization Function
// ============================================================================

/**
 * Main vectorization function
 * 🆕 Now returns Promise<VectorPath[]> to support async Potrace integration
 */
export async function vectorizeImage(
  imageData: ImageData, 
  config: VectorizationConfig
): Promise<VectorPath[]> {
  const paths: VectorPath[] = [];
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Calculate tolerance for path simplification
  const tolerance = Math.max(0.2, (100 - config.precision) / 100);
  
  try {
    // 🎨 STROKE MODE: HYBRID TRACE (closed shapes + centerlines)
    if (config.mode === 'stroke') {
      console.log('🎨 Line Mode: HYBRID TRACE (closed shapes + centerlines)...');
      
      // Step 0: Gaussian blur preprocessing
      console.log('🎨 Step 0: Gaussian blur preprocessing...');
      const blurred = gaussianBlur(data, width, height, 1.0);
      
      // Convert to binary
      const binary = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const pixelIdx = i * 4;
        const value = blurred[pixelIdx];
        binary[i] = value < 128 ? 255 : 0;
      }
      
      console.log('🎨 Step 1: Detecting closed shapes (circles, etc.)...');
      const closedShapes = detectClosedShapes(binary, width, height);
      console.log(`  Found ${closedShapes.length} closed shapes (circles/ellipses)`);
      
      // Create mask WITHOUT closed shapes for skeletonization
      const binaryForSkeleton = new Uint8Array(binary);
      for (const shape of closedShapes) {
        for (const pixel of shape.pixels) {
          const idx = pixel.y * width + pixel.x;
          binaryForSkeleton[idx] = 0; // Remove from skeleton processing
        }
      }
      
      console.log('🎨 Step 2: Distance transform...');
      const distanceMap = computeDistanceTransform(binaryForSkeleton, width, height);
      
      console.log('🎨 Step 3: Skeletonizing (centerlines only)...');
      const skeletonRaw = zhangSuenThinning(binaryForSkeleton, width, height);
      
      console.log('🎨 Step 3.5: Building skeleton graph...');
      const graph = buildSkeletonGraph(skeletonRaw, width, height, distanceMap);
      
      // ⚠️ DISABLE PRUNING - current algorithm deletes real stroke endpoints!
      console.log('🎨 Step 3.6: Skipping pruning (preserving all strokes)...');
      const prunedGraph = graph; // No pruning
      
      console.log('🎨 Step 3.7: Converting back to skeleton...');
      const skeleton = graphToSkeleton(prunedGraph, width, height);
      
      console.log('🎨 Step 4: Tracing skeleton paths...');
      const skeletonPaths = traceSkeletonPaths(skeleton, width, height);
      
      console.log(`🎨 Found ${skeletonPaths.length} centerline paths`);
      
      // Process CLOSED SHAPES - use ELLIPSE FITTING for perfect curves
      for (const shape of closedShapes) {
        if (shape.pixels.length < 5) continue;
        
        // Try ellipse fitting first (perfect mathematical curve)
        const ellipse = fitEllipse(shape.pixels);
        
        let svgPath: string | undefined;
        let points = shape.contour;
        
        if (ellipse && ellipse.a > 2 && ellipse.b > 2) {
          // SUCCESS: Use perfect ellipse with only 4 control points!
          svgPath = ellipseToSVGPath(ellipse);
          
          // For display, just use 4 anchor points
          const cos = Math.cos(ellipse.angle);
          const sin = Math.sin(ellipse.angle);
          points = [
            { x: ellipse.cx + ellipse.a * cos, y: ellipse.cy + ellipse.a * sin }, // Right
            { x: ellipse.cx - ellipse.b * sin, y: ellipse.cy + ellipse.b * cos }, // Top
            { x: ellipse.cx - ellipse.a * cos, y: ellipse.cy - ellipse.a * sin }, // Left
            { x: ellipse.cx + ellipse.b * sin, y: ellipse.cy - ellipse.b * cos }, // Bottom
          ];
          
          const avgRadius = (ellipse.a + ellipse.b) / 2;
          const strokeWidth = Math.max(2, Math.round(avgRadius * 0.15));
          
          paths.push({
            points,
            closed: true,
            type: 'stroke',
            color: '#000000',
            svgPath,
            strokeWidth,
          });
          
          console.log(`  ✨ Perfect ellipse: a=${ellipse.a.toFixed(1)}, b=${ellipse.b.toFixed(1)}, stroke: ${strokeWidth}px`);
          
        } else {
          // FALLBACK: Use contour trace
          if (config.simplify && tolerance > 0) {
            points = simplifyPath(points, tolerance);
          }
          
          if (points.length >= 3) {
            try {
              svgPath = pointsToSmoothBezierPath(points, true);
            } catch (e) {
              svgPath = pointsToSVGPath(points, true);
            }
          } else {
            svgPath = pointsToSVGPath(points, true);
          }
          
          const avgRadius = Math.sqrt(shape.area / Math.PI);
          const strokeWidth = Math.max(2, Math.round(avgRadius * 0.15));
          
          paths.push({
            points,
            closed: true,
            type: 'stroke',
            color: '#000000',
            svgPath,
            strokeWidth,
          });
          
          console.log(`  Contour shape: ${points.length} pts, stroke: ${strokeWidth}px`);
        }
      }
      
      // Process CENTERLINES
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
        
        console.log(`🎨 Centerline path: ${skPath.points.length} original points, avgWidth=${avgWidth.toFixed(1)}px`);
        
        // Simplify - gentle simplification to preserve details
        let points = skPath.points;
        if (config.simplify && tolerance > 0) {
          points = simplifyPath(points, tolerance * 1.5);
          console.log(`   → Simplified to ${points.length} points (tolerance=${(tolerance * 1.5).toFixed(2)})`);
        }
        
        // Smooth bezier
        let svgPath: string | undefined;
        if (points.length >= 3) {
          try {
            svgPath = pointsToSmoothBezierPath(points, false); // OPEN
          } catch (e) {
            svgPath = pointsToSVGPath(points, false);
          }
        } else {
          svgPath = pointsToSVGPath(points, false);
        }
        
        // 🎯 Increased minimum stroke width from 2px to 4px for visible round caps
        const finalStrokeWidth = Math.max(4, Math.round(avgWidth));
        
        paths.push({
          points,
          closed: false,
          type: 'stroke',
          color: '#000000',
          svgPath,
          strokeWidth: finalStrokeWidth,
        });
        
        console.log(`   → Final: ${points.length}pts, stroke=${finalStrokeWidth}px`);
      }
      
      console.log(`🎨 Hybrid Trace complete: ${closedShapes.length} closed + ${skeletonPaths.length} centerlines = ${paths.length} total`);
      return paths;
    }
    
    // ✅ Cluster-based vectorization (fill mode - original logic)
    if (config.labels && config.clusterCount) {
      // Process each cluster
      for (let clusterId = 0; clusterId < config.clusterCount; clusterId++) {
        if (config.isCancelledRef?.current) {
          // ⚠️ Keep cancellation message (user feedback)
          console.log('Vectorization cancelled by user');
          return paths;
        }
        
        // Create mask for this cluster
        const clusterMask = createClusterMask(config.labels, width, height, clusterId, imageData);
        
        // Get Morandi color for this cluster (matching cvProcessing.ts palette)
        const morandiPalette = [
          [168, 159, 145], // #A89F91 - Coffee
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
        
        // 🔧 FIX: Ensure colorIndex is valid
        let colorIndex = config.clusterToMorandiMap ? config.clusterToMorandiMap[clusterId] : clusterId;
        if (colorIndex === undefined || colorIndex < 0) {
          colorIndex = clusterId; // Fallback to cluster ID
        }
        const color = morandiPalette[colorIndex % morandiPalette.length];
        
        // 🛡️ SAFETY: Ensure color is valid
        if (!color || !Array.isArray(color) || color.length < 3) {
          console.error(`❌ Invalid color for cluster ${clusterId}, colorIndex: ${colorIndex}`);
          continue; // Skip this cluster
        }
        
        // 🆕 STEP 1: Use generator to process regions in batches
        // This reduces memory peaks from 90MB to 10MB (9x reduction)
        // Each batch contains 3 regions, then GC can reclaim memory
        let batchCount = 0;
        let totalRegions = 0;
        
        // 🎯 ADAPTIVE LIMITS: Simple images with few colors can handle many more regions
        // Few colors (≤4) = simple shapes like mosaic tiles → No region limit needed
        // Many colors (>4) = complex images → Keep 200 region safety limit
        const MAX_REGIONS_PER_CLUSTER = config.clusterCount <= 4 ? Infinity : 200;
        const MAX_TOTAL_PATHS = config.clusterCount <= 4 ? Infinity : 500;
        
        // 🧪 TEST: Smart timeout protection - skip Potrace after first timeout in this cluster
        let potraceTimedOut = false;
        
        // 🎯 Generate batches with smart filtering (prioritize large regions)
        for (const batch of generateRegionBatches(clusterMask, width, height, config.minArea, 1, MAX_REGIONS_PER_CLUSTER)) {
          batchCount++;
          totalRegions += batch.length;
          
          // 🔧 Global path limit (safety check - should rarely trigger now)
          if (paths.length >= MAX_TOTAL_PATHS) {
            return paths;
          }
          
          // Process each region in the batch (still serial for now - Step 2 will add concurrency)
          for (const regionMask of batch) {
            if (config.isCancelledRef?.current) {
              // ⚠️ Keep cancellation message (user feedback)
              console.log('Vectorization cancelled by user');
              return paths;
            }
            
            // 🧪 Memory monitoring removed for production
            
            // 🚀 UNCONDITIONAL THREE-LEVEL FALLBACK STRATEGY:
            // 1. Potrace with adaptive downsampling (premium quality - handles both lines and curves optimally)
            // 2. Improved contour + Custom Bezier (good quality fallback)
            // 3. Straight lines (basic fallback)
            
            let processedWithPotrace = false;
            
            // 🎯 NEW: Complexity-based strategy (replaces memory pressure detection)
            // - Potrace now handles complexity internally via downsampling
            // - Only skip after timeout (which should be much rarer now)
            
            if (potraceTimedOut) {
              // Jump directly to Level 2
            } else {
              // Level 1: Try Potrace first (best quality for all image types)
              try {
                // 🧪 TEST: Timeout protection - if Potrace hangs, fallback after 15s
                const POTRACE_TIMEOUT_MS = 15000; // 15 seconds
                
                const potracePromise = traceWithPotrace(
                  regionMask,
                  width,
                  height,
                  config
                );
                
                // 🔧 FIX: Track timeout ID so we can clear it
                let timeoutId: NodeJS.Timeout | null = null;
                
                const timeoutPromise = new Promise<string | null>((resolve) => {
                  timeoutId = setTimeout(() => {
                    potraceTimedOut = true; // 🔒 Lock out Potrace for rest of cluster
                    resolve(null);
                  }, POTRACE_TIMEOUT_MS);
                });
                
                // Race: Potrace vs Timeout
                const potracePathString = await Promise.race([potracePromise, timeoutPromise]);
                
                // 🔧 FIX: Clear timeout immediately after race completes
                if (timeoutId !== null) {
                  clearTimeout(timeoutId);
                }
                
                if (potracePathString) {
                  // Successfully generated Potrace path!
                  
                  paths.push({
                    points: [], // Not used when svgPath is provided
                    closed: true,
                    type: config.mode === 'fill' ? 'fill' : 'fill', // Always fill for potrace
                    color: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
                    svgPath: potracePathString,
                  });
                  
                  processedWithPotrace = true;
                  
                  // 🚀 GC breathing removed - protection mechanisms are sufficient:
                  // - Complexity detection skips complex regions
                  // - Aspect ratio detection skips extreme shapes
                  // - Smart downsampling controls memory usage
                }
              } catch (error) {
                console.warn('Potrace failed, falling back to Custom Bezier:', error);
                // Fall through to Level 2
              }
            }
            
            // Level 2 & 3: Only run if Potrace didn't succeed
            if (!processedWithPotrace) {
              // ✅ Always use Improved tracing for better quality
              const contours = findBoundaryContours(
                regionMask,
                width,
                height,
                1000,
                config.isCancelledRef,
                true // ✅ Always use improved algorithm
              );
              
              for (const contour of contours) {
                if (config.isCancelledRef?.current) {
                  // ⚠️ Keep cancellation message (user feedback)
                  console.log('Vectorization cancelled by user');
                  return paths;
                }
                
                // Filter by minimum area
                const area = calculateArea(contour);
                if (area < config.minArea) continue;
                
                // Simplify path if requested
                let points = contour;
                if (config.simplify && tolerance > 0) {
                  points = simplifyPath(contour, tolerance);
                }
                
                // Determine path type based on mode
                let type: 'stroke' | 'fill';
                if (config.mode === 'fill') {
                  type = 'fill';
                } else {
                  // Mixed mode: use area to decide
                  type = area < 100 ? 'stroke' : 'fill';
                }
                
                // Level 2: Always try Custom Bezier (fallback from Potrace)
                let svgPath: string | undefined;
                try {
                  svgPath = pointsToSmoothBezierPath(points, true);
                  // Validate generated path
                  if (!svgPath || svgPath.length < 5) {
                    console.warn('Invalid bezier path generated, falling back to straight lines');
                    svgPath = undefined; // Level 3: Straight lines fallback
                  }
                } catch (error) {
                  console.error('Error generating bezier path:', error);
                  svgPath = undefined; // Level 3: Straight lines fallback
                }
                
                paths.push({
                  points,
                  closed: true,
                  type,
                  color: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
                  svgPath,
                });
              }
            }
          }
          
          // 🔧 FIX: Let browser breathe between batches (allows GC to reclaim memory)
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } else {
      // 🎯 Fallback: color-based vectorization (old logic)
      console.warn('⚠️ Using color-based vectorization (no cluster labels)');
      
      const colors = extractColors(imageData, 20);
      
      for (let colorIndex = 0; colorIndex < colors.length; colorIndex++) {
        // ✅ Check for cancellation before processing each color
        if (config.isCancelledRef?.current) {
          console.log('Vectorization cancelled by user');
          return paths; // Return partial results
        }
        
        const color = colors[colorIndex];
        const contours = findContours(imageData, color, 500, config.isCancelledRef);
        
        for (const contour of contours) {
          // ✅ Check for cancellation in tight loops
          if (config.isCancelledRef?.current) {
            console.log('Vectorization cancelled by user');
            return paths;
          }
          
          // Filter by minimum area
          const area = calculateArea(contour);
          if (area < config.minArea) continue;
          
          // Simplify path if requested
          let points = contour;
          if (config.simplify && tolerance > 0) {
            points = simplifyPath(contour, tolerance);
          }
          
          // Determine path type based on mode
          let type: 'stroke' | 'fill';
          if (config.mode === 'fill') {
            type = 'fill';
          } else {
            // Mixed mode: use area to decide
            type = area < 100 ? 'stroke' : 'fill';
          }
          
          // Level 2: Always try Custom Bezier (fallback from Potrace)
          let svgPath: string | undefined;
          try {
            svgPath = pointsToSmoothBezierPath(points, true);
            // Validate generated path
            if (!svgPath || svgPath.length < 5) {
              console.warn('Invalid bezier path generated, falling back to straight lines');
              svgPath = undefined; // Level 3: Straight lines fallback
            }
          } catch (error) {
            console.error('Error generating bezier path:', error);
            svgPath = undefined; // Level 3: Straight lines fallback
          }
          
          paths.push({
            points,
            closed: true,
            type,
            color: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
            svgPath,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error during vectorization:', error);
  }
  
  return paths;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a binary mask for a specific cluster
 */
function createClusterMask(
  labels: Uint8Array,
  width: number,
  height: number,
  clusterId: number,
  originalImageData: ImageData
): Uint8Array {
  const mask = new Uint8Array(width * height);
  
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === clusterId) {
      mask[i] = 255; // White for this cluster
    } else {
      mask[i] = 0;   // Black for others
    }
  }
  
  return mask;
}

/**
 * Find all connected regions in a binary mask
 * Returns array of masks, one for each connected region
 */
function findConnectedRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number
): Uint8Array[] {
  const regions: Uint8Array[] = [];
  const visited = new Uint8Array(mask.length);
  
  // Flood fill to find connected components
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      if (mask[idx] > 0 && !visited[idx]) {
        // Found a new region - flood fill it
        const regionMask = new Uint8Array(mask.length);
        const queue: [number, number][] = [[x, y]];
        visited[idx] = 1;
        regionMask[idx] = 255;
        let pixelCount = 1;
        
        while (queue.length > 0) {
          const [cx, cy] = queue.shift()!;
          
          // Check 4 neighbors
          const neighbors = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1],
          ];
          
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (mask[nIdx] > 0 && !visited[nIdx]) {
                visited[nIdx] = 1;
                regionMask[nIdx] = 255;
                queue.push([nx, ny]);
                pixelCount++;
              }
            }
          }
        }
        
        // Only add regions above minimum area
        if (pixelCount >= minArea) {
          regions.push(regionMask);
        }
      }
    }
  }
  
  return regions;
}

/**
 * 🆕 STEP 1 OPTIMIZATION: Generator-based region finder
 * Yields regions in batches to reduce memory peaks
 * - Memory: 90MB → 10MB (9x reduction)
 * - GC pressure: Significantly reduced
 * - Batch size: 1 region per batch (configurable)
 * - Smart filtering: Only yields top N regions by area (largest first)
 */
function* generateRegionBatches(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number,
  batchSize: number = 3,
  maxRegions: number = 200
): Generator<Uint8Array[], void, unknown> {
  const visited = new Uint8Array(mask.length);
  
  // 🎯 STEP 1: Collect ALL regions with their pixel counts
  interface RegionInfo {
    mask: Uint8Array;
    pixelCount: number;
  }
  const allRegions: RegionInfo[] = [];
  
  // Flood fill to find connected components
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      if (mask[idx] > 0 && !visited[idx]) {
        // Found a new region - flood fill it
        const regionMask = new Uint8Array(mask.length);
        const queue: [number, number][] = [[x, y]];
        visited[idx] = 1;
        regionMask[idx] = 255;
        let pixelCount = 1;
        
        while (queue.length > 0) {
          const [cx, cy] = queue.shift()!;
          
          // Check 4 neighbors
          const neighbors = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1],
          ];
          
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (mask[nIdx] > 0 && !visited[nIdx]) {
                visited[nIdx] = 1;
                regionMask[nIdx] = 255;
                queue.push([nx, ny]);
                pixelCount++;
              }
            }
          }
        }
        
        // Only consider regions above minimum area
        if (pixelCount >= minArea) {
          allRegions.push({ mask: regionMask, pixelCount });
        }
      }
    }
  }
  
  // 🎯 STEP 2: Sort by area (descending) and take top N
  // This ensures we vectorize the largest/most important regions first
  allRegions.sort((a, b) => b.pixelCount - a.pixelCount);
  const selectedRegions = allRegions.slice(0, maxRegions);
  
  // 🎯 STEP 3: Yield in batches
  let currentBatch: Uint8Array[] = [];
  for (const region of selectedRegions) {
    currentBatch.push(region.mask);
    
    if (currentBatch.length >= batchSize) {
      yield currentBatch;
      currentBatch = []; // Clear batch after yielding (allows GC)
    }
  }
  
  // Yield remaining regions in final batch
  if (currentBatch.length > 0) {
    yield currentBatch;
  }
}

/**
 * Find boundary contours in a binary mask
 * 🎯 Routes to different tracing algorithms based on config.bezierAlgorithm
 */
function findBoundaryContours(
  mask: Uint8Array,
  width: number,
  height: number,
  maxContours: number,
  isCancelledRef?: React.MutableRefObject<boolean>,
  useImprovedAlgorithm?: boolean // 🆕 NEW: Choose algorithm
): Point[][] {
  // 🎯 Use improved algorithm by default (more accurate)
  if (useImprovedAlgorithm !== false) {
    return findBoundaryContoursImproved(mask, width, height, maxContours, isCancelledRef);
  } else {
    // Legacy algorithm (simpler, faster, less accurate)
    return findBoundaryContoursLegacy(mask, width, height, maxContours, isCancelledRef);
  }
}

/**
 * LEGACY: Original simple boundary tracing
 * 🔧 Kept for comparison - may skip pixels, resulting in octagonal circles
 */
function findBoundaryContoursLegacy(
  mask: Uint8Array,
  width: number,
  height: number,
  maxContours: number,
  isCancelledRef?: React.MutableRefObject<boolean>
): Point[][] {
  const contours: Point[][] = [];
  const visited = new Uint8Array(mask.length);
  
  // Find all boundary starting points
  for (let y = 0; y < height && contours.length < maxContours; y++) {
    if (isCancelledRef?.current) break;
    
    for (let x = 0; x < width && contours.length < maxContours; x++) {
      const idx = y * width + x;
      
      // Look for filled pixels that haven't been visited
      if (mask[idx] > 0 && !visited[idx]) {
        // Check if this is a boundary pixel (has at least one empty neighbor)
        let isBoundary = false;
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          isBoundary = true;
        } else {
          // Check 4-connected neighbors
          if (mask[(y-1) * width + x] === 0 ||
              mask[(y+1) * width + x] === 0 ||
              mask[y * width + (x-1)] === 0 ||
              mask[y * width + (x+1)] === 0) {
            isBoundary = true;
          }
        }
        
        if (isBoundary) {
          // Trace this contour using legacy algorithm
          const contour = traceContourLegacy(mask, width, height, x, y, visited);
          
          // 🔧 FIX: Filter by minimum area early (3 pixels = ~3 area)
          // This prevents hundreds of tiny 11-point noise contours
          if (contour.length >= 4) {
            const area = calculateArea(contour);
            if (area >= 10) { // Minimum 10 pixels area
              contours.push(contour);
              // 🔧 CRITICAL FIX: Mark all contour points as visited to prevent re-tracing
              for (const point of contour) {
                const pointIdx = point.y * width + point.x;
                visited[pointIdx] = 1;
              }
            }
          }
        } else {
          // Not a boundary, mark as visited to skip in future
          visited[idx] = 1;
        }
      }
    }
  }
  
  return contours;
}

/**
 * IMPROVED: Single outer contour per region with full pixel tracking
 * 🎯 More accurate - tracks ALL boundary pixels without skipping
 */
function findBoundaryContoursImproved(
  mask: Uint8Array,
  width: number,
  height: number,
  maxContours: number,
  isCancelledRef?: React.MutableRefObject<boolean>
): Point[][] {
  const contours: Point[][] = [];
  const visited = new Uint8Array(mask.length);
  
  // Find all boundary starting points
  for (let y = 0; y < height && contours.length < maxContours; y++) {
    if (isCancelledRef?.current) break;
    
    for (let x = 0; x < width && contours.length < maxContours; x++) {
      const idx = y * width + x;
      
      // Look for filled pixels that haven't been visited
      if (mask[idx] > 0 && !visited[idx]) {
        // Check if this is a boundary pixel (has at least one empty neighbor)
        let isBoundary = false;
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          isBoundary = true;
        } else {
          // Check 4-connected neighbors
          if (mask[(y-1) * width + x] === 0 ||
              mask[(y+1) * width + x] === 0 ||
              mask[y * width + (x-1)] === 0 ||
              mask[y * width + (x+1)] === 0) {
            isBoundary = true;
          }
        }
        
        if (isBoundary) {
          // Trace this contour using improved algorithm
          const contour = traceContourImproved(mask, width, height, x, y, visited);
          
          if (contour.length >= 3) {
            contours.push(contour);
          }
        } else {
          // Not a boundary, mark as visited to skip in future
          visited[idx] = 1;
        }
      }
    }
  }
  
  return contours;
}

/**
 * Improved contour tracing using simplified boundary following
 * 🎯 Traces boundary pixels in order to create a closed path
 */
function traceContourImproved(
  mask: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  visited: Uint8Array
): Point[] {
  const contour: Point[] = [];
  
  // 8-direction clockwise: E, SE, S, SW, W, NW, N, NE
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1]
  ];
  
  let x = startX;
  let y = startY;
  let dir = 0; // Start searching to the right
  
  const startIdx = startY * width + startX;
  const MAX_POINTS = 50000; // Prevent infinite loops
  
  do {
    // Add current point
    contour.push({ x, y });
    const currentIdx = y * width + x;
    visited[currentIdx] = 1;
    
    // Safety check
    if (contour.length > MAX_POINTS) {
      console.warn(`⚠️ Contour exceeded ${MAX_POINTS} points, truncating`);
      break;
    }
    
    // Find next boundary pixel
    // Start searching from the direction we came from (turned left)
    let searchDir = (dir + 6) % 8; // Turn left from previous direction
    let found = false;
    
    for (let i = 0; i < 8; i++) {
      const checkDir = (searchDir + i) % 8;
      const nx = x + dirs[checkDir][0];
      const ny = y + dirs[checkDir][1];
      
      // Check bounds
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        
        // If this neighbor is filled, move there
        if (mask[nIdx] > 0) {
          x = nx;
          y = ny;
          dir = checkDir;
          found = true;
          break;
        }
      }
    }
    
    // If we can't find a next pixel, we're done
    if (!found) {
      break;
    }
    
    // Check if we've returned to start (allow small tolerance)
    const distToStart = Math.abs(x - startX) + Math.abs(y - startY);
    if (contour.length > 10 && distToStart <= 1) {
      break;
    }
    
  } while (true);
  
  return contour;
}

/**
 * Legacy contour tracing using simple boundary following
 * 🔧 May skip pixels, resulting in octagonal circles
 */
function traceContourLegacy(
  mask: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  visited: Uint8Array
): Point[] {
  const contour: Point[] = [];
  
  // 4-direction clockwise: E, S, W, N
  const dirs = [
    [1, 0], [0, 1], [-1, 0], [0, -1]
  ];
  
  let x = startX;
  let y = startY;
  let dir = 0; // Start searching to the right
  
  const startIdx = startY * width + startX;
  const MAX_POINTS = 50000; // Prevent infinite loops
  
  do {
    // Add current point
    contour.push({ x, y });
    const currentIdx = y * width + x;
    visited[currentIdx] = 1;
    
    // Safety check
    if (contour.length > MAX_POINTS) {
      console.warn(`⚠️ Contour exceeded ${MAX_POINTS} points, truncating`);
      break;
    }
    
    // Find next boundary pixel
    // Start searching from the direction we came from (turned left)
    let searchDir = (dir + 3) % 4; // Turn left from previous direction
    let found = false;
    
    for (let i = 0; i < 4; i++) {
      const checkDir = (searchDir + i) % 4;
      const nx = x + dirs[checkDir][0];
      const ny = y + dirs[checkDir][1];
      
      // Check bounds
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        
        // If this neighbor is filled, move there
        if (mask[nIdx] > 0) {
          x = nx;
          y = ny;
          dir = checkDir;
          found = true;
          break;
        }
      }
    }
    
    // If we can't find a next pixel, we're done
    if (!found) {
      break;
    }
    
    // Check if we've returned to start (allow small tolerance)
    const distToStart = Math.abs(x - startX) + Math.abs(y - startY);
    if (contour.length > 10 && distToStart <= 1) {
      break;
    }
    
  } while (true);
  
  return contour;
}

/**
 * Extract dominant colors from image
 */
function extractColors(imageData: ImageData, maxColors: number): number[][] {
  const colorMap = new Map<string, number>();
  const data = imageData.data;
  
  // Sample colors
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    if (a < 128) continue; // Skip transparent
    
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }
  
  // Sort by frequency
  const sorted = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors);
  
  return sorted.map(([key]) => key.split(',').map(Number));
}

/**
 * Find contours for a specific color
 */
function findContours(
  imageData: ImageData,
  targetColor: number[] | null,
  maxContours: number,
  isCancelledRef?: React.MutableRefObject<boolean>
): Point[][] {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  
  // Create binary mask
  for (let i = 0; i < data.length / 4; i++) {
    if (isCancelledRef?.current) break;
    
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    
    if (a < 128) continue;
    
    if (targetColor === null) {
      // Binary mode: any dark pixel
      const gray = (r + g + b) / 3;
      mask[i] = gray < 128 ? 255 : 0;
    } else {
      // Color matching
      const [tr, tg, tb] = targetColor;
      const dist = Math.sqrt(
        (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2
      );
      mask[i] = dist < 50 ? 255 : 0;
    }
  }
  
  return findBoundaryContours(mask, width, height, maxContours, isCancelledRef);
}

/**
 * Calculate area of a contour
 */
function calculateArea(points: Point[]): number {
  if (points.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  
  return Math.abs(area / 2);
}

/**
 * 🆕 Detect closed shapes (circles, ellipses) that should be outlined, not skeletonized
 */
interface ClosedShape {
  pixels: Array<{ x: number; y: number }>;
  contour: Array<{ x: number; y: number }>;
  area: number;
  circularity: number; // 0-1, where 1 = perfect circle
}

function detectClosedShapes(
  binary: Uint8Array,
  width: number,
  height: number
): ClosedShape[] {
  const visited = new Uint8Array(width * height);
  const shapes: ClosedShape[] = [];
  
  // Find connected components
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      if (binary[idx] > 0 && !visited[idx]) {
        // Found new region - flood fill
        const region = floodFill(binary, width, height, x, y, visited);
        
        if (region.pixels.length < 20) continue; // Too small, ignore
        
        // Calculate circularity = 4π * area / perimeter²
        // Circle = 1.0, square ≈ 0.785, line → 0
        const area = region.pixels.length;
        const perimeter = calculatePerimeter(region.pixels, width, height);
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
        
        // Is this a closed shape (circle/ellipse)?
        // Also check aspect ratio to catch ellipses
        const bounds = getBoundingBox(region.pixels);
        const aspectRatio = Math.max(bounds.width, bounds.height) / Math.min(bounds.width, bounds.height);
        
        // Closed shape criteria:
        // - High circularity (>0.4) OR
        // - Reasonable aspect ratio (<3) AND medium circularity (>0.3)
        const isClosedShape = circularity > 0.4 || (aspectRatio < 3 && circularity > 0.3);
        
        if (isClosedShape) {
          // Extract boundary contour
          const contour = extractBoundary(region.pixels, width, height, binary);
          
          shapes.push({
            pixels: region.pixels,
            contour,
            area,
            circularity,
          });
          
          console.log(`    Closed shape: area=${area}, circ=${circularity.toFixed(2)}, AR=${aspectRatio.toFixed(1)}`);
        }
      }
    }
  }
  
  return shapes;
}

/**
 * Flood fill to find connected component
 */
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
    
    // 4-connected neighbors
    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }
  
  return { pixels };
}

/**
 * Calculate perimeter of region (boundary pixel count)
 */
function calculatePerimeter(
  pixels: Array<{ x: number; y: number }>,
  width: number,
  height: number
): number {
  const pixelSet = new Set(pixels.map(p => p.y * width + p.x));
  let perimeter = 0;
  
  for (const p of pixels) {
    // Check 4 neighbors
    const neighbors = [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ];
    
    for (const n of neighbors) {
      const nidx = n.y * width + n.x;
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height || !pixelSet.has(nidx)) {
        perimeter++; // Edge pixel
      }
    }
  }
  
  return perimeter;
}

/**
 * Get bounding box of pixel set
 */
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

/**
 * Extract boundary contour from region
 */
function extractBoundary(
  pixels: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  binary: Uint8Array
): Array<{ x: number; y: number }> {
  const pixelSet = new Set(pixels.map(p => p.y * width + p.x));
  const boundary: Array<{ x: number; y: number }> = [];
  
  // Find boundary pixels (has at least one background neighbor)
  for (const p of pixels) {
    let isBoundary = false;
    
    // Check 8-connected neighbors
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
  
  // Order boundary pixels (simple nearest-neighbor)
  return orderBoundaryPixels(boundary);
}

/**
 * Order boundary pixels into continuous path
 */
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
      const dist = dx * dx + dy * dy; // Squared distance (faster)
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    }
    
    if (nearestIdx >= 0 && nearestDist <= 4) { // Max 2px distance (squared = 4)
      ordered.push(pixels[nearestIdx]);
      remaining.delete(nearestIdx);
    } else {
      break; // No more nearby pixels
    }
  }
  
  return ordered;
}

/**
 * 🆕 Gaussian blur for noise reduction (RapidResizer-style preprocessing)
 */
export function gaussianBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number = 1.0
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data);
  
  // Generate 1D Gaussian kernel
  const kernelSize = Math.ceil(sigma * 3) * 2 + 1; // 3-sigma rule
  const kernel: number[] = [];
  const halfSize = Math.floor(kernelSize / 2);
  let sum = 0;
  
  for (let i = 0; i < kernelSize; i++) {
    const x = i - halfSize;
    const val = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(val);
    sum += val;
  }
  
  // Normalize kernel
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }
  
  // Temporary buffer for horizontal pass
  const temp = new Uint8ClampedArray(width * height * 4);
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let k = 0; k < kernelSize; k++) {
        const xx = Math.min(Math.max(x + k - halfSize, 0), width - 1);
        const idx = (y * width + xx) * 4;
        const weight = kernel[k];
        
        r += data[idx] * weight;
        g += data[idx + 1] * weight;
        b += data[idx + 2] * weight;
        a += data[idx + 3] * weight;
      }
      
      const idx = (y * width + x) * 4;
      temp[idx] = r;
      temp[idx + 1] = g;
      temp[idx + 2] = b;
      temp[idx + 3] = a;
    }
  }
  
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let k = 0; k < kernelSize; k++) {
        const yy = Math.min(Math.max(y + k - halfSize, 0), height - 1);
        const idx = (yy * width + x) * 4;
        const weight = kernel[k];
        
        r += temp[idx] * weight;
        g += temp[idx + 1] * weight;
        b += temp[idx + 2] * weight;
        a += temp[idx + 3] * weight;
      }
      
      const idx = (y * width + x) * 4;
      result[idx] = Math.round(r);
      result[idx + 1] = Math.round(g);
      result[idx + 2] = Math.round(b);
      result[idx + 3] = Math.round(a);
    }
  }
  
  return result;
}

/**
 * 🆕 Smooth width array using moving average (for natural width transitions)
 */
function smoothWidthArray(widths: number[], windowSize: number = 5): number[] {
  if (widths.length < windowSize) return widths;
  
  const smoothed: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < widths.length; i++) {
    let sum = 0;
    let count = 0;
    
    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < widths.length) {
        sum += widths[idx];
        count++;
      }
    }
    
    smoothed.push(sum / count);
  }
  
  return smoothed;
}

/**
 * Simplify path using Douglas-Peucker algorithm
 */
export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  
  // Helper: Calculate perpendicular distance from point to line
  const perpendicularDistance = (point: Point, lineStart: Point, lineEnd: Point): number => {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq === 0) {
      const pdx = point.x - lineStart.x;
      const pdy = point.y - lineStart.y;
      return Math.sqrt(pdx * pdx + pdy * pdy);
    }
    
    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    const pdx = point.x - projX;
    const pdy = point.y - projY;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  };
  
  const douglasPeucker = (pts: Point[], epsilon: number): Point[] => {
    if (pts.length <= 2) return pts;
    
    let maxDist = 0;
    let index = 0;
    const end = pts.length - 1;
    
    for (let i = 1; i < end; i++) {
      const dist = perpendicularDistance(pts[i], pts[0], pts[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    
    if (maxDist > epsilon) {
      const left = douglasPeucker(pts.slice(0, index + 1), epsilon);
      const right = douglasPeucker(pts.slice(index), epsilon);
      return left.slice(0, -1).concat(right);
    } else {
      return [pts[0], pts[end]];
    }
  };
  
  return douglasPeucker(points, tolerance);
}

// ============================================================================
// SVG Generation
// ============================================================================

/**
 * Generate SVG string from vector paths
 * 🔧 CRITICAL FIX: Use fill-rule="nonzero" to prevent evenodd punch-out effect
 */
export function generateSVG(
  paths: VectorPath[],
  width: number,
  height: number
): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
  
  for (const path of paths) {
    const stroke = path.type === 'stroke' ? (path.color || '#000000') : 'none';
    const strokeWidth = path.type === 'stroke' ? (path.strokeWidth || 2) : 0;
    
    // 🆕 Render geometric primitives
    if (path.primitive) {
      const prim = path.primitive;
      
      if (prim.type === 'circle') {
        svg += `  <circle cx="${prim.cx}" cy="${prim.cy}" r="${prim.r}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />\n`;
      } else if (prim.type === 'ellipse') {
        const transform = prim.angle ? ` transform="rotate(${prim.angle} ${prim.cx} ${prim.cy})"` : '';
        svg += `  <ellipse cx="${prim.cx}" cy="${prim.cy}" rx="${prim.rx}" ry="${prim.ry}"${transform} fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />\n`;
      }
    } else {
      // Standard path rendering
      const d = path.svgPath || pointsToSVGPath(path.points, path.closed);
      const fill = path.type === 'fill' ? (path.color || '#000000') : 'none';
      
      // 🎨 RapidResizer-style: Round caps and joins for smooth centerlines
      if (path.type === 'stroke') {
        svg += `  <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />\n`;
      } else {
        // Fill mode: use fill-rule="nonzero" to prevent punch-out
        svg += `  <path d="${d}" fill="${fill}" stroke="none" fill-rule="nonzero" />\n`;
      }
    }
  }
  
  svg += '</svg>';
  
  return svg;
}