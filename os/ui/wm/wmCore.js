/**
 * wmCore.js — pure window-manager logic. Zero DOM, zero kernel.
 *
 * Every function takes a state object and returns a NEW state object
 * (reducer-style, same discipline as the game engines). State is plain
 * JSON-serializable data — arrays and scalars only — so the node --test
 * suite in tests/wm-core.test.js can cover it without layout fakery.
 *
 * State shape:
 *   {
 *     order:      number[],       // ALL windows, bottom→top (minimized included)
 *     minimized:  number[],       // subset of order
 *     focused:    number|null,    // always a VISIBLE pid, or null
 *     cascadeSeq: number,         // monotonic placement counter
 *   }
 *
 * Invariants (locked by tests):
 *   - focused is null or a member of visiblePids(state)
 *   - minimized ⊆ order
 */

/** Multi-window gate: large viewport AND a precise pointer. 1024 rather
 *  than the plan's sketched 1200 because snap halves must respect the
 *  320px window minimum — at 1024 each half is 512px. */
export const WM_MEDIA_QUERY = '(min-width: 1024px) and (pointer: fine)';

/** Max concurrent windows (minimized ones count — they hold processes). */
export const WINDOW_CAP = 6;

const isPid = (pid) => typeof pid === 'number' && Number.isFinite(pid);

export function createWmState() {
  return { order: [], minimized: [], focused: null, cascadeSeq: 0 };
}

/** Visible pids in z order, bottom→top. */
export function visiblePids(state) {
  return state.order.filter((p) => !state.minimized.includes(p));
}

/** z position of pid within the full order (bottom = 0), or -1. */
export function zOf(state, pid) {
  return state.order.indexOf(pid);
}

function topVisible(order, minimized) {
  for (let i = order.length - 1; i >= 0; i--) {
    if (!minimized.includes(order[i])) return order[i];
  }
  return null;
}

/**
 * Admit a new window. Fails (ok:false, state unchanged) on cap overflow,
 * duplicate pid, or a non-numeric pid. cascadeSlot feeds cascadeOffset().
 */
export function openWindow(state, pid, { cap = WINDOW_CAP } = {}) {
  if (!isPid(pid) || state.order.includes(pid) || state.order.length >= cap) {
    return { state, ok: false, cascadeSlot: -1 };
  }
  return {
    state: {
      order: [...state.order, pid],
      minimized: [...state.minimized],
      focused: pid,
      cascadeSeq: state.cascadeSeq + 1,
    },
    ok: true,
    cascadeSlot: state.cascadeSeq,
  };
}

/**
 * Remove a window. Focus falls to the new top-most visible window.
 * Closing the last window resets the cascade counter — otherwise a lone
 * window opened after a busy session would land up to 140px off its
 * CSS-designed default position for no visible reason.
 */
export function closeWindow(state, pid) {
  if (!state.order.includes(pid)) return state;
  const order = state.order.filter((p) => p !== pid);
  const minimized = state.minimized.filter((p) => p !== pid);
  const focused = state.focused === pid
    ? topVisible(order, minimized)
    : state.focused;
  return { order, minimized, focused, cascadeSeq: order.length === 0 ? 0 : state.cascadeSeq };
}

/** Un-minimize if needed, raise to top, focus. Unknown pid → no-op. */
export function activate(state, pid) {
  if (!state.order.includes(pid)) return state;
  return {
    order: [...state.order.filter((p) => p !== pid), pid],
    minimized: state.minimized.filter((p) => p !== pid),
    focused: pid,
    cascadeSeq: state.cascadeSeq,
  };
}

/** Hide a window; keep its z slot. Focus falls to next visible. Idempotent. */
export function minimize(state, pid) {
  if (!state.order.includes(pid) || state.minimized.includes(pid)) return state;
  const minimized = [...state.minimized, pid];
  const focused = state.focused === pid
    ? topVisible(state.order, minimized)
    : state.focused;
  return { order: [...state.order], minimized, focused, cascadeSeq: state.cascadeSeq };
}

/** Show desktop: every window minimized, nothing focused. */
export function minimizeAll(state) {
  return {
    order: [...state.order],
    minimized: [...state.order],
    focused: null,
    cascadeSeq: state.cascadeSeq,
  };
}

/**
 * Compact-mode invariant: at most one visible window. Returns the pids
 * that must be minimized (all visible except focused).
 */
export function compactEnforce(state) {
  const visible = visiblePids(state);
  if (visible.length <= 1) return { state, toMinimize: [] };
  const keep = state.focused != null ? state.focused : visible[visible.length - 1];
  const toMinimize = visible.filter((p) => p !== keep);
  let next = state;
  for (const p of toMinimize) next = minimize(next, p);
  return { state: next, toMinimize };
}

/**
 * Placement offset for the Nth opened window. Slots wrap so a long
 * session never marches windows off-screen.
 */
export function cascadeOffset(slot, { step = 28, wrap = 6 } = {}) {
  const s = Number.isFinite(slot) && slot > 0 ? Math.floor(slot) % wrap : 0;
  return { dx: s * step, dy: s * step };
}

/**
 * Which snap zone (if any) does a drag pointer at (x,y) arm?
 * Side zones win over the top strip in corners — the top strip is only
 * `top` px tall, and a corner hit is almost always a half-snap intent.
 * Out-of-viewport coordinates arm nothing (covers pointercancel and
 * capture continuing outside the window).
 */
export function hitTestSnap(x, y, vw, vh, { side = 24, top = 8 } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > vw || y > vh) return null;
  if (x <= side) return 'left';
  if (x >= vw - side) return 'right';
  if (y <= top) return 'top';
  return null;
}

/**
 * Target rect for a half snap. ceil/floor so the two halves tile an
 * odd-width viewport exactly — no 1px seam, no overlap.
 * 'top' returns null: top-snap maximizes via the fullscreen path.
 */
export function snapRect(zone, vw, vh) {
  const half = Math.ceil(vw / 2);
  if (zone === 'left') return { left: 0, top: 0, width: half, height: vh };
  if (zone === 'right') return { left: Math.floor(vw / 2), top: 0, width: half, height: vh };
  return null;
}
