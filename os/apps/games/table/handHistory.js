/**
 * handHistory.js — Per-game hand log persistence.
 *
 * One key per game (yancotab_tarneeb_history_v1, yancotab_trix_history_v1).
 * Newest-first append with a 50-entry cap. The third "Hand history" tab
 * in the salon reads from here.
 *
 * Entry shape (Tarneeb):
 *   { ts, match, round, dealer, trumpSuit,
 *     bids: { south, east, north, west },
 *     tricksWon: { south, east, north, west },
 *     scoresAfter: { south, east, north, west },
 *     teamScoresAfter: { NS, EW },
 *     outcome: 'made' | 'failed' }
 *
 * Entry shape (Trix):
 *   { ts, match, kingdom, contract, kingdomOwner, dealer,
 *     outOrder: ['north', 'east', ...],
 *     taken: { south: ['Q♠'], ... },
 *     scoresAfter: { south, east, north, west },
 *     teamScoresAfter: { A, B } | null }
 */

const HISTORY_CAP = 50;

const KEY = {
  tarneeb: 'yancotab_tarneeb_history_v1',
  trix:    'yancotab_trix_history_v1',
};

/**
 * Build a hand-history facade bound to one game's storage key.
 * Returns an object the salon shell can pass to TableShell.
 */
export function createHandHistory(kernel, gameId) {
  const key = KEY[gameId];
  if (!key) {
    throw new Error(`createHandHistory: unknown gameId "${gameId}"`);
  }

  return {
    /** Read all entries (newest-first). */
    load() {
      try {
        const data = kernel.storage?.load(key) || { hands: [] };
        const arr = Array.isArray(data.hands) ? data.hands : [];
        return arr;
      } catch {
        return [];
      }
    },

    /** Append one entry; trims to HISTORY_CAP newest. */
    append(entry) {
      if (!entry || typeof entry !== 'object') return;
      try {
        const data = kernel.storage?.load(key) || { hands: [] };
        const arr = Array.isArray(data.hands) ? data.hands.slice() : [];
        arr.unshift({ ts: Date.now(), ...entry });
        while (arr.length > HISTORY_CAP) arr.pop();
        kernel.storage?.save(key, { hands: arr });
      } catch (e) {
        console.warn('[handHistory] append failed', e);
      }
    },

    /** Wipe all entries. (Settings → Reset point.) */
    clear() {
      try {
        kernel.storage?.save(key, { hands: [] });
      } catch {}
    },
  };
}

// ── Pure helpers (exported for tests) ──

/**
 * Trim an entry list to the cap, keeping the newest (lowest index) entries.
 * Tests call this to verify retention without touching real storage.
 */
export function trimToCap(arr, cap = HISTORY_CAP) {
  if (!Array.isArray(arr)) return [];
  if (arr.length <= cap) return arr.slice();
  return arr.slice(0, cap);
}

/**
 * Validate a Tarneeb entry shape. Tests + REGISTRY validators use this.
 */
export function isValidTarneebEntry(e) {
  if (!e || typeof e !== 'object') return false;
  if (typeof e.round !== 'number') return false;
  if (typeof e.dealer !== 'string') return false;
  if (typeof e.trumpSuit !== 'string') return false;
  if (!e.bids || !e.tricksWon || !e.scoresAfter) return false;
  return true;
}

/**
 * Validate a Trix entry shape.
 */
export function isValidTrixEntry(e) {
  if (!e || typeof e !== 'object') return false;
  if (typeof e.kingdom !== 'number') return false;
  if (typeof e.contract !== 'string') return false;
  if (typeof e.kingdomOwner !== 'string') return false;
  return true;
}

export const HAND_HISTORY_CAP = HISTORY_CAP;
