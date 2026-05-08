/**
 * files/engine/honeycombLayout.js — pure hex-pack geometry.
 *
 * Given a count of cells and a viewport size, returns positions for
 * each cell in a "pointy-top hex" honeycomb pattern. Smart-room cells
 * sit on the top row; folder cells flow below. File coins are placed
 * separately around the perimeter via `coinRing`.
 *
 * All positions are CENTER coords (CSS uses translate(-50%, -50%) on
 * the cell, so positioning by center is what the view layer needs).
 *
 * Pure module — no DOM, no kernel.
 */

const HEX_W = 130;
const HEX_H = 150;

// Pointy-top hex geometry: horizontal pitch = width, vertical pitch
// = height * 0.75. Odd rows are offset by half a horizontal pitch.
const ROW_PITCH = HEX_H * 0.75;

/**
 * cellLayout({ count, width, height, padding }) → Array<{x, y}>
 *
 * Spreads `count` cells across rows of as many as fit per row.
 * `width` and `height` are the honeycomb stage CSS-pixels.
 */
export function cellLayout({ count, width, height, padding = 24 } = {}) {
  if (!Number.isFinite(count) || count <= 0) return [];
  if (!Number.isFinite(width) || width <= 0) return [];
  if (!Number.isFinite(height) || height <= 0) return [];

  const inner = Math.max(0, width - padding * 2);
  const cellsPerRow = Math.max(1, Math.floor(inner / HEX_W));
  const rowsNeeded = Math.ceil(count / cellsPerRow);

  // Center the rows horizontally — leftover gap split.
  const rowWidth = cellsPerRow * HEX_W;
  const xStart = padding + (inner - rowWidth) / 2 + HEX_W / 2;
  // Center vertically too, capped.
  const blockHeight = (rowsNeeded - 1) * ROW_PITCH + HEX_H;
  const yStart = padding + Math.max(0, (height - padding * 2 - blockHeight) / 2) + HEX_H / 2;

  const out = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cellsPerRow);
    const col = i % cellsPerRow;
    const offsetX = (row % 2 === 1) ? HEX_W / 2 : 0;
    out.push({
      x: xStart + col * HEX_W + offsetX,
      y: yStart + row * ROW_PITCH,
    });
  }
  return out;
}

/**
 * coinRing({ count, width, height, padding, radius }) →
 *   Array<{x, y}>
 *
 * Places `count` file coins evenly around the perimeter of the
 * honeycomb stage, oscillating slightly so they don't all sit on a
 * perfect rectangle. `radius` (default 8px) controls the perimeter
 * inset from the stage edge.
 */
export function coinRing({ count, width, height, padding = 24, radius = 28 } = {}) {
  if (!Number.isFinite(count) || count <= 0) return [];
  if (!Number.isFinite(width) || width <= 0) return [];
  if (!Number.isFinite(height) || height <= 0) return [];

  const inset = padding + radius;
  const innerW = Math.max(80, width - inset * 2);
  const innerH = Math.max(80, height - inset * 2);
  const out = [];

  // Distribute around four edges proportional to side length.
  const top = innerW;
  const right = innerH;
  const bottom = innerW;
  const left = innerH;
  const perimeter = top + right + bottom + left;
  if (perimeter <= 0) return [];

  for (let i = 0; i < count; i++) {
    // t in [0, 1) — fraction around the perimeter, evenly spaced
    // with a small phase shift so coins don't always start at the corner.
    const t = ((i + 0.5) / count) % 1;
    const dist = t * perimeter;
    let x; let y;
    if (dist < top) {
      x = inset + dist;
      y = inset;
    } else if (dist < top + right) {
      x = inset + innerW;
      y = inset + (dist - top);
    } else if (dist < top + right + bottom) {
      x = inset + innerW - (dist - top - right);
      y = inset + innerH;
    } else {
      x = inset;
      y = inset + innerH - (dist - top - right - bottom);
    }
    out.push({ x, y });
  }
  return out;
}

/**
 * Constants exported for the view layer so CSS sizing matches.
 */
export const HEX_CELL = Object.freeze({ width: HEX_W, height: HEX_H });
