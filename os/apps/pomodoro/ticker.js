/**
 * pomodoro/ticker.js — the headless clock.
 *
 * Until now the only per-second driver on the home screen was the widget
 * itself. That was survivable while the widget could not be turned off.
 * The moment Settings gained a Widgets section it became a trap: hiding
 * the card would silently stop the timer, and a session already in flight
 * would sit frozen until some other surface (the Pomodoro window, Focus
 * Mode) happened to tick it.
 *
 * So the tick moves off the view entirely. The widget is now purely a
 * renderer; this module owns advancing the clock, and the shell starts it
 * once at boot.
 *
 * It does NOT tick unconditionally. The interval exists only while a cycle
 * is live, so an idle desktop — which is the overwhelmingly common case,
 * a new tab opened dozens of times a day — costs nothing at all. The
 * start/stop edge is driven by a storage subscription rather than by
 * polling, so `start()` on any surface arms it and the final break→idle
 * transition disarms it.
 */

import { runPomodoro } from './effects.js';
import { loadState, STORAGE_KEYS } from './persistence.js';
import * as intent from './intents.js';

const TICK_MS = 1000;

let handle = null;
let unsubscribe = null;
let armed = false;

function isLive(kernel) {
  const s = loadState(kernel);
  return !!s && s.phase !== 'idle';
}

/**
 * Bring the interval into agreement with the stored phase.
 *
 * Runs from the storage subscription, which fires synchronously inside
 * `saveState` — including the save our own tick just made. That is safe
 * because this function only reads: it never calls `runPomodoro`, so
 * there is no path back into the reducer from here.
 */
function sync(kernel) {
  const live = isLive(kernel);
  if (live && handle === null) {
    handle = setInterval(() => { runPomodoro(kernel, intent.tick()); }, TICK_MS);
  } else if (!live && handle !== null) {
    clearInterval(handle);
    handle = null;
  }
}

/**
 * Start the headless ticker. Idempotent — a second call is a no-op, so a
 * shell re-init cannot leave two intervals racing.
 *
 * @returns {() => void} stop function
 */
export function startPomodoroTicker(kernel) {
  if (armed) return stopPomodoroTicker;
  armed = true;

  // Catch up immediately: a tab opened after the deadline passed must
  // advance on load, not one second later.
  runPomodoro(kernel, intent.tick());
  sync(kernel);

  try {
    unsubscribe = kernel?.storage?.subscribe?.(STORAGE_KEYS.state, () => sync(kernel)) || null;
  } catch { unsubscribe = null; }

  return stopPomodoroTicker;
}

export function stopPomodoroTicker() {
  if (handle !== null) { clearInterval(handle); handle = null; }
  if (unsubscribe) { try { unsubscribe(); } catch { /* ignore */ } unsubscribe = null; }
  armed = false;
}

/** Test-only introspection. */
export function _tickerState() {
  return { armed, running: handle !== null };
}
