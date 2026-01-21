/**
 * ============================================================================
 * SKELETONIZATION - Line Art to Skeleton Extraction
 * ============================================================================
 * 
 * PURPOSE:
 * Extract the center-line skeleton from line art for stroke-based vectorization.
 * 
 * ALGORITHM:
 * Zhang-Suen thinning algorithm - iterative morphological thinning
 * 
 * WORKFLOW:
 * Binary Image → Iterative Thinning → 1-pixel Skeleton → Path Tracing
 * 
 * ============================================================================
 */

/**
 * Zhang-Suen thinning algorithm
 * Reduces binary image to 1-pixel-wide skeleton while preserving connectivity
 * 
 * @param binary - Binary image (255 = foreground, 0 = background)
 * @param width - Image width
 * @param height - Image height
 * @returns Thinned skeleton
 */
export function zhangSuenThinning(
  binary: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const skeleton = new Uint8Array(binary);
  let hasChanged = true;
  let iteration = 0;
  const MAX_ITERATIONS = 100; // Prevent infinite loops
  
  // Count initial foreground pixels
  let initialCount = 0;
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] > 0) initialCount++;
  }
  
  while (hasChanged && iteration < MAX_ITERATIONS) {
    hasChanged = false;
    iteration++;
    
    // Two sub-iterations per iteration
    for (let subIter = 0; subIter < 2; subIter++) {
      const toDelete: number[] = [];
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          
          // Skip background pixels
          if (skeleton[idx] === 0) continue;
          
          // Get 8 neighbors (clockwise from top)
          // P9 P2 P3
          // P8 P1 P4
          // P7 P6 P5
          const p2 = skeleton[(y - 1) * width + x] > 0 ? 1 : 0;
          const p3 = skeleton[(y - 1) * width + (x + 1)] > 0 ? 1 : 0;
          const p4 = skeleton[y * width + (x + 1)] > 0 ? 1 : 0;
          const p5 = skeleton[(y + 1) * width + (x + 1)] > 0 ? 1 : 0;
          const p6 = skeleton[(y + 1) * width + x] > 0 ? 1 : 0;
          const p7 = skeleton[(y + 1) * width + (x - 1)] > 0 ? 1 : 0;
          const p8 = skeleton[y * width + (x - 1)] > 0 ? 1 : 0;
          const p9 = skeleton[(y - 1) * width + (x - 1)] > 0 ? 1 : 0;
          
          // Condition 1: 2 <= B(P1) <= 6
          // B(P1) = number of non-zero neighbors
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          
          // Condition 2: A(P1) = 1
          // A(P1) = number of 0-1 transitions in ordered sequence
          const a = transitions([p2, p3, p4, p5, p6, p7, p8, p9]);
          if (a !== 1) continue;
          
          // Condition 3 & 4 differ between sub-iterations
          if (subIter === 0) {
            // Sub-iteration 1: P2 * P4 * P6 = 0 AND P4 * P6 * P8 = 0
            if ((p2 * p4 * p6) !== 0) continue;
            if ((p4 * p6 * p8) !== 0) continue;
          } else {
            // Sub-iteration 2: P2 * P4 * P8 = 0 AND P2 * P6 * P8 = 0
            if ((p2 * p4 * p8) !== 0) continue;
            if ((p2 * p6 * p8) !== 0) continue;
          }
          
          // Mark for deletion
          toDelete.push(idx);
        }
      }
      
      // Delete marked pixels
      if (toDelete.length > 0) {
        hasChanged = true;
        for (const idx of toDelete) {
          skeleton[idx] = 0;
        }
      }
    }
  }
  
  // Count final foreground pixels
  let finalCount = 0;
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i] > 0) finalCount++;
  }
  
  return skeleton;
}

/**
 * Count 0→1 transitions in circular sequence
 */
function transitions(neighbors: number[]): number {
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const current = neighbors[i];
    const next = neighbors[(i + 1) % neighbors.length];
    if (current === 0 && next === 1) {
      count++;
    }
  }
  return count;
}

/**
 * Trace skeleton paths from thinned binary image
 * Returns array of polyline paths (each path is array of {x, y} points)
 */
export interface SkeletonPath {
  points: Array<{ x: number; y: number }>;
  isBranch: boolean; // Has junction/endpoint
}

