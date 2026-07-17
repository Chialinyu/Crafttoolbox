/**
 * 🧹 Conservative Path Filtering
 * Only removes OBVIOUS noise - never touches potentially real content
 */

import type { VectorPath, Point } from './vectorization';

export function filterInsignificantPaths(
  paths: VectorPath[],
  imageWidth: number,
  imageHeight: number,
  detailLevel: number = 50 // 🆕 Detail preservation level (0-100, higher = keep more paths)
): VectorPath[] {
  if (paths.length === 0) return paths;
  
  // Pre-calculate metrics for all paths
  const pathMetrics = paths.map(path => computePathMetrics(path));
  
  // ========================================
  // STEP 1: Remove TINY noise (ultra-conservative)
  // ========================================
  // 🎯 Adaptive thresholds based on detail level (MASSIVELY EXPANDED RANGE)
  // detailLevel 0 (low detail) → aggressive filtering (remove small paths)
  // detailLevel 50 (balanced) → moderate filtering
  // detailLevel 100 (high detail) → almost NO filtering (keep everything except pure noise)
  
  // 🔧 MASSIVELY EXPANDED: detailLevel=100 should keep almost ALL paths
  const minPathLengthThreshold = 80 - (detailLevel / 100) * 75; // Range: 5-80 pixels (HUGE expansion)
  const minAreaThreshold = 800 - (detailLevel / 100) * 790; // Range: 10-800 pixels² (HUGE expansion)
  const minPointsThreshold = Math.max(2, 20 - Math.floor((detailLevel / 100) * 17)); // Range: 2-20 points (HUGE expansion)
  
  const filtered: VectorPath[] = [];
  const filteredMetrics: typeof pathMetrics = [];
  
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const metrics = pathMetrics[i];
    
    // 🚫 ONLY remove if ALL of these are true:
    const isTinyDot = (
      metrics.pathLength < minPathLengthThreshold &&
      metrics.bboxArea < minAreaThreshold &&
      metrics.pointCount < minPointsThreshold &&
      !path.primitive                     // Not a geometric shape
    );
    
    if (isTinyDot) {
      continue; // Skip this path
    }
    
    filtered.push(path);
    filteredMetrics.push(metrics);
  }
  
  // ========================================
  // STEP 2: Remove EXACT duplicates only
  // ========================================
  // Build map for O(1) metrics lookup
  const pathToMetrics = new Map<VectorPath, typeof pathMetrics[0]>();
  for (let i = 0; i < filtered.length; i++) {
    pathToMetrics.set(filtered[i], filteredMetrics[i]);
  }
  
  const deduplicated: VectorPath[] = [];
  
  for (let i = 0; i < filtered.length; i++) {
    const path1 = filtered[i];
    const metrics1 = filteredMetrics[i];
    
    // Check if this is a duplicate of a previous path
    let isDuplicate = false;
    
    for (const path2 of deduplicated) {
      const metrics2 = pathToMetrics.get(path2)!;
      
      // Check if centers are close (increased threshold)
      const centerDist = Math.sqrt(
        (metrics1.centerX - metrics2.centerX) ** 2 +
        (metrics1.centerY - metrics2.centerY) ** 2
      );
      
      // Check if sizes are similar
      const sizeDiff = Math.abs(metrics1.bboxArea - metrics2.bboxArea);
      const avgSize = (metrics1.bboxArea + metrics2.bboxArea) / 2;
      const sizeSimilarity = avgSize > 0 ? sizeDiff / avgSize : 1;
      
      // Check if lengths are similar
      const lengthDiff = Math.abs(metrics1.pathLength - metrics2.pathLength);
      const avgLength = (metrics1.pathLength + metrics2.pathLength) / 2;
      const lengthSimilarity = avgLength > 0 ? lengthDiff / avgLength : 1;
      
      // 🆕 Check if stroke widths are similar (for line mode)
      let strokeSimilarity = 0;
      if (path1.strokeWidth && path2.strokeWidth) {
        const strokeDiff = Math.abs(path1.strokeWidth - path2.strokeWidth);
        const avgStroke = (path1.strokeWidth + path2.strokeWidth) / 2;
        strokeSimilarity = avgStroke > 0 ? strokeDiff / avgStroke : 0;
      }
      
      // More aggressive duplicate detection
      // Small paths: tight threshold
      // Large paths: proportional threshold
      const isSmallPath = Math.max(metrics1.bboxArea, metrics2.bboxArea) < 500;
      const distanceThreshold = isSmallPath ? 20 : 40; // INCREASED!
      
      if (centerDist < distanceThreshold && 
          sizeSimilarity < 0.3 && 
          lengthSimilarity < 0.3 &&
          strokeSimilarity < 0.2) { // Stroke must be very similar
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      deduplicated.push(path1);
    }
  }
  
  // ========================================
  // STEP 3: Spatial clustering to remove dense groups of small paths
  // ========================================
  const imageDiagonal = Math.sqrt(imageWidth * imageWidth + imageHeight * imageHeight);
  const clusterRadius = imageDiagonal * 0.05; // INCREASED to 5% of diagonal
  
  const spatialFiltered: VectorPath[] = [];
  const usedIndices = new Set<number>();
  
  for (let i = 0; i < deduplicated.length; i++) {
    if (usedIndices.has(i)) continue;
    
    const path1 = deduplicated[i];
    const metrics1 = pathToMetrics.get(path1)!;
    
    // Find all nearby paths
    const nearbyPaths: Array<{path: VectorPath; metrics: typeof metrics1; index: number}> = [{
      path: path1,
      metrics: metrics1,
      index: i
    }];
    
    for (let j = i + 1; j < deduplicated.length; j++) {
      if (usedIndices.has(j)) continue;
      
      const path2 = deduplicated[j];
      const metrics2 = pathToMetrics.get(path2)!;
      
      const centerDist = Math.sqrt(
        (metrics1.centerX - metrics2.centerX) ** 2 +
        (metrics1.centerY - metrics2.centerY) ** 2
      );
      
      if (centerDist < clusterRadius) {
        nearbyPaths.push({path: path2, metrics: metrics2, index: j});
      }
    }
    
    // If there are multiple small paths in this cluster, keep only the best one
    if (nearbyPaths.length > 1) {
      // 🎯 Adaptive small path threshold based on detail level (EXPANDED RANGE)
      // At detailLevel=100, DON'T cluster paths unless they're VERY tiny
      const smallPathThreshold = 300 - (detailLevel / 100) * 250; // Range: 50-300 pixels (HUGE expansion)
      const allSmall = nearbyPaths.every(p => p.metrics.pathLength < smallPathThreshold);
      
      if (allSmall) {
        // Keep the longest/largest one
        nearbyPaths.sort((a, b) => 
          (b.metrics.pathLength + b.metrics.bboxArea) - 
          (a.metrics.pathLength + a.metrics.bboxArea)
        );
        
        // Mark all as used
        for (const p of nearbyPaths) {
          usedIndices.add(p.index);
        }
        
        // Keep only the best one
        spatialFiltered.push(nearbyPaths[0].path);
        continue;
      }
    }
    
    // No clustering needed, keep the path
    usedIndices.add(i);
    spatialFiltered.push(path1);
  }
  
  // ========================================
  // STEP 4: Remove isolated small paths (likely noise)
  // ========================================
  const finalFiltered: VectorPath[] = [];
  const connectionRadius = imageDiagonal * 0.03; // 3% of diagonal
  
  for (let i = 0; i < spatialFiltered.length; i++) {
    const path = spatialFiltered[i];
    const metrics = pathToMetrics.get(path)!;
    
    // ✅ ALWAYS keep geometric shapes (circles, ellipses - eyes, pupils, etc)
    if (path.primitive || path.closed) {
      finalFiltered.push(path);
      continue;
    }
    
    // ✅ ALWAYS keep paths with sharp angles (V, X, W, mouth shapes)
    const hasSharpAngle = metrics.maxAngleChange > Math.PI / 4; // > 45 degrees
    if (hasSharpAngle) {
      finalFiltered.push(path);
      continue;
    }
    
    // 🎯 Adaptive small path threshold based on detail level (EXPANDED RANGE)
    // At detailLevel=100, almost NEVER remove isolated paths
    const smallPathThreshold = 100 - (detailLevel / 100) * 90; // Range: 10-100 pixels (HUGE expansion)
    const isSmall = metrics.pathLength < smallPathThreshold;
    
    if (!isSmall) {
      // Keep all large paths
      finalFiltered.push(path);
      continue;
    }
    
    // 🎯 At high detail levels (>80), keep even isolated small paths
    if (detailLevel > 80) {
      finalFiltered.push(path);
      continue;
    }
    
    // For tiny paths at lower detail levels, check if they're connected to larger paths
    let hasNearbyLargePath = false;
    
    for (let j = 0; j < spatialFiltered.length; j++) {
      if (i === j) continue;
      
      const otherPath = spatialFiltered[j];
      const otherMetrics = pathToMetrics.get(otherPath)!;
      
      // Check if the other path is larger OR is a geometric shape
      // Use the same adaptive threshold for consistency
      if (otherMetrics.pathLength >= smallPathThreshold || otherPath.primitive || otherPath.closed) {
        const dist = Math.sqrt(
          (metrics.centerX - otherMetrics.centerX) ** 2 +
          (metrics.centerY - otherMetrics.centerY) ** 2
        );
        
        if (dist < connectionRadius) {
          hasNearbyLargePath = true;
          break;
        }
      }
    }
    
    // Keep small paths ONLY if they're near larger paths/shapes
    if (hasNearbyLargePath) {
      finalFiltered.push(path);
    }
  }
  
  return finalFiltered;
}

