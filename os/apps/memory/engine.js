/**
 * engine.js — Memory ("Mirror") pure state machine.
 *
 * Reducer over actions:
 *   { type: 'NEW_GAME', difficulty?: 'easy'|'standard'|'hard' }
 *   { type: 'FLIP', idx }
 *   { type: 'RESOLVE' }                — clears the unmatched pair after the 1s reveal
 *   { type: 'SET_DIFFICULTY', difficulty }
 *   { type: 'HYDRATE', state: partial }
 *
 * State shape:
 *   {
 *     phase:       'idle' | 'playing' | 'won',
 *     difficulty:  'easy' | 'standard' | 'hard',
 *     cards:       [{ id, orb, faceUp, matched }],
 *     pairsTotal:  number,
 *     firstPick:   null | idx,
 *     secondPick:  null | idx,
 *     locked:      boolean,         (true while a mismatched pair is on display)
 *     moves:       number,
 *     pairsFound:  number,
 *     comboStreak: number,
 *     bestComboStreak: number,
 *     startedAt:   number | null,   (ms)
 *     finishedAt:  number | null,   (ms)
 *     foundLog:    [{ orb, ts }],   (newest-first; for "Found pairs" rail)
 *     bestTimeMs:  { easy, standard, hard },
 *     orbCounts:   { orbName: matchedCount }    // for the legend rail
 *   }
 */

export const DIFFICULTIES = {
  easy:     { label: 'Easy',     cols: 4, rows: 4, pairs: 8  },
  standard: { label: 'Standard', cols: 6, rows: 4, pairs: 12 },
  hard:     { label: 'Hard',     cols: 6, rows: 6, pairs: 18 },
};

// Orb names + display strings, in the design's order. The pair count
// for any difficulty is ≤ ORBS.length × ceil(pairs/length) — we cycle
// through the list as needed.
export const ORBS = [
  { id: 'amber',  label: 'Solar'   },
  { id: 'cyan',   label: 'Verdant' }, // design uses "Verdant" green name but the cyan orb is solar-green tinted; keeping naming straight: cyan = "Cyan"
  { id: 'rose',   label: 'Coral'   },
  { id: 'violet', label: 'Nebula'  },
  { id: 'green',  label: 'Verdant' },
  { id: 'blue',   label: 'Cyan'    },
];

function fresh(difficulty = 'standard') {
  if (!DIFFICULTIES[difficulty]) difficulty = 'standard';
  return {
    phase: 'idle',
    difficulty,
    cards: [],
    pairsTotal: DIFFICULTIES[difficulty].pairs,
    firstPick: null,
    secondPick: null,
    locked: false,
    moves: 0,
    pairsFound: 0,
    comboStreak: 0,
    bestComboStreak: 0,
    startedAt: null,
    finishedAt: null,
    pausedAt: null,
    foundLog: [],
    bestTimeMs: { easy: null, standard: null, hard: null },
    orbCounts: {},
  };
}

export function initialState(opts = {}) {
  const base = fresh(opts.difficulty || 'standard');
  if (opts.bestTimeMs && typeof opts.bestTimeMs === 'object') {
    base.bestTimeMs = { ...base.bestTimeMs, ...opts.bestTimeMs };
  }
  if (Number.isFinite(opts.bestComboStreak)) base.bestComboStreak = opts.bestComboStreak;
  return base;
}

/**
 * Build a card list for the given difficulty. Returns an array of
 * {id, orb, faceUp:false, matched:false} of length cols*rows.
 *
 * The shuffle uses an injectable RNG so tests can pin a deal.
 */
export function dealCards(difficulty, random = Math.random) {
  const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.standard;
  const total = cfg.pairs * 2;
  const orbs = [];
  // Cycle through ORBS until we have `pairs` orb assignments
  for (let i = 0; i < cfg.pairs; i++) {
    orbs.push(ORBS[i % ORBS.length].id);
  }
  // Two of each
  const pile = [];
  for (const orb of orbs) pile.push(orb, orb);
  // Fisher-Yates with injected random
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pile[i], pile[j]] = [pile[j], pile[i]];
  }
  return pile.slice(0, total).map((orb, idx) => ({
    id: idx,
    orb,
    faceUp: false,
    matched: false,
  }));
}