export function traceSkeletonPaths(
  skeleton: Uint8Array,
  width: number,
  height: number,
  detailLevel: number = 50 // 🆕 Detail preservation level (0-100, higher = keep more paths)
): SkeletonPath[] {
  const visited = new Uint8Array(width * height);
  const paths: SkeletonPath[] = [];
  
  // Find all junction points and endpoints
  const junctions = findJunctions(skeleton, width, height);
  const endpoints = findEndpoints(skeleton, width, height);
  
  // 🎯 Adaptive minimum path length based on detail level
  // detailLevel 100 → keep even 1-point paths
  // detailLevel 0 → only keep paths with 3+ points
  const minPathPoints = detailLevel >= 80 ? 1 : (detailLevel >= 50 ? 2 : 3);
  
  // Start tracing from endpoints
  for (const endpoint of endpoints) {
    if (visited[endpoint.y * width + endpoint.x]) continue;
    
    const path = tracePath(skeleton, width, height, endpoint.x, endpoint.y, visited, junctions);
    if (path.points.length >= minPathPoints) {
      paths.push(path);
    }
  }
  
  // Trace from junctions (to capture all branches)
  for (const junctionIdx of junctions) {
    const jx = junctionIdx % width;
    const jy = Math.floor(junctionIdx / width);
    
    // 🆕 For X-crossings (4 neighbors), extract all 4 directions as separate paths
    const junctionNeighbors: Array<{ x: number; y: number }> = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = jx + dx;
        const ny = jy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        
        const nidx = ny * width + nx;
        if (skeleton[nidx] === 0) continue;
        junctionNeighbors.push({ x: nx, y: ny });
      }
    }
    
    // 🎯 For X-junctions (4 neighbors), create 2 continuous paths by pairing opposite directions
    if (junctionNeighbors.length === 4) {
      // Reset visited for this junction temporarily
      const jidx = jy * width + jx;
      const wasVisited = visited[jidx];
      visited[jidx] = 0; // Allow path to pass through
      
      let pathCount = 0;
      // Trace from each unvisited neighbor
      for (const neighbor of junctionNeighbors) {
        const nidx = neighbor.y * width + neighbor.x;
        if (visited[nidx]) continue;
        
        const path = tracePath(skeleton, width, height, neighbor.x, neighbor.y, visited, junctions);
        if (path.points.length >= minPathPoints) {
          pathCount++;
          paths.push(path);
        }
      }
      
      visited[jidx] = wasVisited; // Restore
    } else {
      // Regular junction (T/Y-shape) - trace from unvisited neighbors
      for (const neighbor of junctionNeighbors) {
        const nidx = neighbor.y * width + neighbor.x;
        if (visited[nidx]) continue;
        
        const path = tracePath(skeleton, width, height, neighbor.x, neighbor.y, visited, junctions);
        if (path.points.length >= minPathPoints) {
          paths.push(path);
        }
      }
    }
  }
  
  // Trace remaining unvisited pixels (loops and isolated segments)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (skeleton[idx] > 0 && !visited[idx]) {
        const path = tracePath(skeleton, width, height, x, y, visited, junctions);
        if (path.points.length >= minPathPoints) {
          paths.push(path);
        }
      }
    }
  }
  
  // Analyze path length distribution
  const pathLengths = paths.map(p => p.points.length);
  const shortPaths = pathLengths.filter(len => len <= 5).length;
  const mediumPaths = pathLengths.filter(len => len > 5 && len <= 20).length;
  const longPaths = pathLengths.filter(len => len > 20).length;
  const avgLength = pathLengths.length > 0 ? (pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length).toFixed(1) : 0;
  
  // 🔧 POST-PROCESSING: Merge paths with nearby endpoints (gap closing)
  // 🆕 Increased gap from 5px to 15px to reconnect X-crossings that Zhang-Suen cut apart
  const mergedPaths = mergeNearbyPaths(paths, 15); // 15px max gap (was 5px)
  
  // 🎯 X-CROSSING RECONSTRUCTION: Merge collinear paths (same direction)
  // This specifically fixes X-shapes (mouth / \\) that got split into 4+ segments
  // 🆕 Iterative approach: repeat until no more merges possible
  let reconstructedPaths = mergedPaths;
  let iteration = 0;
  let totalMerged = 0;
  
  while (iteration < 5) { // Max 5 iterations to prevent infinite loops
    const prevCount = reconstructedPaths.length;
    reconstructedPaths = mergeCollinearPaths(reconstructedPaths, 40); // 40px max gap (was 25px)
    const merged = prevCount - reconstructedPaths.length;
    
    totalMerged += merged;
    iteration++;
    
    if (merged === 0) break; // No more merges possible
  }
  
  // 🆕 FINAL CLEANUP: Remove sub-paths (duplicates created during iterative merging)
  const cleanedPaths = removeSubPaths(reconstructedPaths, detailLevel);
  
  return cleanedPaths;
}

