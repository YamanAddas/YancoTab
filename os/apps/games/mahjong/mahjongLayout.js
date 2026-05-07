/**
 * mahjongLayout.js — Pure board-fitting math for Mahjong.
 *
 * Computes tile cell size + per-tile (x,y,z) coordinates given the
 * available board area and the engine's tile list. Returns a layout
 * descriptor; the host applies the inline styles. Pulling this out
 * of MahjongApp.js keeps the host shell under the 500-line cap.
 */

/**
 * @param {object} opts
 *   tiles      — engine tile list (col, row, layer; removed flag ignored
 *                so removed-tile slots reserve space for stable sizing)
 *   width      — available board width (px)
 *   height     — available board height (px)
 *   isPortrait — whether to swap width/height for fitting
 * @returns {object} `{ cell, tileW, tileH, iconSize, labelSize, layerPx,
 *                     colOffset, minX, minY, maxX, maxY,
 *                     placed: [{ id, x, y, w, h, z }] }`
 *                  or null if there's nothing to lay out.
 */
export function computeBoardLayout({ tiles, width, height, isPortrait }) {
  const pad = 8;
  const aW = width - pad * 2;
  const aH = height - pad * 2;
  if (aW <= 0 || aH <= 0 || !tiles?.length) return null;

  let maxCol = 0;
  let maxRow = 0;
  let maxLayer = 0;
  for (const t of tiles) {
    if (t.col + 2 > maxCol) maxCol = t.col + 2;
    if (t.row + 2 > maxRow) maxRow = t.row + 2;
    if (t.layer > maxLayer) maxLayer = t.layer;
  }

  // Normalise negative cols
  let minCol = Infinity;
  for (const t of tiles) if (t.col < minCol) minCol = t.col;
  const colOffset = minCol < 0 ? -minCol : 0;
  maxCol += colOffset;

  // Layer offset (px) — 3D effect
  const layerPx = isPortrait ? 2 : 3;
  const totalLayerShift = maxLayer * layerPx;

  // Tile cell size (portrait uses rotated board)
  const fitW = isPortrait ? aH : aW;
  const fitH = isPortrait ? aW : aH;
  const cellW = (fitW - totalLayerShift) / maxCol;
  const cellH = (fitH - totalLayerShift) / maxRow;
  const cell = Math.max(4, Math.min(cellW, cellH));

  const tileW = cell * 2;
  const tileH = cell * 2;
  const iconSize = Math.max(8, tileW * 0.38);
  const labelSize = Math.max(6, tileW * 0.22);

  const placed = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    const x = (t.col + colOffset) * cell + t.layer * layerPx;
    const y = t.row * cell + t.layer * layerPx;
    const w = tileW - 2;
    const h = tileH - 2;
    const z = t.layer * 100 + t.row * 2 + 1;
    placed.push({ id: t.id, x, y, w, h, z });
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  if (!placed.length) return null;
  return { cell, tileW, tileH, iconSize, labelSize, layerPx, colOffset, minX, minY, maxX, maxY, placed };
}

/**
 * Count the number of available pair-matches among free tiles.
 * Matchgroups with N free tiles contribute floor(N / 2) pairs.
 */
export function countFreePairs(game) {
  const free = game.remaining().filter((t) => game.isFree(t));
  const groups = {};
  for (const t of free) {
    groups[t.matchGroup] = (groups[t.matchGroup] || 0) + 1;
  }
  let pairs = 0;
  for (const k of Object.keys(groups)) {
    pairs += Math.floor(groups[k] / 2);
  }
  return pairs;
}