// ============================================================================
// Overlapping stroke dedupe — keep the smoother track
// ============================================================================

interface PathMetrics {
  pathLength: number;
  bboxWidth: number;
  bboxHeight: number;
  bboxArea: number;
  centerX: number;
  centerY: number;
  pointCount: number;
  maxAngleChange: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function computePathMetrics(path: VectorPath): PathMetrics {
  const samples = samplePathPoints(path, 48);

  let pathLength = 0;
  for (let i = 1; i < samples.length; i++) {
    pathLength += Math.hypot(
      samples[i].x - samples[i - 1].x,
      samples[i].y - samples[i - 1].y
    );
  }
  if (path.closed && samples.length > 2) {
    pathLength += Math.hypot(
      samples[0].x - samples[samples.length - 1].x,
      samples[0].y - samples[samples.length - 1].y
    );
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let centerX = 0;
  let centerY = 0;
  for (const pt of samples) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
    centerX += pt.x;
    centerY += pt.y;
  }
  if (samples.length > 0) {
    centerX /= samples.length;
    centerY /= samples.length;
  } else {
    minX = maxX = minY = maxY = centerX = centerY = 0;
  }

  let maxAngleChange = 0;
  if (samples.length >= 3) {
    for (let i = 1; i < samples.length - 1; i++) {
      const dx1 = samples[i].x - samples[i - 1].x;
      const dy1 = samples[i].y - samples[i - 1].y;
      const dx2 = samples[i + 1].x - samples[i].x;
      const dy2 = samples[i + 1].y - samples[i].y;
      const angle1 = Math.atan2(dy1, dx1);
      const angle2 = Math.atan2(dy2, dx2);
      let angleDiff = Math.abs(angle2 - angle1);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      maxAngleChange = Math.max(maxAngleChange, angleDiff);
    }
  }

  const bboxWidth = Math.max(0, maxX - minX);
  const bboxHeight = Math.max(0, maxY - minY);

  return {
    pathLength,
    bboxWidth,
    bboxHeight,
    bboxArea: bboxWidth * bboxHeight,
    centerX,
    centerY,
    pointCount: path.points.length || samples.length,
    maxAngleChange,
    minX,
    maxX,
    minY,
    maxY,
  };
}

/**
 * Among overlapping stroke paths on the same track, keep the smoothest one.
 * Typical cause: adjacent color regions each outline a shared edge — one via
 * Potrace/Bezier, another via a denser polyline.
 */
export function dedupeOverlappingStrokePaths(paths: VectorPath[]): VectorPath[] {
  if (paths.length < 2) return paths;

  const fills = paths.filter((p) => p.type !== 'stroke');
  const strokes = paths.filter((p) => p.type === 'stroke');
  if (strokes.length < 2) return paths;

  const samples = strokes.map((p) => samplePathPoints(p, 32));
  const quality = strokes.map((p) => strokePathQuality(p));
  const keep = new Array(strokes.length).fill(true);

  for (let i = 0; i < strokes.length; i++) {
    if (!keep[i] || samples[i].length < 2) continue;

    for (let j = i + 1; j < strokes.length; j++) {
      if (!keep[j] || samples[j].length < 2) continue;

      if (!bboxOverlapLoose(strokes[i], strokes[j], samples[i], samples[j], 8)) {
        continue;
      }

      const overlap =
        (coverageScore(samples[i], samples[j], 4.5) +
          coverageScore(samples[j], samples[i], 4.5)) /
        2;

      // Same track: majority of samples lie near the other path
      if (overlap < 0.62) continue;

      // Prefer higher-quality (smoother / primitive) stroke
      if (quality[i] >= quality[j]) {
        keep[j] = false;
      } else {
        keep[i] = false;
        break;
      }
    }
  }

  const keptStrokes = strokes.filter((_, idx) => keep[idx]);
  // Preserve original relative order: fills first (as emitted), then remaining strokes
  // Re-merge by walking original paths order
  const keptStrokeSet = new Set(keptStrokes);
  const result: VectorPath[] = [];
  for (const path of paths) {
    if (path.type !== 'stroke') {
      result.push(path);
    } else if (keptStrokeSet.has(path)) {
      result.push(path);
      keptStrokeSet.delete(path); // in case of identical refs
    }
  }
  return result;
}

function strokePathQuality(path: VectorPath): number {
  let score = 0;
  if (path.primitive) score += 1000;

  const d = path.svgPath || '';
  const cCount = (d.match(/\sC\s/g) || []).length;
  const lCount = (d.match(/\sL\s/g) || []).length;
  score += cCount * 8;
  score -= lCount * 2;

  // Fewer knots generally means cleaner vector curves
  const knots = path.points.length || estimateKnotsFromSvg(d);
  score -= Math.min(80, knots * 0.35);

  // Prefer closed intentional shapes slightly
  if (path.closed) score += 15;

  return score;
}

function estimateKnotsFromSvg(d: string): number {
  if (!d) return 0;
  return (d.match(/[MLC]/g) || []).length;
}

function bboxOverlapLoose(
  _a: VectorPath,
  _b: VectorPath,
  sa: Point[],
  sb: Point[],
  pad: number
): boolean {
  const ba = boundsOf(sa);
  const bb = boundsOf(sb);
  return !(
    ba.maxX + pad < bb.minX ||
    bb.maxX + pad < ba.minX ||
    ba.maxY + pad < bb.minY ||
    bb.maxY + pad < ba.minY
  );
}

function boundsOf(pts: Point[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

/** Fraction of points in `from` that lie within `tol` of polyline `to`. */
function coverageScore(from: Point[], to: Point[], tol: number): number {
  if (from.length === 0 || to.length < 2) return 0;
  let hits = 0;
  for (const p of from) {
    if (distanceToPolyline(p, to) <= tol) hits++;
  }
  return hits / from.length;
}

function distanceToPolyline(p: Point, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    best = Math.min(best, distanceToSegment(p, poly[i], poly[i + 1]));
  }
  // Closed-ish: also check last→first when endpoints are close
  if (poly.length > 2) {
    const a = poly[0];
    const b = poly[poly.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 6) {
      best = Math.min(best, distanceToSegment(p, b, a));
    }
  }
  return best;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Sample points along a path for geometry comparison.
 * Handles primitives, point arrays, and SVG path strings (Potrace).
 */
export function samplePathPoints(path: VectorPath, maxSamples: number = 32): Point[] {
  if (path.primitive) {
    return samplePrimitive(path.primitive, maxSamples);
  }

  if (path.points && path.points.length >= 2) {
    return resamplePoints(path.points, maxSamples, path.closed);
  }

  if (path.svgPath) {
    const extracted = extractPointsFromSvg(path.svgPath);
    if (extracted.length >= 2) {
      return resamplePoints(extracted, maxSamples, path.closed);
    }
  }

  return path.points ? [...path.points] : [];
}

function samplePrimitive(
  prim: NonNullable<VectorPath['primitive']>,
  maxSamples: number
): Point[] {
  const n = Math.max(8, maxSamples);
  if (prim.type === 'circle') {
    const pts: Point[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push({
        x: prim.cx + prim.r * Math.cos(a),
        y: prim.cy + prim.r * Math.sin(a),
      });
    }
    return pts;
  }
  if (prim.type === 'ellipse') {
    const pts: Point[] = [];
    const rad = ((prim.angle || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lx = prim.rx * Math.cos(a);
      const ly = prim.ry * Math.sin(a);
      pts.push({
        x: prim.cx + lx * cos - ly * sin,
        y: prim.cy + lx * sin + ly * cos,
      });
    }
    return pts;
  }
  if (prim.type === 'rectangle') {
    const hw = prim.width / 2;
    const hh = prim.height / 2;
    const rad = ((prim.angle || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ].map((p) => ({
      x: prim.cx + p.x * cos - p.y * sin,
      y: prim.cy + p.x * sin + p.y * cos,
    }));
    return resamplePoints(corners, maxSamples, true);
  }
  if (prim.type === 'polygon') {
    return resamplePoints(prim.points, maxSamples, true);
  }
  return [];
}

function resamplePoints(points: Point[], maxSamples: number, closed: boolean): Point[] {
  if (points.length <= maxSamples) return points;
  const pts = closed && points.length > 2
    ? [...points, points[0]]
    : points;

  let total = 0;
  const segLens: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segLens.push(len);
    total += len;
  }
  if (total < 1e-6) return points.slice(0, maxSamples);

  const out: Point[] = [];
  const step = total / maxSamples;
  let target = 0;
  let acc = 0;
  let seg = 0;
  out.push({ ...pts[0] });
  for (let s = 1; s < maxSamples; s++) {
    target = s * step;
    while (seg < segLens.length && acc + segLens[seg] < target) {
      acc += segLens[seg];
      seg++;
    }
    if (seg >= segLens.length) {
      out.push({ ...pts[pts.length - 1] });
      continue;
    }
    const localT = (target - acc) / Math.max(1e-8, segLens[seg]);
    const a = pts[seg];
    const b = pts[seg + 1];
    out.push({
      x: a.x + (b.x - a.x) * localT,
      y: a.y + (b.y - a.y) * localT,
    });
  }
  return out;
}

function extractPointsFromSvg(d: string): Point[] {
  const pts: Point[] = [];
  // Capture coordinate pairs after M/L/C/Q commands (take endpoints of cubics)
  const re = /([MLCQmlcq])([^MLCQmlcqZz]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1].toUpperCase();
    const nums = (match[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        pts.push({ x: nums[i], y: nums[i + 1] });
      }
    } else if (cmd === 'C') {
      // cubic: x1 y1 x2 y2 x y — keep endpoint
      for (let i = 0; i + 5 < nums.length; i += 6) {
        pts.push({ x: nums[i + 4], y: nums[i + 5] });
      }
    } else if (cmd === 'Q') {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        pts.push({ x: nums[i + 2], y: nums[i + 3] });
      }
    }
  }
  return pts;
}