/**
 * 🆕 Merge paths whose endpoints are very close (gap closing)
 * This fixes small breaks in the skeleton caused by thinning artifacts
 */
function mergeNearbyPaths(paths: SkeletonPath[], maxGap: number): SkeletonPath[] {
  if (paths.length === 0) return paths;
  
  const merged: SkeletonPath[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < paths.length; i++) {
    if (used.has(i)) continue;
    
    let currentPath = paths[i];
    let didMerge = true;
    
    // Keep trying to extend this path until no more merges possible
    while (didMerge) {
      didMerge = false;
      
      const start = currentPath.points[0];
      const end = currentPath.points[currentPath.points.length - 1];
      
      // Try to find a nearby path to merge with
      for (let j = 0; j < paths.length; j++) {
        if (j === i || used.has(j)) continue;
        
        const otherPath = paths[j];
        const otherStart = otherPath.points[0];
        const otherEnd = otherPath.points[otherPath.points.length - 1];
        
        // Check all 4 possible connections
        const distEndToStart = distance(end, otherStart);
        const distEndToEnd = distance(end, otherEnd);
        const distStartToStart = distance(start, otherStart);
        const distStartToEnd = distance(start, otherEnd);
        
        const minDist = Math.min(distEndToStart, distEndToEnd, distStartToStart, distStartToEnd);
        
        if (minDist <= maxGap) {
          // Merge!
          used.add(j);
          didMerge = true;
          
          if (minDist === distEndToStart) {
            // Append otherPath to end of currentPath
            currentPath = {
              points: [...currentPath.points, ...otherPath.points],
              isBranch: currentPath.isBranch || otherPath.isBranch,
            };
          } else if (minDist === distEndToEnd) {
            // Append reversed otherPath to end
            currentPath = {
              points: [...currentPath.points, ...otherPath.points.slice().reverse()],
              isBranch: currentPath.isBranch || otherPath.isBranch,
            };
          } else if (minDist === distStartToStart) {
            // Prepend reversed otherPath to start
            currentPath = {
              points: [...otherPath.points.slice().reverse(), ...currentPath.points],
              isBranch: currentPath.isBranch || otherPath.isBranch,
            };
          } else {
            // Prepend otherPath to start
            currentPath = {
              points: [...otherPath.points, ...currentPath.points],
              isBranch: currentPath.isBranch || otherPath.isBranch,
            };
          }
          
          break; // Found a merge, restart search
        }
      }
    }
    
    merged.push(currentPath);
    used.add(i);
  }
  
  return merged;
}

/**
 * 🆕 Merge collinear paths (same direction)
 * This specifically fixes X-shapes (mouth / \\) that got split into 4+ segments
 */
