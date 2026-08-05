/**
 * grid/gridNav.js — where an arrow key lands. Pure.
 *
 * Every icon in the app grid is absolutely positioned by transform and all
 * pages share one container, so DOM order says nothing about what the user
 * sees — a dragged icon keeps its original node. Movement is therefore
 * computed from each item's stored page/row/col, which is what the layout
 * engine paints from.
 *
 * No DOM, no storage, no `this`. The view adapter (gridKeyboard.js) reads
 * state and applies focus; everything about *which* item is next lives here
 * so it can be tested against a hand-built grid.
 */

/** Top-level, visible items on one page, in reading order. */
export function pageItems(items, page) {
  const all = items instanceof Map ? Array.from(items.values())
    : (Array.isArray(items) ? items : []);
  return all
    // `typeof i === 'object'` plus a real id is load-bearing, not belt and
    // braces: the grid blob is reachable by JSON import, and a bare number
    // in the array is truthy, has no `parent` or `hidden`, and coerces to
    // page 0 — so a looser filter admits it and hands the caller an item
    // whose id is undefined.
    .filter((i) => i && typeof i === 'object' && typeof i.id === 'string' && i.id
      && !i.parent && !i.hidden && (i.page | 0) === (page | 0))
    .sort((a, b) => ((a.row | 0) - (b.row | 0)) || ((a.col | 0) - (b.col | 0)));
}

/**
 * Linear step in reading order, spilling onto the adjacent page at the
 * ends.
 *
 * Deliberately does NOT wrap from the last page back to the first: a
 * silent jump to page 1 reads as the key having done something else
 * entirely. Running off the end simply does nothing.
 */
function stepLinear(items, page, pageCount, activeId, dir) {
  const here = pageItems(items, page);
  const idx = here.findIndex((i) => i.id === activeId);
  const next = idx + dir;
  if (idx >= 0 && next >= 0 && next < here.length) return here[next].id;

  const targetPage = (page | 0) + dir;
  if (targetPage < 0 || targetPage >= pageCount) return null;
  const neighbours = pageItems(items, targetPage);
  if (!neighbours.length) return null;
  return dir > 0 ? neighbours[0].id : neighbours[neighbours.length - 1].id;
}

/**
 * Move one row up or down, landing on the item whose column is nearest the
 * current one.
 *
 * Nearest rather than exact: the last row of a page is usually partly
 * filled, and requiring an exact column match would make Down silently do
 * nothing from most of the row above it.
 */
function stepVertical(items, page, current, dir) {
  if (!current) return null;
  const targetRow = (current.row | 0) + dir;
  const row = pageItems(items, page).filter((i) => (i.row | 0) === targetRow);
  if (!row.length) return null;
  let best = row[0];
  let bestDist = Math.abs((best.col | 0) - (current.col | 0));
  for (const candidate of row) {
    const dist = Math.abs((candidate.col | 0) - (current.col | 0));
    if (dist < bestDist) { best = candidate; bestDist = dist; }
  }
  return best.id;
}

/**
 * @param {object} opts
 * @param {Map|Array} opts.items   every grid item
 * @param {number} opts.page       page currently in view
 * @param {number} opts.pageCount  total pages
 * @param {string|null} opts.activeId  where the roving tab stop is now
 * @param {string} opts.key        KeyboardEvent.key
 * @returns {string|null} the id to move to, or null for "do nothing"
 */
export function nextFocusId({ items, page = 0, pageCount = 1, activeId = null, key }) {
  const here = pageItems(items, page);
  if (!here.length) return null;

  // An unknown activeId (first keypress, or the item was just deleted)
  // anchors on the first item of the page rather than returning null —
  // otherwise the very first arrow press does nothing at all.
  const current = here.find((i) => i.id === activeId) || here[0];
  const anchored = current.id === activeId;

  switch (key) {
    case 'Home': return here[0].id;
    case 'End': return here[here.length - 1].id;
    case 'ArrowRight': return anchored ? stepLinear(items, page, pageCount, activeId, +1) : current.id;
    case 'ArrowLeft': return anchored ? stepLinear(items, page, pageCount, activeId, -1) : current.id;
    case 'ArrowDown': return anchored ? stepVertical(items, page, current, +1) : current.id;
    case 'ArrowUp': return anchored ? stepVertical(items, page, current, -1) : current.id;
    default: return null;
  }
}

/** Keys nextFocusId understands, plus the two that activate an icon. */
export const NAV_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End',
]);
export const ACTIVATE_KEYS = new Set(['Enter', ' ', 'Spacebar']);
