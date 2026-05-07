/**
 * pomodoro/engine/state.js — initial-state factory + helpers, pure.
 *
 * The full live state (persisted to yancotab_pomodoro_v1) is a flat
 * object. Reducer never mutates — every transition returns a new object.
 *
 * Phases:
 *   idle       — no session running, ring shows full focus duration
 *   focus      — focus session counting down
 *   break      — short break between focus sessions
 *   longBreak  — long break after the last focus session in a cycle
 *
 * sessionIndex is the 0-based count of completed focus sessions in
 * the current cycle. The cycle ends after `preset.sessions` focuses
 * (so we render N pips total). After the long break we return to idle.
 */

import { DEFAULT_PRESET_ID } from './presets.js';

export function todayKey(now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function makeInitialState({ presetId = DEFAULT_PRESET_ID, now = Date.now() } = {}) {
  return {
    presetId,
    phase: 'idle',
    sessionIndex: 0,
    startedAt: null,
    paused: false,
    pausedRemainingMs: 0,
    cycleStartedAt: null,
    sessionsToday: 0,
    dayKey: todayKey(now),
    manualSkyOverride: null,
  };
}

/**
 * normalizeState(s, now) — accepts whatever's in storage (possibly the
 * pre-v2-fields envelope) and returns a fully-shaped state. Used on
 * load; never mutates input.
 */
export function normalizeState(s, now = Date.now()) {
  const base = makeInitialState({ now });
  if (!s || typeof s !== 'object') return base;
  return {
    presetId: typeof s.presetId === 'string' ? s.presetId : base.presetId,
    phase: typeof s.phase === 'string' ? s.phase : base.phase,
    sessionIndex: Number.isFinite(s.sessionIndex) ? s.sessionIndex : 0,
    startedAt: Number.isFinite(s.startedAt) ? s.startedAt : null,
    paused: !!s.paused,
    pausedRemainingMs: Number.isFinite(s.pausedRemainingMs) ? s.pausedRemainingMs : 0,
    cycleStartedAt: Number.isFinite(s.cycleStartedAt) ? s.cycleStartedAt : null,
    sessionsToday: Number.isFinite(s.sessionsToday) ? s.sessionsToday : 0,
    dayKey: typeof s.dayKey === 'string' && s.dayKey ? s.dayKey : base.dayKey,
    manualSkyOverride: s.manualSkyOverride === 'day' || s.manualSkyOverride === 'night'
      ? s.manualSkyOverride
      : null,
  };
}

/** Phase → which sky to render (engine knows; view applies the class). */
export function skyForPhase(phase) {
  if (phase === 'break' || phase === 'longBreak') return 'night';
  return 'day';
}

/** Effective sky after manual override. */
export function effectiveSky(state) {
  return state.manualSkyOverride || skyForPhase(state.phase);
}

/** Duration of the current phase given a preset. */
export function phaseDurationMs(phase, preset) {
  if (phase === 'break') return preset.breakMs;
  if (phase === 'longBreak') return preset.longBreakMs;
  return preset.focusMs;
}

/** Remaining ms in the current phase. Idle/paused branches handled. */
export function remainingMs(state, preset, now = Date.now()) {
  if (state.phase === 'idle') return preset.focusMs;
  if (state.paused) return state.pausedRemainingMs;
  if (!Number.isFinite(state.startedAt)) return phaseDurationMs(state.phase, preset);
  const elapsed = Math.max(0, now - state.startedAt);
  return Math.max(0, phaseDurationMs(state.phase, preset) - elapsed);
}