function mergeCollinearPaths(paths: SkeletonPath[], maxGap: number): SkeletonPath[] {
  if (paths.length === 0) return paths;
  
  const merged: SkeletonPath[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < paths.length; i++) {
    if (used.has(i)) continue;
    
    let currentPath = paths[i];
    let didMerge = true;
    
    // Keep trying to extend this path until no more merges possible
    while (didMerge) {
      didMerge = false;
      
      const start = currentPath.points[0];
      const end = currentPath.points[currentPath.points.length - 1];
      
      // Try to find a nearby path to merge with
      for (let j = 0; j < paths.length; j++) {
        if (j === i || used.has(j)) continue;
        
        const otherPath = paths[j];
        const otherStart = otherPath.points[0];
        const otherEnd = otherPath.points[otherPath.points.length - 1];
        
        // Check all 4 possible connections
        const distEndToStart = distance(end, otherStart);
        const distEndToEnd = distance(end, otherEnd);
        const distStartToStart = distance(start, otherStart);
        const distStartToEnd = distance(start, otherEnd);
        
        const minDist = Math.min(distEndToStart, distEndToEnd, distStartToStart, distStartToEnd);
        
        if (minDist <= maxGap) {
          // Check if paths are collinear (same direction)
          const isCollinear = isCollinearPaths(currentPath, otherPath, minDist);
          
          if (isCollinear) {
            // Merge!
            used.add(j);
            didMerge = true;
            
            if (minDist === distEndToStart) {
              // Append otherPath to end of currentPath
              currentPath = {
                points: [...currentPath.points, ...otherPath.points],
                isBranch: currentPath.isBranch || otherPath.isBranch,
              };
            } else if (minDist === distEndToEnd) {
              // Append reversed otherPath to end
              currentPath = {
                points: [...currentPath.points, ...otherPath.points.slice().reverse()],
                isBranch: currentPath.isBranch || otherPath.isBranch,
              };
            } else if (minDist === distStartToStart) {
              // Prepend reversed otherPath to start
              currentPath = {
                points: [...otherPath.points.slice().reverse(), ...currentPath.points],
                isBranch: currentPath.isBranch || otherPath.isBranch,
              };
            } else {
              // Prepend otherPath to start
              currentPath = {
                points: [...otherPath.points, ...currentPath.points],
                isBranch: currentPath.isBranch || otherPath.isBranch,
              };
            }
            
            break; // Found a merge, restart search
          }
        }
      }
    }
    
    merged.push(currentPath);
    used.add(i);
  }
  
  return merged;
}

/**
 * 🆕 Check if two paths are collinear (same direction)
 */
function isCollinearPaths(path1: SkeletonPath, path2: SkeletonPath, connectionDist: number): boolean {
  // Get endpoints
  const p1Start = path1.points[0];
  const p1End = path1.points[path1.points.length - 1];
  const p2Start = path2.points[0];
  const p2End = path2.points[path2.points.length - 1];
  
  // Skip if paths are too long (likely already merged correctly)
  if (path1.points.length > 50 || path2.points.length > 50) return false;
  
  // Calculate direction vectors using first/last 3 points for stability
  const getDirection = (path: SkeletonPath, fromEnd: boolean): { x: number; y: number } => {
    const pts = path.points;
    if (pts.length < 2) return { x: 0, y: 0 };
    
    const numPts = Math.min(3, pts.length);
    const start = fromEnd ? pts[pts.length - numPts] : pts[0];
    const end = fromEnd ? pts[pts.length - 1] : pts[numPts - 1];
    
    return {
      x: end.x - start.x,
      y: end.y - start.y,
    };
  };
  
  // Try all 4 possible connections
  const connections = [
    { p1End: false, p2End: false, dist: distance(p1Start, p2Start) }, // Start-Start
    { p1End: false, p2End: true, dist: distance(p1Start, p2End) },   // Start-End
    { p1End: true, p2End: false, dist: distance(p1End, p2Start) },   // End-Start
    { p1End: true, p2End: true, dist: distance(p1End, p2End) },      // End-End
  ];
  
  // Find closest connection
  const closest = connections.reduce((min, conn) => conn.dist < min.dist ? conn : min);
  
  // Get directions at connection point
  const dir1 = getDirection(path1, closest.p1End);
  const dir2 = getDirection(path2, closest.p2End);
  
  // Normalize
  const norm1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y);
  const norm2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y);
  
  if (norm1 < 1 || norm2 < 1) return false; // Too short
  
  let unitDir1 = { x: dir1.x / norm1, y: dir1.y / norm1 };
  let unitDir2 = { x: dir2.x / norm2, y: dir2.y / norm2 };
  
  // 🐛 FIX: Flip dir2 if connecting matching ends (End-End or Start-Start)
  // For these cases, we need to reverse path2's direction to align with path1
  const needsFlip = closest.p1End === closest.p2End;
  if (needsFlip) {
    unitDir2 = { x: -unitDir2.x, y: -unitDir2.y };
  }
  
  // Calculate dot product (now both directions should point "forward" along the merged path)
  const dotProduct = unitDir1.x * unitDir2.x + unitDir1.y * unitDir2.y;
  
  // Collinear if dot product > 0.7 (about 45° tolerance) - relaxed from 0.85
  const isCollinear = dotProduct > 0.7;
  
  // 🐛 DEBUG: Log all near-collinear attempts (even failed ones)
  if (connectionDist < 25) {
    const angleDeg = (Math.acos(Math.min(1, Math.max(-1, dotProduct))) * 180 / Math.PI).toFixed(1);
  }
  
  return isCollinear;
}

