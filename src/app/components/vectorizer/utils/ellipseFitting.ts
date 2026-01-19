/**
 * ============================================================================
 * CIRCLE & ELLIPSE FITTING - Geometric primitive detection
 * ============================================================================
 * 
 * Detects and fits perfect geometric shapes:
 * - Circle: uniform radius
 * - Ellipse: rotated oval with 2 axes
 * 
 * Output: SVG primitives (<circle>, <ellipse>) instead of path approximations
 */

import type { CirclePrimitive, EllipsePrimitive } from './vectorization';

export interface EllipseParams {
  cx: number;      // Center X
  cy: number;      // Center Y
  a: number;       // Semi-major axis
  b: number;       // Semi-minor axis
  angle: number;   // Rotation angle (radians)
}

/**
 * Detect if shape is a circle or ellipse, return appropriate primitive
 */
export function detectCircleOrEllipse(
  pixels: Array<{ x: number; y: number }>,
  circularityThreshold: number = 0.85 // How circular must it be to use <circle>
): CirclePrimitive | EllipsePrimitive | null {
  const ellipse = fitEllipse(pixels);
  if (!ellipse) return null;
  
  const { cx, cy, a, b, angle } = ellipse;
  
  // Check if it's nearly circular (aspect ratio close to 1)
  const aspectRatio = Math.max(a, b) / Math.min(a, b);
  
  if (aspectRatio < 1.15) {
    // It's a circle! Use <circle> primitive
    const r = (a + b) / 2; // Average radius
    return {
      type: 'circle',
      cx,
      cy,
      r,
    };
  } else {
    // It's an ellipse, use <ellipse> primitive
    const angleDeg = (angle * 180) / Math.PI;
    
    return {
      type: 'ellipse',
      cx,
      cy,
      rx: a,
      ry: b,
      angle: angleDeg,
    };
  }
}

/**
 * Fit ellipse to pixel set using moment-based estimation
 */
export function fitEllipse(pixels: Array<{ x: number; y: number }>): EllipseParams | null {
  if (pixels.length < 5) return null; // Need at least 5 points
  
  // Calculate centroid
  let cx = 0, cy = 0;
  for (const p of pixels) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pixels.length;
  cy /= pixels.length;
  
  // Calculate second moments
  let mxx = 0, myy = 0, mxy = 0;
  for (const p of pixels) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    mxx += dx * dx;
    myy += dy * dy;
    mxy += dx * dy;
  }
  mxx /= pixels.length;
  myy /= pixels.length;
  mxy /= pixels.length;
  
  // Eigenvalues give axis lengths
  const trace = mxx + myy;
  const det = mxx * myy - mxy * mxy;
  const discriminant = (trace * trace) / 4 - det;
  
  if (discriminant < 0) {
    // Fallback to circular approximation
    const avgRadius = Math.sqrt((mxx + myy) / 2);
    return { cx, cy, a: avgRadius, b: avgRadius, angle: 0 };
  }
  
  const eigenval1 = trace / 2 + Math.sqrt(discriminant);
  const eigenval2 = trace / 2 - Math.sqrt(discriminant);
  
  const a = Math.sqrt(Math.abs(eigenval1)) * 2; // Semi-major axis
  const b = Math.sqrt(Math.abs(eigenval2)) * 2; // Semi-minor axis
  
  // Rotation angle
  let angle = 0;
  if (Math.abs(mxy) > 0.001) {
    angle = Math.atan2(2 * mxy, mxx - myy) / 2;
  }
  
  return { cx, cy, a, b, angle };
}

/**
 * Generate perfect ellipse SVG path with only 4 Bezier curve segments
 * Uses the magic constant k = 4/3 * tan(π/8) for perfect circular arcs
 */
export function ellipseToSVGPath(params: EllipseParams): string {
  const { cx, cy, a, b, angle } = params;
  
  // Magic constant for cubic Bezier approximation of circle arc
  // This creates a perfect circle with 4 cubic Bezier curves
  const k = 0.5522847498; // 4/3 * tan(π/8)
  
  // Control points for unit circle (4 arcs, 3 points each = 12 total)
  const unitPoints = [
    { x: 1, y: 0 },        // Right anchor
    { x: 1, y: k },        // Right-top control
    { x: k, y: 1 },        // Top-right control
    { x: 0, y: 1 },        // Top anchor
    { x: -k, y: 1 },       // Top-left control
    { x: -1, y: k },       // Left-top control
    { x: -1, y: 0 },       // Left anchor
    { x: -1, y: -k },      // Left-bottom control
    { x: -k, y: -1 },      // Bottom-left control
    { x: 0, y: -1 },       // Bottom anchor
    { x: k, y: -1 },       // Bottom-right control
    { x: 1, y: -k },       // Right-bottom control
  ];
  
  // Transform unit circle to ellipse with rotation
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  
  const transform = (p: { x: number; y: number }) => {
    const x = p.x * a; // Scale to semi-major axis
    const y = p.y * b; // Scale to semi-minor axis
    return {
      x: cx + x * cos - y * sin, // Rotate and translate
      y: cy + x * sin + y * cos,
    };
  };
  
  // Start at rightmost point
  const p0 = transform(unitPoints[0]);
  const path = [`M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`];
  
  // Generate 4 cubic Bezier arcs (top, left, bottom, right)
  for (let i = 0; i < 4; i++) {
    const c1 = transform(unitPoints[i * 3 + 1]);  // First control point
    const c2 = transform(unitPoints[i * 3 + 2]);  // Second control point
    const end = transform(unitPoints[(i * 3 + 3) % 12]); // End anchor
    
    path.push(`C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`);
  }
  
  path.push('Z'); // Close path
  
  return path.join(' ');
}
