/**
 * notes/engine/layout.js — deterministic grid positions for stars.
 *
 * For migrating users (notes without saved x/y), assign a grid
 * position so the cosmic stage looks intentional, not random. The
 * grid lives inside the 8..92 percent box so stars don't clip at
 * stage edges (each star has a label and a glow).
 *
 * Pure module — no DOM, no kernel.
 */

// 5 columns × N rows. Wide enough for stars not to bunch, narrow
// enough that a typical 20-note collection forms a recognizable
// pattern at first glance.
const COL_X = [16, 32, 50, 68, 84];
const ROW_Y = [22, 38, 54, 70, 84];

export const STAR_COLS = COL_X.length;
export const STAR_ROWS = ROW_Y.length;

/**
 * gridPosition(index) → { x, y } in percent.
 * Wraps every COL_X.length entries. Beyond ROW_Y.length rows it
 * keeps stepping y down; once it would clip the bottom, it
 * cycles back to the top so we never push stars off-stage.
 */
export function gridPosition(index) {
  if (!Number.isFinite(index) || index < 0) return { x: COL_X[0], y: ROW_Y[0] };
  const col = index % COL_X.length;
  const row = Math.floor(index / COL_X.length);
  if (row < ROW_Y.length) return { x: COL_X[col], y: ROW_Y[row] };
  // Past the bottom row: shrink the y step so the lower band gets
  // denser without spilling. Cycle starts at row 0 again at index
  // (COL_X * ROW_Y) so we never push past 92%.
  const overflowRow = row % ROW_Y.length;
  // Slight x jitter so stacked rows don't look identical.
  const xOffset = ((row - ROW_Y.length + 1) * 4) % 8;
  const x = Math.max(8, Math.min(92, COL_X[col] + xOffset));
  return { x, y: ROW_Y[overflowRow] };
}

/**
 * fillPositions(notes) → array of {note, x, y}, deterministic for
 * a given input order. Notes without x/y get one from gridPosition
 * indexed by their position in the input array. Notes with both
 * coordinates already set are passed through.
 *
 * Doesn't mutate. Returns objects with the resolved position.
 */
export function fillPositions(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.map((note, i) => {
    const hasX = Number.isFinite(note?.x);
    const hasY = Number.isFinite(note?.y);
    if (hasX && hasY) return { note, x: clamp(note.x), y: clamp(note.y) };
    const grid = gridPosition(i);
    return { note, x: hasX ? clamp(note.x) : grid.x, y: hasY ? clamp(note.y) : grid.y };
  });
}

function clamp(n) {
  if (n < 4) return 4;
  if (n > 96) return 96;
  return n;
}