/**
 * 🆕 Check if path1 is a sub-path of path2 (contained within)
 * Used to detect duplicate segments created during iterative merging
 * 
 * @param detailLevel - Detail preservation level (0-100)
 *   - Higher values = stricter sub-path detection (keep more independent paths)
 *   - Lower values = looser sub-path detection (remove more potential duplicates)
 */
function isSubPath(shorter: SkeletonPath, longer: SkeletonPath, detailLevel: number = 50): boolean {
  if (shorter.points.length >= longer.points.length) return false;
  if (shorter.points.length < 2 || longer.points.length < 2) return false;
  
  // 🎯 Adaptive tolerance based on detail level
  // detailLevel 0 (low detail) → tolerance = 10px (aggressive removal)
  // detailLevel 50 (balanced) → tolerance = 5px (moderate)
  // detailLevel 100 (high detail) → tolerance = 2px (strict, keep more)
  const tolerance = 10 - (detailLevel / 100) * 8; // Range: 2-10 pixels
  
  // Check if shorter path's endpoints are close to ANY points in longer path
  const shorterStart = shorter.points[0];
  const shorterEnd = shorter.points[shorter.points.length - 1];
  
  let foundStart = false;
  let foundEnd = false;
  
  for (const point of longer.points) {
    if (distance(shorterStart, point) < tolerance) foundStart = true;
    if (distance(shorterEnd, point) < tolerance) foundEnd = true;
    
    if (foundStart && foundEnd) {
      // 🆕 ADDITIONAL CHECK: Verify that shorter path is actually contained
      // by checking if most of its points are close to the longer path
      let containedPoints = 0;
      const sampleSize = Math.min(shorter.points.length, 10); // Sample up to 10 points
      const step = Math.max(1, Math.floor(shorter.points.length / sampleSize));
      
      for (let i = 0; i < shorter.points.length; i += step) {
        const sp = shorter.points[i];
        for (const lp of longer.points) {
          if (distance(sp, lp) < tolerance) {
            containedPoints++;
            break;
          }
        }
      }
      
      const containmentRatio = containedPoints / Math.ceil(shorter.points.length / step);
      // Require at least 80% of sampled points to be contained
      return containmentRatio >= 0.8;
    }
  }
  
  return false;
}

/**
 * 🆕 Remove sub-paths (duplicates created during iterative merging)
 * 
 * @param detailLevel - Detail preservation level (0-100, higher = keep more paths)
 */
function removeSubPaths(paths: SkeletonPath[], detailLevel: number = 50): SkeletonPath[] {
  const cleaned: SkeletonPath[] = [];
  
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    let isSub = false;
    
    for (let j = 0; j < paths.length; j++) {
      if (i === j) continue;
      
      if (isSubPath(path, paths[j], detailLevel)) {
        isSub = true;
        break;
      }
    }
    
    if (!isSub) {
      cleaned.push(path);
    }
  }
  
  return cleaned;
}

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 🆕 Compute distance transform using approximation
 * For each foreground pixel, calculates distance to nearest background pixel
 * This is used to detect stroke width in line art
 * 
 * @param binary - Binary image (255 = foreground, 0 = background)
 * @param width - Image width
 * @param height - Image height
 * @returns Distance map (Float32Array of distances)
 */
