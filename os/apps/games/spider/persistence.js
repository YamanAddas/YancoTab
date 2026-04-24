// persistence.js — Save/load the active Spider game + aggregate stats via
// kernel.storage. State is plain JSON-serialisable data, so we just round-trip.

const SAVE_KEY     = 'yancotab_spider_save';
const STATS_KEY    = 'yancotab_spider_stats';
const SETTINGS_KEY = 'yancotab_spider_settings';

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
    return { ...defaultStats(), ...(s || {}) };
  } catch { return defaultStats(); }
}
export function saveStats(kernel, stats) {
  try { kernel?.storage?.save(STATS_KEY, stats); } catch {}
}

export function defaultSettings() {
  return {
    difficulty: 1,     // 1 = 1-suit, 2 = 2-suit, 4 = 4-suit
    fourColor: false,
    leftHanded: false,
    cardBack: 'nebula',
    timed: true,
  };
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
  return {
    played: 0, won: 0,
    // Per-difficulty best results — Spider's 1/2/4 suits are effectively three
    // games, so we track them separately.
    bestTimeSec: { 1: null, 2: null, 4: null },
    bestMoves:   { 1: null, 2: null, 4: null },
    bestScore:   { 1: 0, 2: 0, 4: 0 },
    currentStreak: 0, longestStreak: 0,
  };
}

export function applyGameResult(stats, { won, timeSec, moves, score, difficulty }) {
  const next = {
    ...stats,
    bestTimeSec: { ...(stats.bestTimeSec || {}) },
    bestMoves:   { ...(stats.bestMoves || {}) },
    bestScore:   { ...(stats.bestScore || {}) },
  };
  next.played += 1;
  if (won) {
    next.won += 1;
    next.currentStreak = (stats.currentStreak || 0) + 1;
    if (next.currentStreak > (next.longestStreak || 0)) next.longestStreak = next.currentStreak;
    const prevT = next.bestTimeSec[difficulty];
    if (prevT == null || timeSec < prevT) next.bestTimeSec[difficulty] = timeSec;
    const prevM = next.bestMoves[difficulty];
    if (prevM == null || moves < prevM) next.bestMoves[difficulty] = moves;
    const prevS = next.bestScore[difficulty] || 0;
    if (score > prevS) next.bestScore[difficulty] = score;
  } else {
    next.currentStreak = 0;
  }
  return next;
}
