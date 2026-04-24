// persistence.js — Save/load the active game + aggregate stats via kernel.storage.
// State is serialisable (pure data), so we just JSON-roundtrip it.

const SAVE_KEY     = 'yancotab_solitaire_save';
const STATS_KEY    = 'yancotab_solitaire_stats';
const SETTINGS_KEY = 'yancotab_solitaire_settings';

export function loadSave(kernel) {
  try { return kernel?.storage?.load(SAVE_KEY) ?? null; } catch { return null; }
}
export function saveGame(kernel, state) {
  try { kernel?.storage?.save(SAVE_KEY, state); } catch {}
}
export function clearSave(kernel) {
  try { kernel?.storage?.save(SAVE_KEY, null); } catch {}
}

export function loadStats(kernel) {
  try {
    const s = kernel?.storage?.load(STATS_KEY);
    return s || defaultStats();
  } catch { return defaultStats(); }
}
export function saveStats(kernel, stats) {
  try { kernel?.storage?.save(STATS_KEY, stats); } catch {}
}

export function defaultSettings() {
  return { drawCount: 1, scoring: 'standard', fourColor: false, leftHanded: false, cardBack: 'nebula' };
}
export function loadSettings(kernel) {
  try {
    const s = kernel?.storage?.load(SETTINGS_KEY);
    return { ...defaultSettings(), ...(s || {}) };
  } catch { return defaultSettings(); }
}
export function saveSettings(kernel, settings) {
  try { kernel?.storage?.save(SETTINGS_KEY, settings); } catch {}
}

export function defaultStats() {
  return { played: 0, won: 0, bestTimeSec: null, bestMoves: null, bestScore: 0, currentStreak: 0, longestStreak: 0 };
}

// Fold a completed game's result into the aggregate stats object.
export function applyGameResult(stats, { won, timeSec, moves, score }) {
  const next = { ...stats };
  next.played += 1;
  if (won) {
    next.won += 1;
    next.currentStreak = (stats.currentStreak || 0) + 1;
    if (next.currentStreak > (next.longestStreak || 0)) next.longestStreak = next.currentStreak;
    if (stats.bestTimeSec == null || timeSec < stats.bestTimeSec) next.bestTimeSec = timeSec;
    if (stats.bestMoves == null || moves < stats.bestMoves) next.bestMoves = moves;
    if (score > (stats.bestScore || 0)) next.bestScore = score;
  } else {
    next.currentStreak = 0;
  }
  return next;
}
