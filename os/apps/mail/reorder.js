/**
 * reorder.js — pure list reordering for the accounts board.
 *
 * No DOM, no storage, no events. dragRail.js owns the pointer plumbing and
 * delegates every *decision* here, so the ordering rules are unit-testable
 * without a browser and the glue has nothing to get subtly wrong.
 *
 * Order needs no new storage field: `accounts` is already an array and
 * normalizeState preserves its order, so a reorder is a splice.
 */

/**
 * Move the account with `id` to `toIndex`.
 *
 * Returns a NEW array. Returns the input array unchanged (same reference) when
 * the move is a no-op, so callers can skip a storage write with `next === list`
 * rather than deep-comparing.
 *
 * @param {Array<{id:string}>} list
 * @param {string} id
 * @param {number} toIndex  clamped to [0, list.length - 1]
 */
export function moveAccount(list, id, toIndex) {
    if (!Array.isArray(list) || list.length < 2) return list;

    const from = list.findIndex(a => a && a.id === id);
    if (from === -1) return list;

    const n = Number(toIndex);
    if (!Number.isFinite(n)) return list;
    const to = Math.min(list.length - 1, Math.max(0, Math.trunc(n)));
    if (to === from) return list;

    const next = list.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

/**
 * Which index should a drop at viewport position (x, y) land on?
 *
 * Takes the *measured* rects of the current row nodes — measurement is the
 * caller's job, so this stays pure. Uses each rect's midpoint on the dominant
 * axis: a grid that wraps is compared on Y between rows and on X within a row,
 * which is what makes this work for both the wrapped board and a single column.
 *
 * @param {Array<{left:number,top:number,right:number,bottom:number}>} rects
 * @param {number} x
 * @param {number} y
 * @returns {number} insertion index in [0, rects.length]
 */
export function dropIndexFor(rects, x, y) {
    if (!Array.isArray(rects) || rects.length === 0) return 0;

    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (!r) continue;
        // Above this row entirely → insert before it.
        if (y < r.top) return i;
        // Within this row's band → decide by the horizontal midpoint.
        if (y <= r.bottom) {
            if (x < (r.left + r.right) / 2) return i;
            // Past the midpoint of the last rect in this band: keep scanning,
            // so a drop to the right of row 1's last card lands at the start
            // of row 2 rather than at the very end of the list.
            const nextInRow = rects[i + 1];
            if (!nextInRow || nextInRow.top >= r.bottom) return i + 1;
        }
    }
    return rects.length;
}

/**
 * Drag gate — 6px of movement OR 150ms of hold, matching the thresholds
 * already used by the browser portal drag and both solitaire games.
 *
 * Below both, the gesture is still a click and must open the account. This is
 * the rule that stops "I tried to click and it started dragging".
 */
export const DRAG_MOVE_PX = 6;
export const DRAG_HOLD_MS = 150;

/**
 * @param {{dx:number, dy:number, heldMs:number}} g
 * @returns {boolean} true once the gesture has committed to being a drag
 */
export function isDragGesture({ dx = 0, dy = 0, heldMs = 0 }) {
    return Math.hypot(dx, dy) >= DRAG_MOVE_PX || heldMs >= DRAG_HOLD_MS;
}
