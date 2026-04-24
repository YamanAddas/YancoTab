// Deterministic deal entry point. Takes a numeric seed + difficulty and
// returns an initial state — same signature as solitaire/engine/deal.js
// so the app shell can treat both games uniformly.

import { buildDeck, dealNewGame } from './state.js';
import { seededMulberry32 } from '../../shared/rng.js';

export function dealFromSeed(seed, opts = {}) {
  const difficulty = opts.difficulty || 1;
  const rng = seededMulberry32(seed);
  const deck = buildDeck(difficulty);
  rng.shuffle(deck);
  return dealNewGame(deck, { ...opts, seed, difficulty });
}
