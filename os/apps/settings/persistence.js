/**
 * settings/persistence.js — kernel.storage adapter for the Mission Console.
 *
 * Stores ritual application history (last applied + when) so the
 * status pill can render "Night mode applied · 14:34". Volatile —
 * syncPolicy 'never' means this never crosses devices (avoids a
 * feedback loop where the sync log self-syncs).
 *
 * Sync log entries themselves are kept in memory only — we don't
 * persist them. They're a transient diagnostic tool.
 */

import { RITUAL_KEY } from './engine/rituals.js';

const DEFAULT_STATE = Object.freeze({
  lastRitual: null,           // 'night' | 'focus' | 'weekend' | null
  lastRitualAt: null,         // ms epoch
  lastRitualOk: null,         // boolean | null
  activeBay: null,            // last category the user opened — string id or null
});

export function loadState(kernel) {
  try {
    const raw = kernel?.storage?.load?.(RITUAL_KEY);
    if (raw && typeof raw === 'object') return normalizeState(raw);
  } catch { /* ignore */ }
  return { ...DEFAULT_STATE };
}

export function saveState(kernel, state) {
  try { kernel?.storage?.save?.(RITUAL_KEY, normalizeState(state)); } catch { /* ignore */ }
}

export function normalizeState(s) {
  if (!s || typeof s !== 'object') return { ...DEFAULT_STATE };
  return {
    lastRitual: typeof s.lastRitual === 'string' ? s.lastRitual : null,
    lastRitualAt: Number.isFinite(s.lastRitualAt) ? s.lastRitualAt : null,
    lastRitualOk: typeof s.lastRitualOk === 'boolean' ? s.lastRitualOk : null,
    activeBay: typeof s.activeBay === 'string' ? s.activeBay : null,
  };
}

export { RITUAL_KEY };
