/**
 * focus/focusSession.js — pure logic for Focus Mode.
 *
 * Focus Mode collapses the desktop to three things: the clock, one task,
 * and the Pomodoro ring. This module owns every decision that doesn't
 * need the DOM, so the view stays a renderer and the rules stay testable:
 *
 *   • which task to show (pin honoured, gracefully falls back)
 *   • how to move between tasks
 *   • what the persisted `yancotab_focus_v1` blob is allowed to contain
 *   • the phase label + MM:SS + ring progress readouts
 *
 * The Pomodoro *state machine* is NOT duplicated here — Focus Mode
 * dispatches the same intents through `pomodoro/engine/reducer.js` that
 * PomodoroApp does. This file only formats what the reducer produced.
 */

import { phaseDurationMs, remainingMs } from '../../../apps/pomodoro/engine/state.js';

/**
 * The persisted shape. `taskId` is a *pin*: the user explicitly chose to
 * focus on that task, so it wins over "first open task" for as long as it
 * stays open. `enteredAt` is informational (shown as session elapsed).
 */
export function normalizeFocusState(raw) {
  const base = { active: false, taskId: null, enteredAt: null };
  if (!raw || typeof raw !== 'object') return base;
  return {
    active: !!raw.active,
    // Reject non-strings and empty strings — a `0` or `{}` here would
    // otherwise sail through and never match a real task id.
    taskId: typeof raw.taskId === 'string' && raw.taskId ? raw.taskId : null,
    enteredAt: Number.isFinite(raw.enteredAt) ? raw.enteredAt : null,
  };
}

/**
 * Which task should Focus Mode show?
 *
 * A pin is honoured only while that task is still open — completing it
 * elsewhere (Todo app, the Today widget) must not leave Focus Mode
 * staring at a finished task. Falls back to the first open task, then
 * to null (which the view renders as the "type one" empty state).
 */
export function pickFocusTask(openTasks, pinnedId) {
  if (!Array.isArray(openTasks) || openTasks.length === 0) return null;
  if (pinnedId) {
    const pinned = openTasks.find((t) => t && t.id === pinnedId);
    if (pinned) return pinned;
  }
  return openTasks[0] || null;
}

/**
 * Step to the next/previous open task, wrapping at both ends.
 *
 * `dir` is +1 or -1. If the current id isn't in the list (it was just
 * completed, or the pin is stale) we start from the top rather than
 * guessing — index -1 + 1 === 0 happens to do that for dir=+1, so it's
 * handled explicitly to stay correct for dir=-1 too.
 */
export function cycleFocusTask(openTasks, currentId, dir = 1) {
  if (!Array.isArray(openTasks) || openTasks.length === 0) return null;
  const idx = openTasks.findIndex((t) => t && t.id === currentId);
  if (idx === -1) return openTasks[0].id;
  const step = dir < 0 ? -1 : 1;
  const next = (idx + step + openTasks.length) % openTasks.length;
  return openTasks[next].id;
}

/** MM:SS, clamped at zero. Mirrors the widget's readout. */
export function formatMMSS(ms) {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Elapsed time in the focus session as a human string ("18m", "1h 04m").
 * Shown under the exit button so a long session is visible at a glance.
 */
export function formatElapsed(enteredAt, now = Date.now()) {
  if (!Number.isFinite(enteredAt) || enteredAt > now) return '';
  const mins = Math.floor((now - enteredAt) / 60000);
  if (mins < 1) return 'just started';
  if (mins < 60) return `${mins}m in`;
  const h = Math.floor(mins / 60);
  return `${h}h ${String(mins % 60).padStart(2, '0')}m in`;
}

/**
 * The line under the ring. Same vocabulary as PomodoroWidget so the two
 * surfaces never disagree about what phase the user is in.
 */
export function focusPhaseLabel(state, preset) {
  if (!state || state.phase === 'idle') return 'Tap the ring to start';
  if (state.paused) return 'Paused';
  if (state.phase === 'longBreak') return 'Long break';
  if (state.phase === 'break') return 'Take a break';
  const n = Math.min((state.sessionIndex || 0) + 1, preset.sessions);
  return `Session ${n} of ${preset.sessions}`;
}

/**
 * Ring fill, 0..1. Idle reads as empty rather than full — an idle ring
 * that looks complete implies a finished session that never happened.
 */
export function ringProgress(state, preset, now = Date.now()) {
  if (!state || state.phase === 'idle') return 0;
  const total = phaseDurationMs(state.phase, preset);
  if (!(total > 0)) return 0;
  const remaining = remainingMs(state, preset, now);
  const p = 1 - remaining / total;
  return Math.min(1, Math.max(0, p));
}

/** True while a session is actively counting down (drives the pulse). */
export function isRunning(state) {
  return !!state && state.phase !== 'idle' && !state.paused;
}
