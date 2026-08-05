/**
 * pomodoro/effects.js — the single write path for the Pomodoro clock.
 *
 * Three surfaces run a 1-second tick: PomodoroApp, the Today-bar
 * PomodoroWidget, and Focus Mode. Before this module they each advanced
 * the timer their own way, and only PomodoroApp persisted the reducer's
 * `sessionLogged` event — so a session that completed with the Pomodoro
 * window closed (widget-only use, Focus Mode, or simply being on the home
 * screen) was never written to history at all. Stats, the week grid, the
 * season heatmap and both streaks silently undercounted.
 *
 * Everything now goes through `runPomodoro`. Nothing else may call
 * `apply`, `saveState` or `appendSession`.
 *
 * ── Exactly-once, in two layers ────────────────────────────────────
 *
 * IN-TAB it is structural rather than defensive. `runPomodoro` is a
 * synchronous read-modify-write over localStorage (AppStorage.load has no
 * memory cache — it hits localStorage every call), and setInterval
 * callbacks cannot interleave in a single-threaded runtime. So the first
 * surface to observe `remaining <= 0` advances and persists; the other two
 * then load the ALREADY-ADVANCED state, `apply()` returns the same object
 * reference, and they no-op.
 *
 * That only holds because every caller re-reads storage. PomodoroApp used
 * to apply TICK to a cached `this._state`, which is precisely why simply
 * adding `appendSession` to the widget would have DOUBLE-logged: the app's
 * stale copy expires a moment later and logs a second time.
 *
 * CROSS-TAB needs a key, because localStorage propagation between
 * renderers is not atomic. `appendSession` dedupes on
 * `sessionId = kind@startedAt` — keyed on the phase START, read from
 * shared storage and therefore identical in both tabs, rather than
 * `endedAt`, which each tab stamps itself.
 *
 * Known gap, accepted: the live blob's `sessionIndex` / `sessionsToday`
 * can still double-increment across tabs in the same propagation window.
 * History — which every statistic reads — is protected. Fixing the blob
 * needs a compare-and-swap and is deliberately not smuggled in here.
 */

import { apply } from './engine/reducer.js';
import { getPreset } from './engine/presets.js';
import { appendSession } from './engine/history.js';
import { getSharedChime } from './ambient.js';
import {
  loadState, saveState,
  loadHistory, saveHistory,
  loadSettings,
} from './persistence.js';

/**
 * Which preset governs the running cycle.
 *
 * `state.presetId` wins over `settings.activePresetId`: it is the preset
 * the cycle actually STARTED with, and it is already what the reducer
 * stamps into each history entry. The surfaces used to disagree here —
 * the app keyed off state, the widget and Focus Mode off settings — so a
 * settings-only sync from another device made the widget expire a phase
 * early against the app's own duration.
 */
export function activePreset(state, settings) {
  return getPreset(state?.presetId || settings?.activePresetId);
}

function emitActivity(label) {
  try {
    window.dispatchEvent(new CustomEvent('yancotab:activity', {
      detail: { type: 'pomodoro', label },
    }));
  } catch { /* no window (tests) */ }
}

/**
 * Advance the Pomodoro clock and persist every consequence.
 *
 * @returns {{state: object, history: object|null, changed: boolean}}
 *   `changed` is false when the action was a no-op, in which case NOTHING
 *   was written.
 */
export function runPomodoro(kernel, action, now = Date.now()) {
  const settings = loadSettings(kernel);
  const current = loadState(kernel, now);
  const preset = activePreset(current, settings);
  const { state, events } = apply(current, action, preset, now);

  // `apply()` returns the identical reference for every no-op branch. The
  // early return is load-bearing, not an optimisation: Focus Mode used to
  // save unconditionally, so with three surfaces ticking there would be
  // three localStorage writes and three _scheduleSync() calls per second —
  // and that scheduler is a TRAILING 2s debounce on one shared timer, so a
  // per-second write would reset it forever and no key would ever sync
  // while a timer ran.
  if (state === current) return { state, history: null, changed: false };

  saveState(kernel, state);

  let history = null;
  for (const ev of events) {
    if (ev.type === 'toast') {
      kernel?.emit?.('toast', { message: ev.message, type: ev.kind });
    } else if (ev.type === 'activity') {
      emitActivity(ev.label);
    } else if (ev.type === 'sessionLogged') {
      // Re-read rather than trusting a cached copy: another surface may
      // have written an entry between our load and here.
      const before = history || loadHistory(kernel);
      const next = appendSession(before, ev.entry);
      // appendSession returns its INPUT on a duplicate, so identity is the
      // dedupe signal — no write, no sync-debounce reset.
      if (next !== before) saveHistory(kernel, next);
      history = next;
    } else if (ev.type === 'phase') {
      // Chime only. The body-class ambient effects (mute / night shell)
      // stay owned by PomodoroApp — see getSharedChime's note on why.
      getSharedChime().ring(settings);
    }
  }

  return { state, history, changed: true };
}
