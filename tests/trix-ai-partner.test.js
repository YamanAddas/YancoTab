/**
 * Regression tests for partnership أصول (osool) in the Trix AI.
 *
 * Bugs fixed:
 *   • Moderate AI dumped penalty cards (queens, K♥, high diamonds)
 *     on partner's winning trick during off-suit discards.
 *   • Hard AI did the same.
 *   • Hard AI didn't underplay on partner-winning tricks for King /
 *     Diamonds (it has the queens-with-partner branch but not the
 *     others).
 *
 * Convention (per Hasan's Trix Complex guide and Jawaker partner
 * mode): partners must NOT dump penalties on each other. When partner
 * is winning a trick:
 *   - off-suit: discard a non-penalty card (highest is fine — sheds
 *     dangerous cards while letting partner carry the trick)
 *   - following suit: don't overtake partner; play highest safe
 *     under-card if available
 *
 * Partners in this game: south + north (TEAMS.A), east + west (TEAMS.B).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, append() {}, appendChild() {}, setAttribute() {} }),
  };
}

import { chooseMove } from '../os/apps/games/trix/trixAI.js';

function viewBase(overrides = {}) {
  return {
    phase: 'TRICK_PLAY',
    seat: 'south',
    hand: [],
    ledSuit: null,
    contractId: null,
    layoutBySuit: {},
    difficulty: 'moderate',
    currentTrick: [],
    playedCards: [],
    completedTricks: [],
    mode: 'partners',
    partner: 'north',
    ...overrides,
  };
}

describe('Trix AI أصول — moderate AI does NOT dump penalties on partner', () => {
  test('Queens contract: south is void in spades, partner (north) leads ♠A — no queen dumped on partner', () => {
    const view = viewBase({
      contractId: 'queens',
      ledSuit: 'spades',
      currentTrick: [
        { seat: 'north', card: { suit: 'spades', rank: 1 } }, // partner ♠A is winning
        { seat: 'east',  card: { suit: 'spades', rank: 9 } },
      ],
      hand: [
        { suit: 'hearts', rank: 12 },   // ♥Q (penalty!)
        { suit: 'clubs',  rank: 10 },   // safe non-penalty
      ],
    });
    const mv = chooseMove(view);
    assert.equal(mv.type, 'PLAY_CARD');
    // Must not dump the queen on partner.
    assert.notEqual(mv.card.rank, 12, 'must not dump ♥Q on partner');
    assert.equal(mv.card.suit, 'clubs');
  });

  test('Diamonds contract: south is void in clubs, partner leads ♣A — no diamond dumped on partner', () => {
    const view = viewBase({
      contractId: 'diamonds',
      ledSuit: 'clubs',
      currentTrick: [
        { seat: 'north', card: { suit: 'clubs', rank: 1 } }, // partner winning
        { seat: 'east',  card: { suit: 'clubs', rank: 5 } },
      ],
      hand: [
        { suit: 'diamonds', rank: 13 }, // K♦ (penalty)
        { suit: 'spades',   rank: 10 }, // non-penalty
      ],
    });
    const mv = chooseMove(view);
    assert.notEqual(mv.card.suit, 'diamonds', 'must not dump diamond on partner');
    assert.equal(mv.card.suit, 'spades');
  });

  test('King contract: south void in clubs, partner winning — no K♥ dumped on partner', () => {
    const view = viewBase({
      contractId: 'king',
      ledSuit: 'clubs',
      currentTrick: [
        { seat: 'north', card: { suit: 'clubs', rank: 1 } }, // partner winning
        { seat: 'east',  card: { suit: 'clubs', rank: 5 } },
      ],
      hand: [
        { suit: 'hearts', rank: 13 }, // K♥ (penalty!)
        { suit: 'spades', rank: 10 }, // non-penalty
      ],
    });
    const mv = chooseMove(view);
    assert.ok(!(mv.card.suit === 'hearts' && mv.card.rank === 13),
      'must not dump K♥ on partner');
    assert.equal(mv.card.suit, 'spades');
  });

  test('Queens contract: opponent (east) leads ♠A — DO dump ♥Q on opponent', () => {
    const view = viewBase({
      contractId: 'queens',
      ledSuit: 'spades',
      currentTrick: [
        { seat: 'east',  card: { suit: 'spades', rank: 1 } }, // opp winning
        { seat: 'north', card: { suit: 'spades', rank: 9 } }, // partner under
      ],
      hand: [
        { suit: 'hearts', rank: 12 },
        { suit: 'clubs',  rank: 10 },
      ],
    });
    const mv = chooseMove(view);
    // Standard behavior: dump the queen on the opponent.
    assert.equal(mv.card.rank, 12, 'should dump ♥Q on opponent');
  });
});

describe('Trix AI أصول — hard AI honors partner protection too', () => {
  test('Hard: queens, partner winning ♠A — no queen dumped on partner', () => {
    const view = viewBase({
      difficulty: 'hard',
      contractId: 'queens',
      ledSuit: 'spades',
      currentTrick: [
        { seat: 'north', card: { suit: 'spades', rank: 1 } },
        { seat: 'east',  card: { suit: 'spades', rank: 9 } },
      ],
      hand: [
        { suit: 'hearts', rank: 12 },
        { suit: 'clubs',  rank: 10 },
      ],
    });
    const mv = chooseMove(view);
    assert.notEqual(mv.card.rank, 12, 'hard AI must not dump ♥Q on partner');
  });

  test('Hard: diamonds, partner winning ♣A — no diamond dumped on partner', () => {
    const view = viewBase({
      difficulty: 'hard',
      contractId: 'diamonds',
      ledSuit: 'clubs',
      currentTrick: [
        { seat: 'north', card: { suit: 'clubs', rank: 1 } },
        { seat: 'east',  card: { suit: 'clubs', rank: 5 } },
      ],
      hand: [
        { suit: 'diamonds', rank: 13 },
        { suit: 'spades',   rank: 10 },
      ],
    });
    const mv = chooseMove(view);
    assert.notEqual(mv.card.suit, 'diamonds', 'hard AI must not dump diamond on partner');
  });

  test('Hard: king, partner winning ♣A — no K♥ dumped on partner', () => {
    const view = viewBase({
      difficulty: 'hard',
      contractId: 'king',
      ledSuit: 'clubs',
      currentTrick: [
        { seat: 'north', card: { suit: 'clubs', rank: 1 } },
        { seat: 'east',  card: { suit: 'clubs', rank: 5 } },
      ],
      hand: [
        { suit: 'hearts', rank: 13 }, // K♥
        { suit: 'spades', rank: 10 },
      ],
    });
    const mv = chooseMove(view);
    assert.ok(!(mv.card.suit === 'hearts' && mv.card.rank === 13),
      'hard AI must not dump K♥ on partner');
  });

  test('Hard: king, opponent winning — DO dump K♥ on opponent', () => {
    const view = viewBase({
      difficulty: 'hard',
      contractId: 'king',
      ledSuit: 'clubs',
      currentTrick: [
        { seat: 'east', card: { suit: 'clubs', rank: 1 } }, // opp leads
      ],
      hand: [
        { suit: 'hearts', rank: 13 },
        { suit: 'spades', rank: 10 },
      ],
    });
    const mv = chooseMove(view);
    assert.equal(mv.card.suit, 'hearts');
    assert.equal(mv.card.rank, 13, 'should dump K♥ on opponent');
  });
});

describe('Trix AI أصول — single-player mode unaffected', () => {
  test('Single mode: queens, "partner" winning is just another seat — dump as usual', () => {
    const view = viewBase({
      mode: 'single',
      partner: null,
      contractId: 'queens',
      ledSuit: 'spades',
      currentTrick: [
        { seat: 'north', card: { suit: 'spades', rank: 1 } },
        { seat: 'east',  card: { suit: 'spades', rank: 9 } },
      ],
      hand: [
        { suit: 'hearts', rank: 12 },
        { suit: 'clubs',  rank: 10 },
      ],
    });
    const mv = chooseMove(view);
    // No partnership → the queen lands wherever it lands. Default
    // dumping logic (queen first) still applies.
    assert.equal(mv.card.rank, 12);
  });
});

describe('Trix AI أصول — following suit, do not overtake partner', () => {
  test('Hard: king, partner winning ♥Q (current high) — south has ♥A but plays ♥safe under', () => {
    const view = viewBase({
      difficulty: 'hard',
      contractId: 'king',
      ledSuit: 'hearts',
      currentTrick: [
        { seat: 'north', card: { suit: 'hearts', rank: 12 } }, // partner winning ♥Q
        { seat: 'east',  card: { suit: 'hearts', rank: 5 } },
      ],
      hand: [
        { suit: 'hearts', rank: 1 },  // A — would overtake
        { suit: 'hearts', rank: 9 },  // 9 — safe under Q
      ],
    });
    const mv = chooseMove(view);
    // Must play the 9, not the A (don't overtake partner).
    assert.equal(mv.card.rank, 9, 'must not overtake partner with A');
  });

  test('Hard: diamonds, partner winning ♦K — south has ♦A but plays ♦5 under', () => {
    const view = viewBase({
      difficulty: 'hard',
      contractId: 'diamonds',
      ledSuit: 'diamonds',
      currentTrick: [
        { seat: 'north', card: { suit: 'diamonds', rank: 13 } },
        { seat: 'east',  card: { suit: 'diamonds', rank: 7 } },
      ],
      hand: [
        { suit: 'diamonds', rank: 1 },
        { suit: 'diamonds', rank: 5 },
      ],
    });
    const mv = chooseMove(view);
    assert.equal(mv.card.rank, 5, 'must not overtake partner');
  });
});
