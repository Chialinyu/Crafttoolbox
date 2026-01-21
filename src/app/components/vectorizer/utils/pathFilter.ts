/**
 * 🧹 Conservative Path Filtering
 * Only removes OBVIOUS noise - never touches potentially real content
 */

import type { VectorPath } from './vectorization';

export function filterInsignificantPaths(
  paths: VectorPath[],
  imageWidth: number,
  imageHeight: number,
  detailLevel: number = 50 // 🆕 Detail preservation level (0-100, higher = keep more paths)
): VectorPath[] {
  if (paths.length === 0) return paths;
  
  // Pre-calculate metrics for all paths
  const pathMetrics = paths.map(path => {
    // Calculate path length
    let pathLength = 0;
    for (let i = 1; i < path.points.length; i++) {
      const dx = path.points[i].x - path.points[i - 1].x;
      const dy = path.points[i].y - path.points[i - 1].y;
      pathLength += Math.sqrt(dx * dx + dy * dy);
    }
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const pt of path.points) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;
    const bboxArea = bboxWidth * bboxHeight;
    
    // Calculate center
    let centerX = 0, centerY = 0;
    for (const pt of path.points) {
      centerX += pt.x;
      centerY += pt.y;
    }
    centerX /= path.points.length;
    centerY /= path.points.length;
    
    // 🆕 Calculate angle changes (detect V, X, W shapes)
    let maxAngleChange = 0;
    if (path.points.length >= 3) {
      for (let i = 1; i < path.points.length - 1; i++) {
        const dx1 = path.points[i].x - path.points[i - 1].x;
        const dy1 = path.points[i].y - path.points[i - 1].y;
        const dx2 = path.points[i + 1].x - path.points[i].x;
        const dy2 = path.points[i + 1].y - path.points[i].y;
        
        const angle1 = Math.atan2(dy1, dx1);
        const angle2 = Math.atan2(dy2, dx2);
        let angleDiff = Math.abs(angle2 - angle1);
        
        // Normalize to 0-π
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        
        maxAngleChange = Math.max(maxAngleChange, angleDiff);
      }
    }
    
    return {
      pathLength,
      bboxWidth,
      bboxHeight,
      bboxArea,
      centerX,
      centerY,
      pointCount: path.points.length,
      maxAngleChange, // New!
    };
  });
  
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