export function memoryReducer(state, action) {
  if (!state) return initialState();
  switch (action?.type) {
    case 'NEW_GAME': {
      const difficulty = action.difficulty || state.difficulty || 'standard';
      const next = fresh(difficulty);
      next.cards = dealCards(difficulty, action.random);
      next.phase = 'playing';
      next.startedAt = action.now ?? Date.now();
      // Carry forward bestTime + bestCombo across new games
      next.bestTimeMs = { ...state.bestTimeMs };
      next.bestComboStreak = state.bestComboStreak;
      return next;
    }

    case 'FLIP': {
      if (state.phase !== 'playing') return state;
      if (state.pausedAt != null) return state;
      if (state.locked) return state;
      const idx = Number(action.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.cards.length) return state;
      const card = state.cards[idx];
      if (!card || card.faceUp || card.matched) return state;
      // Block double-flip when 2 cards already up
      if (state.firstPick != null && state.secondPick != null) return state;

      const cards = state.cards.slice();
      cards[idx] = { ...card, faceUp: true };

      if (state.firstPick == null) {
        return { ...state, cards, firstPick: idx };
      }

      // Second pick — resolve match or schedule a flip-back
      const a = cards[state.firstPick];
      const b = cards[idx];
      const moves = state.moves + 1;

      if (a.orb === b.orb) {
        cards[state.firstPick] = { ...a, matched: true };
        cards[idx] = { ...b, matched: true };
        const pairsFound = state.pairsFound + 1;
        const comboStreak = state.comboStreak + 1;
        const bestComboStreak = Math.max(state.bestComboStreak, comboStreak);
        const orbCounts = { ...state.orbCounts, [a.orb]: (state.orbCounts[a.orb] || 0) + 1 };
        const foundLog = [{
          orb: a.orb,
          ts: (action.now ?? Date.now()) - (state.startedAt || 0),
        }, ...state.foundLog].slice(0, 12);
        const phase = pairsFound >= state.pairsTotal ? 'won' : 'playing';
        const finishedAt = phase === 'won' ? (action.now ?? Date.now()) : null;
        let bestTimeMs = state.bestTimeMs;
        if (phase === 'won' && state.startedAt) {
          const elapsed = finishedAt - state.startedAt;
          const prev = bestTimeMs[state.difficulty];
          if (prev == null || elapsed < prev) {
            bestTimeMs = { ...bestTimeMs, [state.difficulty]: elapsed };
          }
        }
        return {
          ...state,
          cards,
          firstPick: null,
          secondPick: null,
          moves,
          pairsFound,
          comboStreak,
          bestComboStreak,
          orbCounts,
          foundLog,
          phase,
          finishedAt,
          bestTimeMs,
        };
      }

      // Mismatch — both flipped, lock, RESOLVE later flips them back
      return {
        ...state,
        cards,
        secondPick: idx,
        moves,
        comboStreak: 0,
        locked: true,
      };
    }

    case 'RESOLVE': {
      if (!state.locked) return state;
      if (state.firstPick == null || state.secondPick == null) return state;
      const cards = state.cards.slice();
      const a = cards[state.firstPick];
      const b = cards[state.secondPick];
      if (a) cards[state.firstPick] = { ...a, faceUp: false };
      if (b) cards[state.secondPick] = { ...b, faceUp: false };
      return {
        ...state,
        cards,
        firstPick: null,
        secondPick: null,
        locked: false,
      };
    }

    case 'SET_DIFFICULTY': {
      if (!DIFFICULTIES[action.difficulty]) return state;
      if (action.difficulty === state.difficulty) return state;
      // Mid-game switch — reset to a new game at the new difficulty
      return memoryReducer(
        { ...state, difficulty: action.difficulty },
        { type: 'NEW_GAME', difficulty: action.difficulty, random: action.random, now: action.now },
      );
    }

    case 'PAUSE': {
      // Freeze the wall clock (window minimized). Elapsed is derived as
      // `(finishedAt || pausedAt || now) - startedAt`, so stamping
      // pausedAt is what stops time from accumulating.
      if (state.phase !== 'playing' || state.pausedAt != null) return state;
      return { ...state, pausedAt: action.now ?? Date.now() };
    }

    case 'RESUME': {
      // Shift startedAt forward by the paused duration so bestTimeMs —
      // computed at win as finishedAt - startedAt — excludes time the
      // window spent minimized.
      if (state.pausedAt == null) return state;
      const now = action.now ?? Date.now();
      return {
        ...state,
        startedAt: state.startedAt != null ? state.startedAt + (now - state.pausedAt) : null,
        pausedAt: null,
      };
    }

    case 'HYDRATE': {
      const incoming = action.state || {};
      const out = { ...state };
      if (DIFFICULTIES[incoming.difficulty]) out.difficulty = incoming.difficulty;
      if (incoming.bestTimeMs && typeof incoming.bestTimeMs === 'object') {
        out.bestTimeMs = {
          easy:     Number.isFinite(incoming.bestTimeMs.easy)     ? incoming.bestTimeMs.easy     : null,
          standard: Number.isFinite(incoming.bestTimeMs.standard) ? incoming.bestTimeMs.standard : null,
          hard:     Number.isFinite(incoming.bestTimeMs.hard)     ? incoming.bestTimeMs.hard     : null,
        };
      }
      if (Number.isFinite(incoming.bestComboStreak)) out.bestComboStreak = incoming.bestComboStreak;
      return out;
    }

    default:
      return state;
  }
}
