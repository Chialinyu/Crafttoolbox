import type { PatternResult, Polyline } from './types';
import { layerColor, layerStrokeWidth } from './crossStitch';

function pointsToPathD(poly: Polyline): string {
  if (poly.points.length === 0) return '';
  const [first, ...rest] = poly.points;
  let d = `M ${fmt(first.x)} ${fmt(first.y)}`;
  for (const p of rest) {
    d += ` L ${fmt(p.x)} ${fmt(p.y)}`;
  }
  if (poly.closed) d += ' Z';
  return d;
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

function polyToSvg(result: PatternResult, poly: Polyline): string {
  const d = pointsToPathD(poly);
  if (!d) return '';
  const color = layerColor(result, poly.layer, poly);
  if (poly.fill) {
    return `<path d="${d}" fill="${color}" stroke="none" data-layer="${poly.layer}"/>`;
  }
  const sw = layerStrokeWidth(result, poly.layer);
  return `<path d="${d}" stroke="${color}" stroke-width="${fmt(sw)}" stroke-linecap="round" stroke-linejoin="round" data-layer="${poly.layer}"/>`;
}

let clipSeq = 0;

function outlinePathD(result: PatternResult): string {
  const pts = result.outline;
  if (pts.length === 0) return '';
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${fmt(pts[i].x)} ${fmt(pts[i].y)}`;
  return d + ' Z';
}

/**
 * Emit body markup: backboard, then grid (clipped to the silhouette when the
 * shape isn't a plain rect), then stitches/border on top (unclipped, so X's
 * stay whole). Returns the concatenated string.
 */
function bodyMarkup(result: PatternResult): string {
  const clip = result.clipToShape && result.outline.length >= 3;
  const clipId = `sp-clip-${clipSeq++}`;
  const parts: string[] = [];

  if (clip) {
    parts.push(
      `<defs><clipPath id="${clipId}"><path d="${outlinePathD(result)}"/></clipPath></defs>`
    );
  }

  const backboard = result.polylines.filter((p) => p.layer === 'backboard');
  const grid = result.polylines.filter((p) => p.layer === 'grid');
  const rest = result.polylines.filter(
    (p) => p.layer === 'stitch' || p.layer === 'border'
  );

  for (const poly of backboard) {
    const m = polyToSvg(result, poly);
    if (m) parts.push(m);
  }

  if (grid.length > 0) {
    if (clip) parts.push(`<g clip-path="url(#${clipId})">`);
    for (const poly of grid) {
      const m = polyToSvg(result, poly);
      if (m) parts.push(m);
    }
    if (clip) parts.push(`</g>`);
  }

  for (const poly of rest) {
    const m = polyToSvg(result, poly);
    if (m) parts.push(m);
  }

  return parts.join('');
}

/**
 * Build a full SVG document for preview / download.
 */
export function patternToSvgDocument(result: PatternResult): string {
  const { widthMm, heightMm } = result;
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(widthMm)}mm" height="${fmt(heightMm)}mm" viewBox="0 0 ${fmt(widthMm)} ${fmt(heightMm)}" fill="none">`,
    bodyMarkup(result),
    `</svg>`,
  ];
  return parts.join('\n');
}

/**
 * Inline SVG markup for React preview (no XML header).
 */
export function patternToSvgMarkup(result: PatternResult): string {
  const { widthMm, heightMm } = result;
  // Transparent SVG so the preview can show a checkerboard behind empty cells
  // and white stitches remain visible.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(widthMm)} ${fmt(heightMm)}" fill="none" class="w-full h-full" aria-hidden="true">` +
    bodyMarkup(result) +
    `</svg>`
  );
}
