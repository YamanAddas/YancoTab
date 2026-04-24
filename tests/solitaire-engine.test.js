/**
 * Solitaire engine tests (S1).
 * Run with: node --test tests/solitaire-engine.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeck,
  dealNewGame,
  makeCard,
  isRed,
  oppositeColor,
  cloneState,
  isWon,
  SUIT_INDEX,
} from '../os/apps/games/solitaire/engine/state.js';
import { dealFromSeed } from '../os/apps/games/solitaire/engine/deal.js';
import {
  canPlaceOnTableau,
  canPlaceOnFoundation,
  isValidRun,
} from '../os/apps/games/solitaire/engine/rules.js';
import {
  drawFromStock,
  moveWasteToTableau,
  moveWasteToFoundation,
  moveTableauToFoundation,
  moveFoundationToTableau,
  moveTableauToTableau,
  autoCollect,
} from '../os/apps/games/solitaire/engine/moves.js';
import { seededMulberry32, dailySeed } from '../os/apps/games/shared/rng.js';

// ─────────────────────────────────────────────
// state
// ─────────────────────────────────────────────
describe('state', () => {
  test('buildDeck produces 52 unique cards', () => {
    const deck = buildDeck();
    assert.equal(deck.length, 52);
    const ids = new Set(deck.map((c) => c.id));
    assert.equal(ids.size, 52);
  });

  test('isRed and oppositeColor', () => {
    assert.equal(isRed(makeCard('H', 5)), true);
    assert.equal(isRed(makeCard('S', 5)), false);
    assert.equal(oppositeColor(makeCard('H', 5), makeCard('S', 4)), true);
    assert.equal(oppositeColor(makeCard('H', 5), makeCard('D', 4)), false);
  });

  test('dealNewGame layout is correct', () => {
    const deck = buildDeck();
    const s = dealNewGame(deck);
    assert.equal(s.tableau.length, 7);
    for (let i = 0; i < 7; i++) {
      assert.equal(s.tableau[i].length, i + 1);
      // only top card is face-up
      for (let j = 0; j < s.tableau[i].length; j++) {
        assert.equal(s.tableau[i][j].faceUp, j === i);
      }
    }
    assert.equal(s.stock.length, 52 - 28);
    assert.equal(s.waste.length, 0);
    assert.equal(s.foundation.flat().length, 0);
    assert.equal(s.won, false);
  });

  test('cloneState is a deep copy', () => {
    const s = dealNewGame(buildDeck());
    const c = cloneState(s);
    c.tableau[0][0].faceUp = !c.tableau[0][0].faceUp;
    assert.notEqual(c.tableau[0][0].faceUp, s.tableau[0][0].faceUp);
  });

  test('isWon true when every foundation is 13', () => {
    const s = dealNewGame(buildDeck());
    for (let i = 0; i < 4; i++) {
      s.foundation[i] = Array.from({ length: 13 }, (_, r) => makeCard('H', r + 1));
    }
    assert.equal(isWon(s), true);
  });
});

// ─────────────────────────────────────────────
// deal determinism
// ─────────────────────────────────────────────
describe('dealFromSeed', () => {
  test('same seed => same tableau', () => {
    const a = dealFromSeed(42);
    const b = dealFromSeed(42);
    const sig = (s) => s.tableau.map((p) => p.map((c) => c.id).join(',')).join('|');
    assert.equal(sig(a), sig(b));
  });

  test('different seeds => different layouts', () => {
    const a = dealFromSeed(1);
    const b = dealFromSeed(2);
    const sig = (s) => s.tableau.map((p) => p.map((c) => c.id).join(',')).join('|');
    assert.notEqual(sig(a), sig(b));
  });
});

// ─────────────────────────────────────────────
// rules
// ─────────────────────────────────────────────
describe('rules', () => {
  test('canPlaceOnTableau: empty accepts only K', () => {
    assert.equal(canPlaceOnTableau([], makeCard('H', 13)), true);
    assert.equal(canPlaceOnTableau([], makeCard('H', 12)), false);
  });

  test('canPlaceOnTableau: alternating color, rank-1', () => {
    const top = { ...makeCard('S', 7), faceUp: true };
    assert.equal(canPlaceOnTableau([top], makeCard('H', 6)), true);  // red on black
    assert.equal(canPlaceOnTableau([top], makeCard('D', 6)), true);
    assert.equal(canPlaceOnTableau([top], makeCard('C', 6)), false); // same color
    assert.equal(canPlaceOnTableau([top], makeCard('H', 5)), false); // wrong rank
  });

  test('canPlaceOnTableau: face-down top rejects', () => {
    const top = { ...makeCard('S', 7), faceUp: false };
    assert.equal(canPlaceOnTableau([top], makeCard('H', 6)), false);
  });

  test('canPlaceOnFoundation: empty accepts only Ace of suit', () => {
    const foundation = [[], [], [], []];
    assert.equal(canPlaceOnFoundation(foundation, makeCard('H', 1)), true);
    assert.equal(canPlaceOnFoundation(foundation, makeCard('H', 2)), false);
  });

  test('canPlaceOnFoundation: same suit ascending', () => {
    const foundation = [[], [], [], []];
    foundation[SUIT_INDEX.H] = [makeCard('H', 1)];
    assert.equal(canPlaceOnFoundation(foundation, makeCard('H', 2)), true);
    assert.equal(canPlaceOnFoundation(foundation, makeCard('D', 2)), false);
    assert.equal(canPlaceOnFoundation(foundation, makeCard('H', 3)), false);
  });

  test('isValidRun: valid alternating descending run', () => {
    const pile = [
      { ...makeCard('S', 10), faceUp: true },
      { ...makeCard('H', 9), faceUp: true },
      { ...makeCard('C', 8), faceUp: true },
    ];
    assert.equal(isValidRun(pile, 0), true);
    assert.equal(isValidRun(pile, 1), true);
    assert.equal(isValidRun(pile, 2), true);
  });

  test('isValidRun: rejects same color or bad rank', () => {
    const bad = [
      { ...makeCard('S', 10), faceUp: true },
      { ...makeCard('C', 9), faceUp: true },
    ];
    assert.equal(isValidRun(bad, 0), false);
    const bad2 = [
      { ...makeCard('S', 10), faceUp: true },
      { ...makeCard('H', 7), faceUp: true },
    ];
    assert.equal(isValidRun(bad2, 0), false);
  });

  test('isValidRun: rejects face-down', () => {
    const pile = [{ ...makeCard('S', 10), faceUp: false }];
    assert.equal(isValidRun(pile, 0), false);
  });
});

// ─────────────────────────────────────────────
// moves
// ─────────────────────────────────────────────
describe('moves', () => {
  function baseState() {
    return dealFromSeed(12345, { drawCount: 1, scoring: 'standard' });
  }

  test('drawFromStock moves one card to waste (draw-1)', () => {
    const s0 = baseState();
    const s1 = drawFromStock(s0);
    assert.equal(s1.waste.length, 1);
    assert.equal(s1.stock.length, s0.stock.length - 1);
    assert.equal(s1.waste[0].faceUp, true);
    assert.equal(s1.moves, 1);
  });

  test('drawFromStock (draw-3) moves up to 3', () => {
    const s0 = dealFromSeed(7, { drawCount: 3 });
    const s1 = drawFromStock(s0);
    assert.equal(s1.waste.length, 3);
  });

  test('drawFromStock returns null when stock and waste both empty', () => {
    const s0 = baseState();
    s0.stock = [];
    s0.waste = [];
    assert.equal(drawFromStock(s0), null);
  });

  test('drawFromStock recycles waste when stock empty', () => {
    const s0 = baseState();
    s0.stock = [];
    s0.waste = [{ ...makeCard('H', 5), faceUp: true }, { ...makeCard('S', 6), faceUp: true }];
    const s1 = drawFromStock(s0);
    assert.equal(s1.stock.length, 2);
    assert.equal(s1.waste.length, 0);
    assert.equal(s1.stock[0].faceUp, false);
    assert.equal(s1.score, -100); // standard draw-1 recycle
  });

  test('vegas: no recycle', () => {
    const s0 = dealFromSeed(3, { scoring: 'vegas' });
    s0.stock = [];
    s0.waste = [{ ...makeCard('H', 5), faceUp: true }];
    assert.equal(drawFromStock(s0), null);
  });

  test('moveWasteToFoundation legal / illegal', () => {
    const s = baseState();
    s.waste = [{ ...makeCard('H', 1), faceUp: true }];
    const ok = moveWasteToFoundation(s);
    assert.ok(ok);
    assert.equal(ok.foundation[SUIT_INDEX.H].length, 1);
    assert.equal(ok.waste.length, 0);
    assert.equal(ok.score, 10);

    const s2 = baseState();
    s2.waste = [{ ...makeCard('H', 5), faceUp: true }];
    assert.equal(moveWasteToFoundation(s2), null);
  });

  test('moveWasteToTableau legal on K->empty, alt color desc', () => {
    const s = baseState();
    s.tableau[0] = []; // emptied
    s.waste = [{ ...makeCard('S', 13), faceUp: true }];
    const ok = moveWasteToTableau(s, 0);
    assert.ok(ok);
    assert.equal(ok.tableau[0][0].id, 'S13');
    assert.equal(ok.score, 5);
  });

  test('moveTableauToFoundation flips newly-exposed card', () => {
    const s = baseState();
    // craft column 0: [face-down X, face-up Ace of H]
    s.tableau[0] = [
      { ...makeCard('C', 7), faceUp: false },
      { ...makeCard('H', 1), faceUp: true },
    ];
    const ok = moveTableauToFoundation(s, 0);
    assert.ok(ok);
    assert.equal(ok.tableau[0].length, 1);
    assert.equal(ok.tableau[0][0].faceUp, true);
    // flip bonus +5, foundation +10
    assert.equal(ok.score, 15);
  });

  test('moveTableauToFoundation rejects when top not playable', () => {
    const s = baseState();
    s.tableau[0] = [{ ...makeCard('H', 5), faceUp: true }];
    assert.equal(moveTableauToFoundation(s, 0), null);
  });

  test('moveFoundationToTableau legal / scoring penalty', () => {
    const s = baseState();
    s.foundation[SUIT_INDEX.H] = [makeCard('H', 1), makeCard('H', 2)];
    s.foundation[SUIT_INDEX.H].forEach((c) => (c.faceUp = true));
    s.tableau[0] = [{ ...makeCard('S', 3), faceUp: true }];
    const ok = moveFoundationToTableau(s, 'H', 0);
    assert.ok(ok);
    assert.equal(ok.tableau[0][1].id, 'H2');
    assert.equal(ok.foundation[SUIT_INDEX.H].length, 1);
    assert.equal(ok.score, -15);
  });

  test('moveTableauToTableau moves a run and flips', () => {
    const s = baseState();
    s.tableau[0] = [
      { ...makeCard('D', 9), faceUp: false },
      { ...makeCard('H', 7), faceUp: true },
      { ...makeCard('C', 6), faceUp: true },
    ];
    s.tableau[1] = [{ ...makeCard('S', 8), faceUp: true }];
    const ok = moveTableauToTableau(s, 0, 1, 1);
    assert.ok(ok);
    assert.equal(ok.tableau[1].length, 3);
    assert.equal(ok.tableau[0].length, 1);
    assert.equal(ok.tableau[0][0].faceUp, true); // flipped
  });

  test('moveTableauToTableau rejects same col or invalid run', () => {
    const s = baseState();
    assert.equal(moveTableauToTableau(s, 1, 0, 1), null);
    s.tableau[0] = [
      { ...makeCard('S', 7), faceUp: true },
      { ...makeCard('C', 6), faceUp: true }, // same color -> invalid run
    ];
    s.tableau[1] = [{ ...makeCard('D', 8), faceUp: true }];
    assert.equal(moveTableauToTableau(s, 0, 0, 1), null);
  });

  test('autoCollect moves an ace up from waste', () => {
    const s = baseState();
    s.waste = [{ ...makeCard('H', 1), faceUp: true }];
    const out = autoCollect(s);
    assert.equal(out.foundation[SUIT_INDEX.H].length, 1);
  });

  test('full win path: fabricate near-win and auto-collect', () => {
    const s = dealFromSeed(1);
    // force foundations near-complete except last card of each suit on tableau
    const suits = ['H', 'D', 'C', 'S'];
    s.foundation = suits.map((su) =>
      Array.from({ length: 12 }, (_, r) => ({ ...makeCard(su, r + 1), faceUp: true }))
    );
    s.tableau = [[], [], [], [], [], [], []];
    s.stock = [];
    s.waste = [];
    suits.forEach((su, i) => {
      s.tableau[i] = [{ ...makeCard(su, 13), faceUp: true }];
    });
    const out = autoCollect(s);
    assert.equal(out.won, true);
  });
});

// ─────────────────────────────────────────────
// rng helpers
// ─────────────────────────────────────────────
describe('seeded rng', () => {
  test('seededMulberry32 deterministic', () => {
    const a = seededMulberry32(100);
    const b = seededMulberry32(100);
    for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
  });

  test('dailySeed stable for same date', () => {
    const d = new Date(Date.UTC(2026, 3, 24));
    assert.equal(dailySeed(d), dailySeed(d));
    assert.equal(dailySeed(d), 20260424);
  });
});
