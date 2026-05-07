/**
 * pomodoro/engine/presets.js — preset definitions, pure.
 *
 * A preset is a config bundle: focus duration, break duration, optional
 * long-break duration after the last session, and how many focus sessions
 * make up one cycle. The reducer takes a preset object — never an id —
 * so callers can pass custom presets without registering them.
 */

const M = 60_000;

export const PRESETS = Object.freeze({
  classic: Object.freeze({
    id: 'classic',
    name: 'Classic',
    blurb: '25 / 5 · ×4',
    focusMs: 25 * M,
    breakMs: 5 * M,
    longBreakMs: 15 * M,
    sessions: 4,
  }),
  deep: Object.freeze({
    id: 'deep',
    name: 'Deep work',
    blurb: '50 / 10 · ×3',
    focusMs: 50 * M,
    breakMs: 10 * M,
    longBreakMs: 20 * M,
    sessions: 3,
  }),
  sprint: Object.freeze({
    id: 'sprint',
    name: 'Sprint',
    blurb: '15 / 3 · ×6',
    focusMs: 15 * M,
    breakMs: 3 * M,
    longBreakMs: 10 * M,
    sessions: 6,
  }),
  afternoon: Object.freeze({
    id: 'afternoon',
    name: 'Levantine afternoon',
    blurb: '40 / 20 · ×2',
    focusMs: 40 * M,
    breakMs: 20 * M,
    longBreakMs: 30 * M,
    sessions: 2,
  }),
});

export const DEFAULT_PRESET_ID = 'classic';

export function getPreset(id) {
  return PRESETS[id] || PRESETS[DEFAULT_PRESET_ID];
}

export function listPresets() {
  return Object.values(PRESETS);
}

/**
 * isValidPreset(p) — guard for custom-preset objects coming from
 * settings storage. Reducer takes any object that satisfies this.
 */
export function isValidPreset(p) {
  return !!(
    p &&
    typeof p === 'object' &&
    Number.isFinite(p.focusMs) && p.focusMs > 0 &&
    Number.isFinite(p.breakMs) && p.breakMs > 0 &&
    Number.isFinite(p.longBreakMs) && p.longBreakMs > 0 &&
    Number.isFinite(p.sessions) && p.sessions >= 1 && p.sessions <= 12
  );
}
