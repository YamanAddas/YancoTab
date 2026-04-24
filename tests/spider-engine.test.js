/**
 * Spider Solitaire engine tests (Sp1).
 * Run with: node --test tests/spider-engine.test.js
 *
 * Covers state, rules, deal determinism, moves (including auto-collection
 * of K→A runs to foundation), hints, stuck detection, and reducer dispatch.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeck,
  dealNewGame,
  makeCard,
  isRed,
  cloneState,
  isWon,
  SUITS,
} from '../os/apps/games/spider/engine/state.js';
import { dealFromSeed } from '../os/apps/games/spider/engine/deal.js';
import {
  canPlaceOnTableau,
  isValidRun,
  isCompletedRun,
  canDealRow,
} from '../os/apps/games/spider/engine/rules.js';
import {
  moveTableauToTableau,
  dealRow,
} from '../os/apps/games/spider/engine/moves.js';
import {
  enumerateMoves,
  hasProductiveMove,
  isStuck,
} from '../os/apps/games/spider/engine/hints.js';
import { reducer, hashString } from '../os/apps/games/spider/engine/reducer.js';
import { dailySeed } from '../os/apps/games/shared/rng.js';

// ─────────────────────────────────────────────
// Test helpers — construct states without the RNG so rule-level assertions
// aren't at the mercy of a particular deal.
// ─────────────────────────────────────────────
function card(suit, rank, copy = 0, faceUp = true) {
  return { suit, rank, copy, faceUp, id: `${suit}${rank}_${copy}` };
}

function emptyState({ difficulty = 1, stock = [] } = {}) {
  return {
    tableau: Array.from({ length: 10 }, () => []),
    foundation: [],
    stock,
    difficulty,
    score: 500,
    moves: 0,
    startedAt: null,
    elapsedMs: 0,
    seed: 0,
    won: false,
  };
}

// Build a K→A run of `suit` at `copy` — a pile this shape, if at the tail
// of a column, will auto-collect on any finalize pass.
function completedRun(suit, copy = 0) {
  const run = [];
  for (let r = 13; r >= 1; r--) run.push(card(suit, r, copy, true));
  return run;
}

// ─────────────────────────────────────────────
// state.js
// ─────────────────────────────────────────────
describe('state — buildDeck', () => {
  test('difficulty 1: 104 cards, all Spades, 8 copies per rank', () => {
    const deck = buildDeck(1);
    assert.equal(deck.length, 104);
    assert.ok(deck.every((c) => c.suit === 'S'));
    const byRank = new Map();
    for (const c of deck) byRank.set(c.rank, (byRank.get(c.rank) || 0) + 1);
    for (let r = 1; r <= 13; r++) assert.equal(byRank.get(r), 8);
  });

  test('difficulty 2: 104 cards, 4 copies each of Spades + Hearts', () => {
    const deck = buildDeck(2);
    assert.equal(deck.length, 104);
    const suits = new Set(deck.map((c) => c.suit));
    assert.deepEqual([...suits].sort(), ['H', 'S']);
    assert.equal(deck.filter((c) => c.suit === 'S').length, 52);
    assert.equal(deck.filter((c) => c.suit === 'H').length, 52);
  });

  test('difficulty 4: 104 cards, 2 copies each of all 4 suits', () => {
    const deck = buildDeck(4);
    assert.equal(deck.length, 104);
    for (const s of SUITS) {
      assert.equal(deck.filter((c) => c.suit === s).length, 26);
    }
  });

  test('card ids are globally unique across copies', () => {
    for (const d of [1, 2, 4]) {
      const deck = buildDeck(d);
      const ids = new Set(deck.map((c) => c.id));
      assert.equal(ids.size, deck.length, `difficulty ${d}`);
    }
  });
});

describe('state — isRed / makeCard', () => {
  test('hearts and diamonds are red, clubs and spades are black', () => {
    assert.equal(isRed(makeCard('H', 5)), true);
    assert.equal(isRed(makeCard('D', 7)), true);
    assert.equal(isRed(makeCard('C', 9)), false);
    assert.equal(isRed(makeCard('S', 3)), false);
  });

  test('makeCard starts face-down with stable id', () => {
    const c = makeCard('H', 7, 1);
    assert.equal(c.faceUp, false);
    assert.equal(c.id, 'H7_1');
  });
});

describe('state — dealNewGame layout', () => {
  test('tableau is 6,6,6,6,5,5,5,5,5,5 with only top face-up', () => {
    const deck = buildDeck(1);
    const s = dealNewGame(deck, { difficulty: 1 });
    assert.equal(s.tableau.length, 10);
    const expected = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5];
    for (let c = 0; c < 10; c++) {
      assert.equal(s.tableau[c].length, expected[c]);
      for (let r = 0; r < s.tableau[c].length; r++) {
        const isTop = r === s.tableau[c].length - 1;
        assert.equal(s.tableau[c][r].faceUp, isTop);
      }
    }
  });

  test('stock has 50 face-down cards, foundation empty', () => {
    const s = dealNewGame(buildDeck(1));
    assert.equal(s.stock.length, 50);
    assert.ok(s.stock.every((c) => !c.faceUp));
    assert.equal(s.foundation.length, 0);
  });

  test('initial score is 500, moves 0, not won', () => {
    const s = dealNewGame(buildDeck(1));
    assert.equal(s.score, 500);
    assert.equal(s.moves, 0);
    assert.equal(s.won, false);
  });

  test('difficulty is carried through from opts', () => {
    const s2 = dealNewGame(buildDeck(2), { difficulty: 2 });
    assert.equal(s2.difficulty, 2);
  });
});

describe('state — cloneState and isWon', () => {
  test('cloneState is a deep copy', () => {
    const s = dealNewGame(buildDeck(1));
    const c = cloneState(s);
    c.tableau[0][0].faceUp = !c.tableau[0][0].faceUp;
    assert.notEqual(c.tableau[0][0].faceUp, s.tableau[0][0].faceUp);
    c.stock.push(card('S', 1, 9));
    assert.notEqual(c.stock.length, s.stock.length);
  });

  test('isWon true when foundation has 8 completed runs', () => {
    const s = emptyState();
    s.foundation = Array.from({ length: 8 }, () => completedRun('S'));
    assert.equal(isWon(s), true);
  });

  test('isWon false with fewer than 8 runs', () => {
    const s = emptyState();
    s.foundation = Array.from({ length: 7 }, () => completedRun('S'));
    assert.equal(isWon(s), false);
  });
});

// ─────────────────────────────────────────────
// deal.js — seeded determinism
// ─────────────────────────────────────────────
describe('deal — seeded determinism', () => {
  test('same seed + difficulty produces identical deals', () => {
    const a = dealFromSeed(12345, { difficulty: 1 });
    const b = dealFromSeed(12345, { difficulty: 1 });
    for (let c = 0; c < 10; c++) {
      assert.equal(a.tableau[c].length, b.tableau[c].length);
      for (let i = 0; i < a.tableau[c].length; i++) {
        assert.equal(a.tableau[c][i].id, b.tableau[c][i].id);
      }
    }
    assert.deepEqual(a.stock.map((c) => c.id), b.stock.map((c) => c.id));
  });

  test('different seeds produce different deals', () => {
    const a = dealFromSeed(1, { difficulty: 1 });
    const b = dealFromSeed(2, { difficulty: 1 });
    const aIds = a.tableau.flat().map((c) => c.id).join(',');
    const bIds = b.tableau.flat().map((c) => c.id).join(',');
    assert.notEqual(aIds, bIds);
  });

  test('same seed across difficulty levels yields different decks', () => {
    const d1 = dealFromSeed(42, { difficulty: 1 });
    const d4 = dealFromSeed(42, { difficulty: 4 });
    assert.equal(d1.difficulty, 1);
    assert.equal(d4.difficulty, 4);
    const d1Suits = new Set(d1.tableau.flat().map((c) => c.suit));
    const d4Suits = new Set(d4.tableau.flat().map((c) => c.suit));
    assert.equal(d1Suits.size, 1);                        // all Spades
    assert.ok(d4Suits.size >= 2, 'difficulty 4 mixes suits');
  });

  test('dailySeed is stable for the same UTC date', () => {
    const d = new Date(Date.UTC(2026, 3, 24));            // April 24, 2026
    assert.equal(dailySeed(d), 20260424);
  });

  test('total card count across tableau+stock is always 104', () => {
    for (const seed of [1, 100, 99999]) {
      for (const diff of [1, 2, 4]) {
        const s = dealFromSeed(seed, { difficulty: diff });
        const total = s.tableau.flat().length + s.stock.length;
        assert.equal(total, 104, `seed=${seed} diff=${diff}`);
      }
    }
  });
});

// ─────────────────────────────────────────────
// rules.js
// ─────────────────────────────────────────────
describe('rules — canPlaceOnTableau', () => {
  test('empty pile accepts any card', () => {
    assert.equal(canPlaceOnTableau([], card('S', 5)), true);
    assert.equal(canPlaceOnTableau([], card('H', 13)), true);
    assert.equal(canPlaceOnTableau([], card('D', 1)), true);
  });

  test('places on top-rank minus 1 regardless of suit', () => {
    const pile = [card('S', 7, 0, true)];
    assert.equal(canPlaceOnTableau(pile, card('S', 6)), true);
    assert.equal(canPlaceOnTableau(pile, card('H', 6)), true);      // suit-agnostic
    assert.equal(canPlaceOnTableau(pile, card('D', 6)), true);
  });

  test('rejects when ranks do not ladder down by 1', () => {
    const pile = [card('S', 7, 0, true)];
    assert.equal(canPlaceOnTableau(pile, card('S', 5)), false);
    assert.equal(canPlaceOnTableau(pile, card('S', 7)), false);
    assert.equal(canPlaceOnTableau(pile, card('S', 8)), false);
  });

  test('rejects when top is face-down', () => {
    const pile = [card('S', 7, 0, false)];
    assert.equal(canPlaceOnTableau(pile, card('H', 6)), false);
  });
});

describe('rules — isValidRun', () => {
  test('single face-up card is always a valid run', () => {
    const pile = [card('S', 5, 0, true)];
    assert.equal(isValidRun(pile, 0), true);
  });

  test('same-suit descending-by-1 is valid', () => {
    const pile = [card('S', 10), card('S', 9), card('S', 8), card('S', 7)];
    assert.equal(isValidRun(pile, 0), true);
    assert.equal(isValidRun(pile, 2), true);    // from 8
  });

  test('mixed-suit run is NOT valid (placement-only, not group-move)', () => {
    const pile = [card('S', 10), card('H', 9), card('S', 8)];
    assert.equal(isValidRun(pile, 0), false);
    assert.equal(isValidRun(pile, 1), false);   // H9→S8 still suit-mismatch
    assert.equal(isValidRun(pile, 2), true);    // trailing single card
  });

  test('non-descending run is invalid', () => {
    const pile = [card('S', 10), card('S', 8)];
    assert.equal(isValidRun(pile, 0), false);
  });

  test('face-down card breaks the run', () => {
    const pile = [card('S', 10, 0, false), card('S', 9)];
    assert.equal(isValidRun(pile, 0), false);
  });

  test('out-of-range index returns false', () => {
    const pile = [card('S', 10)];
    assert.equal(isValidRun(pile, -1), false);
    assert.equal(isValidRun(pile, 5), false);
  });
});

describe('rules — isCompletedRun', () => {
  test('exact face-up K→A same-suit is complete', () => {
    assert.equal(isCompletedRun(completedRun('H')), true);
  });

  test('completed run preceded by other cards still counts (tail check)', () => {
    const pile = [card('C', 2), card('C', 1), ...completedRun('D')];
    assert.equal(isCompletedRun(pile), true);
  });

  test('fewer than 13 cards → not complete', () => {
    assert.equal(isCompletedRun([card('S', 13)]), false);
  });

  test('wrong suit in the middle → not complete', () => {
    const run = completedRun('S');
    run[5] = card('H', run[5].rank, 0, true);
    assert.equal(isCompletedRun(run), false);
  });

  test('face-down card in run → not complete', () => {
    const run = completedRun('S');
    run[0] = { ...run[0], faceUp: false };
    assert.equal(isCompletedRun(run), false);
  });

  test('K not at position [-13] → not complete', () => {
    // Shift: start at Q instead of K
    const pile = completedRun('S').slice(1);               // 12 cards Q→A
    pile.unshift(card('S', 1, 1, true));                   // pad at front
    // Last 13 now: A(pad), Q, J, ..., A — not K→A
    assert.equal(isCompletedRun(pile), false);
  });
});

describe('rules — canDealRow', () => {
  test('allows deal when stock≥10 and all columns non-empty', () => {
    const s = emptyState({ stock: Array(10).fill(0).map((_, i) => card('S', i + 1, 0, false)) });
    for (let c = 0; c < 10; c++) s.tableau[c].push(card('S', 5, c, true));
    assert.equal(canDealRow(s), true);
  });

  test('rejects when any column is empty', () => {
    const s = emptyState({ stock: Array(10).fill(0).map((_, i) => card('S', i + 1, 0, false)) });
    for (let c = 0; c < 9; c++) s.tableau[c].push(card('S', 5, c, true));
    // column 9 empty
    assert.equal(canDealRow(s), false);
  });

  test('rejects when stock < 10', () => {
    const s = emptyState({ stock: Array(9).fill(0).map((_, i) => card('S', i + 1, 0, false)) });
    for (let c = 0; c < 10; c++) s.tableau[c].push(card('S', 5, c, true));
    assert.equal(canDealRow(s), false);
  });
});

// ─────────────────────────────────────────────
// moves.js
// ─────────────────────────────────────────────
describe('moves — moveTableauToTableau', () => {
  test('valid single-card move, cross-suit placement is allowed', () => {
    const s = emptyState({ difficulty: 4 });
    s.tableau[0] = [card('S', 7, 0, true)];
    s.tableau[1] = [card('H', 6, 0, true)];                // H6 is movable
    const next = moveTableauToTableau(s, 1, 0, 0);         // H6 onto S7
    assert.ok(next);
    assert.equal(next.tableau[0].length, 2);
    assert.equal(next.tableau[1].length, 0);
    assert.equal(next.tableau[0][1].id, 'H6_0');
    assert.equal(next.moves, 1);
    assert.equal(next.score, 499);                         // -1 per move
  });

  test('rejects mixed-suit GROUP move (even if placement-legal for head)', () => {
    const s = emptyState({ difficulty: 4 });
    s.tableau[0] = [card('S', 8, 0, true)];
    s.tableau[1] = [card('H', 7, 0, true), card('S', 6, 0, true)]; // mixed
    // Head H7 is placement-legal on S8, but the group isn't a valid run.
    const next = moveTableauToTableau(s, 1, 0, 0);
    assert.equal(next, null);
  });

  test('allows same-suit GROUP move', () => {
    const s = emptyState({ difficulty: 4 });
    s.tableau[0] = [card('S', 8, 0, true)];
    s.tableau[1] = [card('H', 7, 0, true), card('H', 6, 0, true)];
    const next = moveTableauToTableau(s, 1, 0, 0);
    assert.ok(next);
    assert.equal(next.tableau[0].length, 3);
    assert.equal(next.tableau[1].length, 0);
    assert.equal(next.tableau[0][1].id, 'H7_0');
    assert.equal(next.tableau[0][2].id, 'H6_0');
  });

  test('rejects same-column move', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 7, 0, true), card('S', 6, 0, true)];
    assert.equal(moveTableauToTableau(s, 0, 1, 0), null);
  });

  test('rejects rank mismatch', () => {
    const s = emptyState({ difficulty: 4 });
    s.tableau[0] = [card('S', 9, 0, true)];
    s.tableau[1] = [card('H', 6, 0, true)];                // needs 8 on 9
    assert.equal(moveTableauToTableau(s, 1, 0, 0), null);
  });

  test('flips newly exposed face-down card on source column', () => {
    const s = emptyState({ difficulty: 4 });
    s.tableau[0] = [card('S', 7, 0, true)];
    s.tableau[1] = [
      card('D', 10, 0, false),                             // hidden
      card('H', 6, 0, true),
    ];
    const next = moveTableauToTableau(s, 1, 1, 0);
    assert.ok(next);
    assert.equal(next.tableau[1].length, 1);
    assert.equal(next.tableau[1][0].faceUp, true);         // flipped!
  });

  test('does NOT mutate input state', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 7, 0, true)];
    s.tableau[1] = [card('S', 6, 0, true)];
    const snap = JSON.stringify(s);
    moveTableauToTableau(s, 1, 0, 0);
    assert.equal(JSON.stringify(s), snap);
  });

  test('auto-collects K→A to foundation on any move', () => {
    const s = emptyState();
    // Column 0 holds a pre-built complete run — the next finalize must
    // sweep it away.
    s.tableau[0] = completedRun('S');
    // Column 1 has something to move so we can trigger finalize legally.
    s.tableau[2] = [card('S', 9, 0, true)];
    s.tableau[3] = [card('S', 8, 0, true)];
    const next = moveTableauToTableau(s, 3, 0, 2);
    assert.ok(next);
    assert.equal(next.foundation.length, 1);
    assert.equal(next.tableau[0].length, 0);
    // +100 for the suit, -1 for the move: net +99
    assert.equal(next.score, 599);
  });

  test('reaches won=true when 8th foundation lands', () => {
    const s = emptyState();
    // 7 already done, 1 in progress on column 0.
    s.foundation = Array.from({ length: 7 }, () => completedRun('S'));
    s.tableau[0] = completedRun('S');
    s.tableau[2] = [card('S', 9, 0, true)];
    s.tableau[3] = [card('S', 8, 0, true)];
    const next = moveTableauToTableau(s, 3, 0, 2);
    assert.ok(next);
    assert.equal(next.foundation.length, 8);
    assert.equal(next.won, true);
  });
});

describe('moves — dealRow', () => {
  test('happy path: stock -10, each column +1 face-up card', () => {
    const s = dealFromSeed(99, { difficulty: 1 });
    const before = s.tableau.map((c) => c.length);
    const next = dealRow(s);
    assert.ok(next);
    assert.equal(next.stock.length, 40);
    for (let c = 0; c < 10; c++) {
      assert.equal(next.tableau[c].length, before[c] + 1);
      assert.equal(next.tableau[c][next.tableau[c].length - 1].faceUp, true);
    }
    assert.equal(next.moves, 1);
  });

  test('rejected when any column is empty', () => {
    const s = dealFromSeed(99, { difficulty: 1 });
    s.tableau[3] = [];
    assert.equal(dealRow(s), null);
  });

  test('rejected when stock has fewer than 10', () => {
    const s = dealFromSeed(99, { difficulty: 1 });
    s.stock = s.stock.slice(0, 5);
    assert.equal(dealRow(s), null);
  });

  test('five successful deals exhaust the stock exactly', () => {
    let s = dealFromSeed(123, { difficulty: 1 });
    for (let i = 0; i < 5; i++) {
      const n = dealRow(s);
      assert.ok(n, `deal ${i + 1} must succeed`);
      s = n;
    }
    assert.equal(s.stock.length, 0);
    assert.equal(dealRow(s), null);                        // 6th attempt fails
  });
});

// ─────────────────────────────────────────────
// hints.js — enumerateMoves, isStuck
// ─────────────────────────────────────────────
describe('hints — enumerateMoves', () => {
  test('returns DEAL when tableau is non-empty and stock ≥10', () => {
    const s = dealFromSeed(7, { difficulty: 1 });
    const moves = enumerateMoves(s);
    assert.ok(moves.some((m) => m.type === 'DEAL'));
  });

  test('prunes unproductive cross-suit shuffles', () => {
    // Fixture where moving H7/D7 onto S8 would be the ONLY legal moves
    // and they're pure cross-suit shuffles: no flip (the card underneath
    // each is already face-up), no empty (each source column has 2
    // cards), no same-suit build, and no empty destination (all 10
    // columns are filled). Expectation: zero tableau moves surface.
    const s = emptyState({ difficulty: 4 });
    s.tableau[0] = [card('S', 9, 0, true), card('S', 8, 0, true)];
    s.tableau[1] = [card('C', 3, 0, true), card('H', 7, 0, true)];
    s.tableau[2] = [card('C', 4, 0, true), card('D', 7, 0, true)];
    // Fill columns 3–9 with bare Aces so nothing can land on them (needs
    // a card of rank 0, which doesn't exist).
    for (let c = 3; c < 10; c++) s.tableau[c] = [card('S', 1, c, true)];
    const moves = enumerateMoves(s);
    const tableauMoves = moves.filter((m) => m.type === 'T_TO_T');
    assert.equal(tableauMoves.length, 0);
  });

  test('keeps move that flips a face-down card', () => {
    const s = emptyState({ difficulty: 4 });
    s.tableau[0] = [card('S', 8, 0, true)];
    s.tableau[1] = [card('C', 10, 0, false), card('H', 7, 0, true)];
    const moves = enumerateMoves(s);
    const flipper = moves.find((m) => m.type === 'T_TO_T' && m.from === 1 && m.to === 0);
    assert.ok(flipper, 'flipping move should be present');
    assert.ok(flipper.score >= 10);
  });

  test('keeps same-suit build onto a non-empty column', () => {
    const s = emptyState({ difficulty: 4 });
    s.tableau[0] = [card('S', 8, 0, true)];
    s.tableau[1] = [card('S', 7, 0, true)];
    const moves = enumerateMoves(s);
    const builder = moves.find((m) => m.type === 'T_TO_T' && m.from === 1 && m.to === 0);
    assert.ok(builder);
  });

  test('sorted descending by score', () => {
    const s = dealFromSeed(55, { difficulty: 1 });
    const moves = enumerateMoves(s);
    for (let i = 1; i < moves.length; i++) {
      assert.ok(moves[i - 1].score >= moves[i].score);
    }
  });
});

describe('hints — hasProductiveMove / isStuck', () => {
  test('hasProductiveMove false when only DEAL is available', () => {
    const s = emptyState();
    for (let c = 0; c < 10; c++) s.tableau[c] = [card('S', 2, c, true)];  // all 2s, no build possible
    s.stock = Array.from({ length: 10 }, (_, i) => card('S', 3, i, false));
    assert.equal(hasProductiveMove(s), false);
    assert.equal(isStuck(s), false);                       // still can deal
  });

  test('isStuck true when nothing productive AND can\'t deal', () => {
    const s = emptyState();
    // All 2s, stock empty — no legal productive move, no deal available.
    for (let c = 0; c < 10; c++) s.tableau[c] = [card('S', 2, c, true)];
    assert.equal(isStuck(s), true);
  });

  test('isStuck false on a fresh deal', () => {
    const s = dealFromSeed(42, { difficulty: 1 });
    assert.equal(isStuck(s), false);
  });

  test('isStuck false when won', () => {
    const s = emptyState();
    s.foundation = Array.from({ length: 8 }, () => completedRun('S'));
    s.won = true;
    assert.equal(isStuck(s), false);
  });
});

// ─────────────────────────────────────────────
// reducer.js
// ─────────────────────────────────────────────
describe('reducer', () => {
  test('T_TO_T dispatches to moveTableauToTableau', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 7, 0, true)];
    s.tableau[1] = [card('S', 6, 0, true)];
    const r = reducer(s, { type: 'T_TO_T', from: 1, idx: 0, to: 0 });
    assert.notEqual(r.state, s);
    assert.equal(r.events[0].type, 'moveTableau');
  });

  test('illegal move returns same state + illegal event', () => {
    const s = emptyState();
    s.tableau[0] = [card('S', 7, 0, true)];
    s.tableau[1] = [card('H', 5, 0, true)];                // can't place on S7
    const r = reducer(s, { type: 'T_TO_T', from: 1, idx: 0, to: 0 });
    assert.equal(r.state, s);
    assert.equal(r.events[0].type, 'illegal');
  });

  test('DEAL action succeeds when legal', () => {
    const s = dealFromSeed(10, { difficulty: 1 });
    const r = reducer(s, { type: 'DEAL' });
    assert.equal(r.events[0].type, 'deal');
    assert.equal(r.state.stock.length, 40);
  });

  test('RESET/UNDO/REDO pass the payload as the new state', () => {
    const s = emptyState();
    const payload = { ...s, score: 999 };
    assert.equal(reducer(s, { type: 'RESET', payload }).state.score, 999);
    assert.equal(reducer(s, { type: 'UNDO', payload }).state.score, 999);
    assert.equal(reducer(s, { type: 'REDO', payload }).state.score, 999);
  });

  test('hashString is deterministic and non-zero for non-empty input', () => {
    assert.equal(hashString('DAILY-20260424'), hashString('DAILY-20260424'));
    assert.notEqual(hashString('a'), hashString('b'));
    assert.ok(hashString('anything') > 0);
  });
});
