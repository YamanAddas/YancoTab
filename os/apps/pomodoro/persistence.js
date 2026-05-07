/**
 * pomodoro/persistence.js — kernel.storage adapter, side-effecting.
 *
 * Three keys:
 *   yancotab_pomodoro_v1            — live timer state (shared with the dock widget)
 *   yancotab_pomodoro_history_v1    — per-day session log
 *   yancotab_pomodoro_settings_v1   — active preset + ambient toggles
 *
 * The widget already reads/writes yancotab_pomodoro_v1; we extend its
 * shape (add presetId, sessionIndex, cycleStartedAt, manualSkyOverride)
 * and rely on the registry validate() being lenient (just checks for
 * `phase: string`).
 */

import { normalizeState, makeInitialState } from './engine/state.js';
import { emptyHistory } from './engine/history.js';
import { DEFAULT_PRESET_ID, isValidPreset } from './engine/presets.js';

const KEY_STATE = 'yancotab_pomodoro_v1';
const KEY_HISTORY = 'yancotab_pomodoro_history_v1';
const KEY_SETTINGS = 'yancotab_pomodoro_settings_v1';

export const STORAGE_KEYS = Object.freeze({
  state: KEY_STATE,
  history: KEY_HISTORY,
  settings: KEY_SETTINGS,
});

export function defaultSettings() {
  return {
    activePresetId: DEFAULT_PRESET_ID,
    customPreset: null,
    ambient: {
      drone: false,
      solarWind: false,
      autoMute: true,
      nightShell: true,
      endChime: false,
    },
    attachedAppId: null,
    weekStart: 'mon',
  };
}

export function normalizeSettings(s) {
  const base = defaultSettings();
  if (!s || typeof s !== 'object') return base;
  const ambient = { ...base.ambient, ...(s.ambient && typeof s.ambient === 'object' ? s.ambient : {}) };
  for (const k of Object.keys(ambient)) ambient[k] = !!ambient[k];
  return {
    activePresetId: typeof s.activePresetId === 'string' ? s.activePresetId : base.activePresetId,
    customPreset: isValidPreset(s.customPreset) ? s.customPreset : null,
    ambient,
    attachedAppId: typeof s.attachedAppId === 'string' ? s.attachedAppId : null,
    weekStart: s.weekStart === 'sun' ? 'sun' : 'mon',
  };
}

export function normalizeHistory(h) {
  if (!h || typeof h !== 'object' || !h.days || typeof h.days !== 'object') {
    return emptyHistory();
  }
  const days = {};
  for (const [k, list] of Object.entries(h.days)) {
    if (!Array.isArray(list)) continue;
    days[k] = list.filter((e) => e && typeof e === 'object' && Number.isFinite(e.endedAt));
  }
  return { days };
}

export function loadState(kernel, now = Date.now()) {
  try {
    const raw = kernel?.storage?.load?.(KEY_STATE);
    if (raw) return normalizeState(raw, now);
  } catch { /* ignore */ }
  return makeInitialState({ now });
}

export function saveState(kernel, state) {
  try { kernel?.storage?.save?.(KEY_STATE, state); } catch { /* ignore */ }
}

export function loadHistory(kernel) {
  try {
    const raw = kernel?.storage?.load?.(KEY_HISTORY);
    if (raw) return normalizeHistory(raw);
  } catch { /* ignore */ }
  return emptyHistory();
}

export function saveHistory(kernel, history) {
  try { kernel?.storage?.save?.(KEY_HISTORY, history); } catch { /* ignore */ }
}

export function loadSettings(kernel) {
  try {
    const raw = kernel?.storage?.load?.(KEY_SETTINGS);
    if (raw) return normalizeSettings(raw);
  } catch { /* ignore */ }
  return defaultSettings();
}

export function saveSettings(kernel, settings) {
  try { kernel?.storage?.save?.(KEY_SETTINGS, settings); } catch { /* ignore */ }
}