export function computeDistanceTransform(
  binary: Uint8Array,
  width: number,
  height: number
): Float32Array {
  const distances = new Float32Array(width * height);
  
  // Initialize: foreground = infinity, background = 0
  for (let i = 0; i < binary.length; i++) {
    distances[i] = binary[i] > 0 ? Infinity : 0;
  }
  
  // Two-pass algorithm (Chamfer distance approximation)
  // Forward pass: top-left to bottom-right
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      if (binary[idx] === 0) continue; // Skip background
      
      // Check 4 neighbors (top-left, top, top-right, left)
      const top = distances[(y - 1) * width + x] + 1;
      const left = distances[y * width + (x - 1)] + 1;
      const topLeft = distances[(y - 1) * width + (x - 1)] + 1.414; // sqrt(2)
      const topRight = distances[(y - 1) * width + (x + 1)] + 1.414;
      
      distances[idx] = Math.min(distances[idx], top, left, topLeft, topRight);
    }
  }
  
  // Backward pass: bottom-right to top-left
  for (let y = height - 2; y >= 1; y--) {
    for (let x = width - 2; x >= 1; x--) {
      const idx = y * width + x;
      
      if (binary[idx] === 0) continue; // Skip background
      
      // Check 4 neighbors (bottom-right, bottom, bottom-left, right)
      const bottom = distances[(y + 1) * width + x] + 1;
      const right = distances[y * width + (x + 1)] + 1;
      const bottomRight = distances[(y + 1) * width + (x + 1)] + 1.414;
      const bottomLeft = distances[(y + 1) * width + (x - 1)] + 1.414;
      
      distances[idx] = Math.min(distances[idx], bottom, right, bottomRight, bottomLeft);
    }
  }
  
  return distances;
}

/**
 * Find junction points (pixels with >2 neighbors)
 */
function findJunctions(
  skeleton: Uint8Array,
  width: number,
  height: number
): Set<number> {
  const junctions = new Set<number>();
  
  let cnStats = { cn0: 0, cn1: 0, cn2: 0, cn3plus: 0, xCross: 0 };
  const cn2Points: Array<{ x: number; y: number; neighbors: number }> = []; // 🆕 Track CN=2 points
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (skeleton[idx] === 0) continue;
      
      // 🆕 Use Crossing Number instead of neighbor count
      const cn = getCrossingNumber(skeleton, width, height, x, y);
      const neighborCount = countNeighbors(skeleton, width, height, x, y);
      
      // Track statistics
      if (cn === 0) cnStats.cn0++;
      else if (cn === 1) cnStats.cn1++;
      else if (cn === 2) {
        cnStats.cn2++;
        cn2Points.push({ x, y, neighbors: neighborCount }); // 🆕 Record CN=2 points
      }
      else cnStats.cn3plus++;
      
      // 🎯 Junction detection:
      // 1. CN ≥ 3: T/Y-shaped junctions
      // 2. CN = 2 with 4 neighbors: X-shaped crossings
      // 3. CN ≥ 2 with 4 neighbors in diagonal pattern: X-crossings that got thinned
      const isXCrossing = neighborCount === 4 && (cn === 2 || (cn >= 2 && hasDiagonalPattern(skeleton, width, height, x, y)));
      
      // 🆕 RELAXED X-detection: Also detect thin X-crossings with 3-4 neighbors and CN=2
      // This catches elongated X-shapes (like mouth / \) that Zhang-Suen thinned aggressively
      const isThinXCrossing = (neighborCount >= 3 && cn === 2);
      
      const isJunction = cn >= 3 || isXCrossing || isThinXCrossing;
      
      if (isJunction) {
        junctions.add(idx);
        if (isXCrossing) {
          cnStats.xCross++;
        }
      }
    }
  }
  
  return junctions;
}

/**
 * Calculate Crossing Number (CN) - topological branch detection
 */
function getCrossingNumber(
  skeleton: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  // 8-neighborhood in clockwise order: N, NE, E, SE, S, SW, W, NW
  const offsets = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1]
  ];
  
  const values: number[] = [];
  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      values.push(skeleton[ny * width + nx] > 0 ? 1 : 0);
    } else {
      values.push(0);
    }
  }
  
  // Count 0→1 transitions
  let transitions = 0;
  for (let i = 0; i < 8; i++) {
    if (values[i] === 0 && values[(i + 1) % 8] === 1) {
      transitions++;
    }
  }
  
  return Math.floor(transitions / 2);
}

/**
 * Count 8-connected neighbors
 */
function countNeighbors(
  skeleton: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (skeleton[ny * width + nx] > 0) count++;
      }
    }
  }
  return count;
}

/**
 * Check if 4 neighbors form a diagonal X pattern (NE, SE, SW, NW all filled)
 * This helps detect X-crossings that Zhang-Suen thinned to a single point
 */
