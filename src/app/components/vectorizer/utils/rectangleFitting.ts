/**
 * ============================================================================
 * RECTANGLE & POLYGON FITTING - Geometric primitive detection
 * ============================================================================
 * 
 * Detects and fits angular geometric shapes:
 * - Rectangle/Square: 4 corners with right angles
 * - Triangle: 3 corners
 * 
 * Output: SVG primitives instead of complex path approximations
 */

import type { RectanglePrimitive, PolygonPrimitive } from './vectorization';

interface Corner {
  x: number;
  y: number;
  angle: number;
}

/**
 * Detect if shape is a rectangle/square
 */
export function detectRectangle(
  pixels: Array<{ x: number; y: number }>,
  angleThreshold: number = 15 // Degrees tolerance for right angles
): RectanglePrimitive | null {
  if (pixels.length < 8) return null;

  // Find contour (boundary pixels)
  const contour = extractContour(pixels);
  if (contour.length < 4) return null;

  // Detect corners using Douglas-Peucker simplification
  const epsilon = Math.sqrt(pixels.length) * 0.5; // Adaptive threshold
  const simplified = douglasPeucker(contour, epsilon);

  // Check if we have 4 corners (rectangle/square)
  if (simplified.length === 4 || simplified.length === 5) {
    const corners = simplified.length === 5 ? simplified.slice(0, 4) : simplified;
    
    // Validate angles are close to 90 degrees
    const angles = calculateCornerAngles(corners);
    const allRightAngles = angles.every(angle => {
      const deviation = Math.abs(angle - 90);
      return deviation < angleThreshold;
    });

    if (allRightAngles) {
      // Calculate rectangle properties
      const { cx, cy, width, height, angle } = calculateRectangleParams(corners);
      
      return {
        type: 'rectangle',
        cx,
        cy,
        width,
        height,
        angle, // Rotation angle in degrees
      };
    }
  }

  return null;
}

/**
 * Detect if shape is a triangle
 */
export function detectTriangle(
  pixels: Array<{ x: number; y: number }>
): PolygonPrimitive | null {
  if (pixels.length < 6) return null;

  const contour = extractContour(pixels);
  if (contour.length < 3) return null;

  // Douglas-Peucker simplification
  const epsilon = Math.sqrt(pixels.length) * 0.5;
  const simplified = douglasPeucker(contour, epsilon);

  // Check if we have 3 corners (triangle)
  if (simplified.length === 3 || simplified.length === 4) {
    const corners = simplified.length === 4 ? simplified.slice(0, 3) : simplified;
    
    return {
      type: 'polygon',
      points: corners,
      sides: 3,
    };
  }

  return null;
}

/**
 * Extract contour (boundary pixels) from pixel set
 */
function extractContour(pixels: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (pixels.length === 0) return [];

  // Create pixel set for fast lookup
  const pixelSet = new Set(pixels.map(p => `${p.x},${p.y}`));

  // Find boundary pixels (pixels with at least one non-filled neighbor)
  const contour: Array<{ x: number; y: number }> = [];
  
  for (const pixel of pixels) {
    const { x, y } = pixel;
    
    // Check 8 neighbors
    let isBoundary = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const key = `${x + dx},${y + dy}`;
        if (!pixelSet.has(key)) {
          isBoundary = true;
          break;
        }
      }
      if (isBoundary) break;
    }
    
    if (isBoundary) {
      contour.push(pixel);
    }
  }

  // Sort contour pixels in clockwise order
  return sortContourClockwise(contour);
}

/**
 * Sort contour pixels in clockwise order starting from top-left
 */
function sortContourClockwise(contour: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (contour.length === 0) return [];

  // Find centroid
  let cx = 0, cy = 0;
  for (const p of contour) {
    cx += p.x;
    cy += p.y;
  }
  cx /= contour.length;
  cy /= contour.length;

  // Sort by angle from centroid
  return contour.sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
}

/**
 * Douglas-Peucker line simplification algorithm
 * Reduces contour to key corner points
 */
function douglasPeucker(
  points: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;

  // Find point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIndex = 0;
  
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIndex), epsilon);
    
    // Combine results (remove duplicate middle point)
    return [...left.slice(0, -1), ...right];
  } else {
    // All points are close to line, just keep endpoints
    return [first, last];
  }
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  if (dx === 0 && dy === 0) {
    // Line is a point
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }
  
  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  const denominator = Math.sqrt(dx * dx + dy * dy);
  
  return numerator / denominator;
}

/**
 * Calculate angles at each corner (in degrees)
 */
function calculateCornerAngles(corners: Array<{ x: number; y: number }>): number[] {
  const angles: number[] = [];
  const n = corners.length;

  for (let i = 0; i < n; i++) {
    const prev = corners[(i - 1 + n) % n];
    const curr = corners[i];
    const next = corners[(i + 1) % n];

    // Vectors from current to prev and next
    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    // Angle between vectors
    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;
    const angleRad = Math.atan2(cross, dot);
    const angleDeg = Math.abs(angleRad * 180 / Math.PI);

    angles.push(angleDeg);
  }

  return angles;
}

/**
 * Calculate rectangle center, width, height, and rotation angle
 */
function calculateRectangleParams(corners: Array<{ x: number; y: number }>): {
  cx: number;
  cy: number;
  width: number;
  height: number;
  angle: number;
} {
  // Calculate center
  let cx = 0, cy = 0;
  for (const corner of corners) {
    cx += corner.x;
    cy += corner.y;
  }
  cx /= corners.length;
  cy /= corners.length;

  // Calculate edge lengths
  const edge1 = Math.sqrt(
    (corners[1].x - corners[0].x) ** 2 + (corners[1].y - corners[0].y) ** 2
  );
  const edge2 = Math.sqrt(
    (corners[2].x - corners[1].x) ** 2 + (corners[2].y - corners[1].y) ** 2
  );

  const width = Math.max(edge1, edge2);
  const height = Math.min(edge1, edge2);

  // Calculate rotation angle (angle of first edge)
  const dx = corners[1].x - corners[0].x;
  const dy = corners[1].y - corners[0].y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  return { cx, cy, width, height, angle };
}
