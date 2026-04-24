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
  return {
    drawCount: 1,
    scoring: 'standard',
    fourColor: false,
    leftHanded: false,
    cardBack: 'nebula',
    timed: true,       // false = "Relaxed" (hide + freeze the play-time readout)
  };
}
export function loadSettings(kernel) {
  try {
    migrateLegacySettings(kernel);
    const s = kernel?.storage?.load(SETTINGS_KEY);
    return { ...defaultSettings(), ...(s || {}) };
  } catch { return defaultSettings(); }
}
export function saveSettings(kernel, settings) {
  try { kernel?.storage?.save(SETTINGS_KEY, settings); } catch {}
}

// One-shot migration from the legacy shared card-style key used by the old
// card-game shell. Runs at most once: reads localStorage, merges the subset
// we recognise (fourColor, leftHanded), persists through kernel.storage, and
// removes the legacy key so subsequent loads are fast.
function migrateLegacySettings(kernel) {
  const LEGACY = 'yancotab_card_settings';
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LEGACY);
    if (!raw) return;
    const legacy = JSON.parse(raw) || {};
    const current = kernel?.storage?.load(SETTINGS_KEY) || {};
    const merged = {
      ...defaultSettings(),
      ...current,
      ...(typeof legacy.fourColor === 'boolean' ? { fourColor: legacy.fourColor } : {}),
      ...(typeof legacy.leftHanded === 'boolean' ? { leftHanded: legacy.leftHanded } : {}),
    };
    kernel?.storage?.save(SETTINGS_KEY, merged);
    localStorage.removeItem(LEGACY);
  } catch { /* migration is best-effort; never fatal */ }
}

export function defaultStats() {
  return {
    played: 0, won: 0,
    bestTimeSec: null, bestMoves: null, bestScore: 0,
    currentStreak: 0, longestStreak: 0,
    vegasBank: 0,   // Cumulative Vegas running total (persists across deals)
  };
}

// Fold a completed game's result into the aggregate stats object.
// `scoring` is passed so Cumulative Vegas can carry the hand's final score
// into the persistent bank. Standard/Vegas modes leave the bank untouched.
export function applyGameResult(stats, { won, timeSec, moves, score, scoring }) {
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
  // Cumulative Vegas: the hand's score (starts at -52 for buy-in, +5 per
  // foundation send, -5 per unsend) rolls directly into the bank. Losses
  // and wins both count — that's the whole point of Cumulative.
  if (scoring === 'cumulative') {
    next.vegasBank = (stats.vegasBank || 0) + (score || 0);
  }
  return next;
}