function hasDiagonalPattern(
  skeleton: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  // Check if all 4 diagonal neighbors exist
  const NE = skeleton[(y - 1) * width + (x + 1)] > 0;
  const SE = skeleton[(y + 1) * width + (x + 1)] > 0;
  const SW = skeleton[(y + 1) * width + (x - 1)] > 0;
  const NW = skeleton[(y - 1) * width + (x - 1)] > 0;
  
  // X-pattern: opposite diagonals are filled
  // Pattern 1: NE-SW diagonal
  // Pattern 2: NW-SE diagonal
  const hasPattern1 = NE && SW;
  const hasPattern2 = NW && SE;
  
  return (hasPattern1 && hasPattern2); // Both diagonals present = X-crossing
}

/**
 * Find endpoint pixels (pixels with exactly 1 neighbor)
 */
function findEndpoints(
  skeleton: Uint8Array,
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  const endpoints: Array<{ x: number; y: number }> = [];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (skeleton[idx] === 0) continue;
      
      // Count 8-connected neighbors
      let neighborCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (skeleton[(y + dy) * width + (x + dx)] > 0) {
            neighborCount++;
          }
        }
      }
      
      // Endpoint = exactly 1 neighbor
      if (neighborCount === 1) {
        endpoints.push({ x, y });
      }
    }
  }
  
  return endpoints;
}

/**
 * Trace a single path from starting point
 */
function tracePath(
  skeleton: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  visited: Uint8Array,
  junctions: Set<number>
): SkeletonPath {
  const points: Array<{ x: number; y: number }> = [];
  let x = startX;
  let y = startY;
  let isBranch = false;
  let passedThroughJunction = false; // 🆕 Track if we passed through any junction
  
  // Previous direction (for maintaining continuity)
  let prevDx = 0;
  let prevDy = 0;
  
  while (true) {
    const idx = y * width + x;
    
    // Mark visited
    visited[idx] = 1;
    points.push({ x, y });
    
    // Check if junction
    if (junctions.has(idx) && points.length > 1) { // Don't stop at start junction
      isBranch = true;
      // 🆕 DON'T stop at junctions anymore - continue tracing through X-crossings!
      // This allows X-shapes to be traced as two complete lines (/ and \)
      // instead of stopping at the center and creating two V-shapes
      // break; // REMOVED - was cutting X-junctions into V-shapes
      passedThroughJunction = true; // 🆕 Mark that we passed through a junction
    }
    
    // Find next unvisited neighbor (prefer continuing in same direction)
    const neighbors: Array<{ x: number; y: number; dx: number; dy: number; score: number }> = [];
    
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        
        const nidx = ny * width + nx;
        if (skeleton[nidx] === 0) continue;
        
        // 🆕 Allow passing through visited JUNCTION points (for X-crossings)
        // But still skip visited non-junction points
        const isJunction = junctions.has(nidx);
        if (visited[nidx] && !isJunction) continue;
        
        // Score neighbor: prefer continuing in same direction
        let score = 0;
        if (prevDx !== 0 || prevDy !== 0) {
          // Dot product with previous direction (higher = more aligned)
          score = dx * prevDx + dy * prevDy;
          // Prefer straight continuation (score = 1 or 2) over diagonal turns
          if (Math.abs(dx) + Math.abs(dy) === 1) score += 0.5; // Straight = bonus
        }
        
        neighbors.push({ x: nx, y: ny, dx, dy, score });
      }
    }
    
    if (neighbors.length === 0) break; // No more neighbors
    
    // Sort by score (highest first) and pick best
    neighbors.sort((a, b) => b.score - a.score);
    const next = neighbors[0];
    
    prevDx = next.dx;
    prevDy = next.dy;
    x = next.x;
    y = next.y;
  }
  
  // 🆕 If we passed through a junction, mark the path as a branch
  if (passedThroughJunction) {
    isBranch = true;
  }
  
  return { points, isBranch };
}

// ============================================================================
// CONTOUR EXTRACTION - For closed shapes (like eyes, circles)
// ============================================================================

export interface ContourPath {
  points: Array<{ x: number; y: number }>;
  area: number; // Area of the region (to filter small noise)
}

/**
 * 🆕 Extract contours from closed regions (alternative to skeletonization)
 * Used for shapes like circles, eyes, etc. that should preserve outer boundary
 */
