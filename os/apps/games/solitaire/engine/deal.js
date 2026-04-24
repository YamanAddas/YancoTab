import { buildDeck, dealNewGame } from './state.js';
import { seededMulberry32 } from '../../shared/rng.js';

// Deterministic deal given a numeric seed.
export function dealFromSeed(seed, opts = {}) {
  const rng = seededMulberry32(seed);
  const deck = buildDeck();
  rng.shuffle(deck);
  return dealNewGame(deck, { ...opts, seed });
}
