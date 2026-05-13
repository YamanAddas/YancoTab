/**
 * pdf/v3/render/inkRender.js — render ink annotations as smoothed SVG paths.
 *
 * Annotation shape:
 *   {
 *     kind: 'ink',
 *     points: [[fx, fy], ...],    // fractional page coords [0..1]
 *     color: 'red'|'orange'|...|'#hex',
 *     width: number               // stroke width in page-intrinsic units (PDF points)
 *   }
 *
 * Smoothing: Catmull-Rom spline at tension 0.5 — same family the
 * Solitaire/Spider card-trail uses. Endpoints duplicate themselves
 * for a stable opening/closing slope.
 *
 * Pure module — testable with object fixtures.
 *
 * Target size: ≤ 200 lines.
 */

const DEFAULT_TENSION = 0.5;

/**
 * Convert a list of fractional points to an SVG path string sized
 * to the given viewBox dimensions.
 *
 * @param {Array<[number,number]>} fractionalPoints
 * @param {number} vbW   viewBox width  (page-intrinsic px)
 * @param {number} vbH   viewBox height (page-intrinsic px)
 * @param {number} [tension]
 * @returns {string}     SVG `d` attribute value
 */
export function buildPathFromFractional(fractionalPoints, vbW, vbH, tension = DEFAULT_TENSION) {
  if (!Array.isArray(fractionalPoints) || fractionalPoints.length === 0) return '';
  if (!Number.isFinite(vbW) || !Number.isFinite(vbH) || vbW <= 0 || vbH <= 0) return '';
  const px = fractionalPoints.map(([fx, fy]) => [fx * vbW, fy * vbH]);
  return buildPath(px, tension);
}

/**
 * Build an SVG path from a list of absolute points using Catmull-Rom
 * smoothing. Two-point input renders as a straight line; single-point
 * input renders as a zero-length dot via M + L same-point.
 *
 * @param {Array<[number,number]>} points
 * @param {number} tension
 * @returns {string}
 */
export function buildPath(points, tension = DEFAULT_TENSION) {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) {
    const [x, y] = points[0];
    // Tiny line so the path is renderable; use stroke-linecap:round
    // to make it a dot visually.
    return `M${fmt(x)},${fmt(y)} L${fmt(x)},${fmt(y)}`;
  }
  if (points.length === 2) {
    const [a, b] = points;
    return `M${fmt(a[0])},${fmt(a[1])} L${fmt(b[0])},${fmt(b[1])}`;
  }

  let d = `M${fmt(points[0][0])},${fmt(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2;
    d += ` C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2[0])},${fmt(p2[1])}`;
  }
  return d;
}

/**
 * Decimate a sample stream so the stored polyline doesn't carry
 * 1000+ duplicate-ish points. Keeps a point if it's at least
 * `minDistFraction` away from the prior kept point (Euclidean,
 * fractional coords).
 */
export function decimateFractional(samples, minDistFraction = 0.0015) {
  if (!Array.isArray(samples) || samples.length === 0) return [];
  const out = [samples[0]];
  let last = samples[0];
  const minSq = minDistFraction * minDistFraction;
  for (let i = 1; i < samples.length - 1; i++) {
    const p = samples[i];
    const dx = p[0] - last[0];
    const dy = p[1] - last[1];
    if (dx * dx + dy * dy >= minSq) {
      out.push(p);
      last = p;
    }
  }
  // Always keep the final point so the stroke ends where the user lifted.
  const tail = samples[samples.length - 1];
  if (tail !== last) out.push(tail);
  return out;
}

/**
 * Format a number to at most 2 decimal places, no trailing zeros.
 * Keeps SVG path strings compact in storage.
 */
function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 100) / 100;
  return String(r);
}

// Re-export the tension constant for callers that want to override.
export const __TEST__ = { DEFAULT_TENSION, fmt };