export function extractContours(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea: number = 20 // Minimum area to consider (filter noise)
): ContourPath[] {
  const visited = new Uint8Array(width * height);
  const contours: ContourPath[] = [];
  
  // Find all connected components (flood fill)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      // Found unvisited foreground pixel
      if (binary[idx] > 0 && !visited[idx]) {
        // Extract this region's contour
        const contour = traceRegionContour(binary, width, height, x, y, visited);
        
        // Only keep if large enough
        if (contour.area >= minArea) {
          contours.push(contour);
        }
      }
    }
  }
  
  return contours;
}

/**
 * Trace the boundary contour of a connected region using Moore's boundary tracing
 */
function traceRegionContour(
  binary: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  visited: Uint8Array
): ContourPath {
  const regionPixels: Array<{ x: number; y: number }> = [];
  
  // Flood fill to mark all pixels in this region
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const idx = y * width + x;
    
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (binary[idx] === 0) continue;
    if (visited[idx]) continue;
    
    visited[idx] = 1;
    regionPixels.push({ x, y });
    
    // Add 4-connected neighbors
    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }
  
  // Find boundary pixels (pixels with at least one background neighbor)
  const boundaryPixels = regionPixels.filter(p => {
    const idx = p.y * width + p.x;
    
    // Check 8-connected neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = p.x + dx;
        const ny = p.y + dy;
        
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return true; // Edge = boundary
        
        const nidx = ny * width + nx;
        if (binary[nidx] === 0) return true; // Has background neighbor
      }
    }
    
    return false; // Interior pixel
  });
  
  // Order boundary pixels to form a continuous path
  const orderedBoundary = orderBoundaryPixels(boundaryPixels);
  
  return {
    points: orderedBoundary,
    area: regionPixels.length,
  };
}

/**
 * Order boundary pixels into a continuous path (simple nearest-neighbor)
 */
function orderBoundaryPixels(pixels: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (pixels.length === 0) return [];
  
  const ordered: Array<{ x: number; y: number }> = [pixels[0]];
  const remaining = new Set(pixels.slice(1).map((_, i) => i + 1));
  
  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = -1;
    let nearestDist = Infinity;
    
    for (const idx of remaining) {
      const dist = distance(last, pixels[idx]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    }
    
    if (nearestIdx >= 0) {
      ordered.push(pixels[nearestIdx]);
      remaining.delete(nearestIdx);
    } else {
      break; // No more reachable pixels
    }
  }
  
  return ordered;
}

/**
 * 🆕 Smooth contour points using moving average filter
 * Reduces jaggedness from pixel-level boundary extraction
 */
export function smoothContourPoints(
  points: Array<{ x: number; y: number }>,
  windowSize: number = 5 // Must be odd number
): Array<{ x: number; y: number }> {
  if (points.length < windowSize) return points;
  
  const smoothed: Array<{ x: number; y: number }> = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < points.length; i++) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    
    // Average over window
    for (let j = -halfWindow; j <= halfWindow; j++) {
      // Circular indexing for closed paths
      const idx = (i + j + points.length) % points.length;
      sumX += points[idx].x;
      sumY += points[idx].y;
      count++;
    }
    
    smoothed.push({
      x: sumX / count,
      y: sumY / count,
    });
  }
  
  return smoothed;
}

/**
 * 🆕 Morphological closing operation (dilation followed by erosion)
 * Connects nearby line segments and fills small gaps
 */
export function morphologicalClose(
  binary: Uint8Array,
  width: number,
  height: number,
  iterations: number = 1
): Uint8Array {
  let result = new Uint8Array(binary);
  
  // Dilate
  for (let iter = 0; iter < iterations; iter++) {
    const dilated = new Uint8Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // If any neighbor is foreground, set to foreground
        if (result[idx] > 0 ||
            result[idx - 1] > 0 || result[idx + 1] > 0 ||
            result[idx - width] > 0 || result[idx + width] > 0) {
          dilated[idx] = 255;
        }
      }
    }
    
    result = dilated;
  }
  
  // Erode
  for (let iter = 0; iter < iterations; iter++) {
    const eroded = new Uint8Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // If all neighbors are foreground, set to foreground
        if (result[idx] > 0 &&
            result[idx - 1] > 0 && result[idx + 1] > 0 &&
            result[idx - width] > 0 && result[idx + width] > 0) {
          eroded[idx] = 255;
        }
      }
    }
    
    result = eroded;
  }
  
  return result;
}