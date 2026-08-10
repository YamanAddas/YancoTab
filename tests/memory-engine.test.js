/**
 * Tests for Memory ("Mirror") engine.
 * Run with: node --test tests/memory-engine.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  memoryReducer,
  initialState,
  dealCards,
  DIFFICULTIES,
  ORBS,
} from '../os/apps/memory/engine.js';

// Stable RNG for deterministic shuffles
function fixedRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('initialState', () => {
  test('defaults to standard difficulty with no cards', () => {
    const s = initialState();
    assert.equal(s.difficulty, 'standard');
    assert.equal(s.phase, 'idle');
    assert.equal(s.cards.length, 0);
    assert.equal(s.pairsTotal, 12);
    assert.equal(s.firstPick, null);
    assert.equal(s.secondPick, null);
    assert.equal(s.locked, false);
    assert.equal(s.moves, 0);
    assert.equal(s.pairsFound, 0);
    assert.equal(s.comboStreak, 0);
    assert.deepEqual(s.bestTimeMs, { easy: null, standard: null, hard: null });
  });

  test('rejects invalid difficulty', () => {
    const s = initialState({ difficulty: 'expert' });
    assert.equal(s.difficulty, 'standard');
  });

  test('accepts persisted bests', () => {
    const s = initialState({
      bestTimeMs: { easy: 30000, standard: 45000, hard: 90000 },
      bestComboStreak: 6,
    });
    assert.equal(s.bestTimeMs.easy, 30000);
    assert.equal(s.bestComboStreak, 6);
  });
});

describe('dealCards', () => {
  test('returns the right number of cards per difficulty', () => {
    assert.equal(dealCards('easy').length, 16);     // 8 pairs
    assert.equal(dealCards('standard').length, 24); // 12 pairs
    assert.equal(dealCards('hard').length, 36);     // 18 pairs
  });

  test('each orb appears an even number of times (pairable)', () => {
    // ORBS has 6 entries; easy has 8 pairs → some orbs cycle and end
    // up assigned twice (= 4 cards of that orb). The constraint is
    // that every count is even so the game is solvable.
    const cards = dealCards('easy');
    const counts = {};
    for (const c of cards) counts[c.orb] = (counts[c.orb] || 0) + 1;
    for (const orb of Object.keys(counts)) {
      assert.equal(counts[orb] % 2, 0, `${orb} count ${counts[orb]} should be even`);
    }
  });

  test('shuffle uses injected RNG deterministically', () => {
    const rng1 = fixedRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    const rng2 = fixedRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    const a = dealCards('easy', rng1);
    const b = dealCards('easy', rng2);
    assert.deepEqual(a.map((c) => c.orb), b.map((c) => c.orb));
  });

  test('all cards start face-down and unmatched', () => {
    const cards = dealCards('easy');
    for (const c of cards) {
      assert.equal(c.faceUp, false);
      assert.equal(c.matched, false);
    }
  });
});

describe('NEW_GAME action', () => {
  test('deals cards, sets phase=playing, records startedAt', () => {
    const s0 = initialState();
    const s1 = memoryReducer(s0, { type: 'NEW_GAME', now: 1000 });
    assert.equal(s1.phase, 'playing');
    assert.equal(s1.cards.length, 24);
    assert.equal(s1.startedAt, 1000);
    assert.equal(s1.finishedAt, null);
    assert.equal(s1.pairsFound, 0);
  });

  test('honors action.difficulty when provided', () => {
    const s = memoryReducer(initialState(), { type: 'NEW_GAME', difficulty: 'hard' });
    assert.equal(s.difficulty, 'hard');
    assert.equal(s.cards.length, 36);
    assert.equal(s.pairsTotal, 18);
  });

  test('preserves bestTimeMs + bestComboStreak across new games', () => {
    let s = initialState({
      bestTimeMs: { easy: 20000, standard: null, hard: null },
      bestComboStreak: 4,
    });
    s = memoryReducer(s, { type: 'NEW_GAME', now: 1000 });
    assert.equal(s.bestTimeMs.easy, 20000);
    assert.equal(s.bestComboStreak, 4);
  });
});

describe('FLIP action', () => {
  test('first flip face-up, sets firstPick', () => {
    let s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    s = memoryReducer(s, { type: 'FLIP', idx: 0 });
    assert.equal(s.cards[0].faceUp, true);
    assert.equal(s.firstPick, 0);
    assert.equal(s.moves, 0);
  });

  test('rejects flipping the same card twice', () => {
    let s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    s = memoryReducer(s, { type: 'FLIP', idx: 0 });
    const same = memoryReducer(s, { type: 'FLIP', idx: 0 });
    assert.equal(same, s);
  });

  test('matching pair sets matched, increments pairsFound + combo', () => {
    // Build a deterministic state: card 0 and 1 share an orb
    const s0 = initialState();
    let s = memoryReducer(s0, { type: 'NEW_GAME' });
    // Hand-craft cards so 0,1 are a known pair
    s = { ...s, cards: [
      { id: 0, orb: 'amber', faceUp: false, matched: false },
      { id: 1, orb: 'amber', faceUp: false, matched: false },
      { id: 2, orb: 'cyan',  faceUp: false, matched: false },
      { id: 3, orb: 'cyan',  faceUp: false, matched: false },
    ], pairsTotal: 2 };

    s = memoryReducer(s, { type: 'FLIP', idx: 0, now: 1100 });
    s = memoryReducer(s, { type: 'FLIP', idx: 1, now: 1200 });
    assert.equal(s.cards[0].matched, true);
    assert.equal(s.cards[1].matched, true);
    assert.equal(s.pairsFound, 1);
    assert.equal(s.comboStreak, 1);
    assert.equal(s.bestComboStreak, 1);
    assert.equal(s.firstPick, null);
    assert.equal(s.secondPick, null);
    assert.equal(s.moves, 1);
    // Found log gains the orb
    assert.equal(s.foundLog.length, 1);
    assert.equal(s.foundLog[0].orb, 'amber');
  });

  test('mismatch locks state for RESOLVE', () => {
    const s0 = initialState();
    let s = memoryReducer(s0, { type: 'NEW_GAME' });
    s = { ...s, cards: [
      { id: 0, orb: 'amber', faceUp: false, matched: false },
      { id: 1, orb: 'cyan',  faceUp: false, matched: false },
    ], pairsTotal: 1 };
    s = memoryReducer(s, { type: 'FLIP', idx: 0 });
    s = memoryReducer(s, { type: 'FLIP', idx: 1 });
    assert.equal(s.locked, true);
    assert.equal(s.firstPick, 0);
    assert.equal(s.secondPick, 1);
    assert.equal(s.cards[0].faceUp, true);
    assert.equal(s.cards[1].faceUp, true);
    assert.equal(s.comboStreak, 0); // reset on mismatch
    assert.equal(s.moves, 1);
  });

  test('rejects flips while locked', () => {
    let s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    s = { ...s, cards: [
      { id: 0, orb: 'amber', faceUp: false, matched: false },
      { id: 1, orb: 'cyan',  faceUp: false, matched: false },
      { id: 2, orb: 'rose',  faceUp: false, matched: false },
    ], pairsTotal: 1 };
    s = memoryReducer(s, { type: 'FLIP', idx: 0 });
    s = memoryReducer(s, { type: 'FLIP', idx: 1 });
    assert.equal(s.locked, true);
    const same = memoryReducer(s, { type: 'FLIP', idx: 2 });
    assert.equal(same, s);
  });

  test('completing all pairs sets phase=won + bestTimeMs', () => {
    let s = memoryReducer(initialState(), { type: 'NEW_GAME', now: 1000 });
    s = { ...s, cards: [
      { id: 0, orb: 'amber', faceUp: false, matched: false },
      { id: 1, orb: 'amber', faceUp: false, matched: false },
    ], pairsTotal: 1, startedAt: 1000 };
    s = memoryReducer(s, { type: 'FLIP', idx: 0, now: 1100 });
    s = memoryReducer(s, { type: 'FLIP', idx: 1, now: 4000 });
    assert.equal(s.phase, 'won');
    assert.equal(s.finishedAt, 4000);
    assert.equal(s.bestTimeMs.standard, 3000);
  });

  test('comboStreak compounds on consecutive matches', () => {
    let s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    s = { ...s, cards: [
      { id: 0, orb: 'amber', faceUp: false, matched: false },
      { id: 1, orb: 'amber', faceUp: false, matched: false },
      { id: 2, orb: 'cyan',  faceUp: false, matched: false },
      { id: 3, orb: 'cyan',  faceUp: false, matched: false },
    ], pairsTotal: 2 };
    s = memoryReducer(s, { type: 'FLIP', idx: 0 });
    s = memoryReducer(s, { type: 'FLIP', idx: 1 });
    assert.equal(s.comboStreak, 1);
    s = memoryReducer(s, { type: 'FLIP', idx: 2 });
    s = memoryReducer(s, { type: 'FLIP', idx: 3 });
    assert.equal(s.comboStreak, 2);
    assert.equal(s.bestComboStreak, 2);
  });
});

describe('RESOLVE action', () => {
  test('flips both mismatched cards back face-down', () => {
    let s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    s = { ...s, cards: [
      { id: 0, orb: 'amber', faceUp: false, matched: false },
      { id: 1, orb: 'cyan',  faceUp: false, matched: false },
    ], pairsTotal: 1 };
    s = memoryReducer(s, { type: 'FLIP', idx: 0 });
    s = memoryReducer(s, { type: 'FLIP', idx: 1 });
    s = memoryReducer(s, { type: 'RESOLVE' });
    assert.equal(s.cards[0].faceUp, false);
    assert.equal(s.cards[1].faceUp, false);
    assert.equal(s.firstPick, null);
    assert.equal(s.secondPick, null);
    assert.equal(s.locked, false);
  });

  test('no-op when not locked', () => {
    const s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    const same = memoryReducer(s, { type: 'RESOLVE' });
    assert.equal(same, s);
  });
});

describe('SET_DIFFICULTY action', () => {
  test('switching difficulty starts a new game at the new size', () => {
    let s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    assert.equal(s.cards.length, 24); // standard
    s = memoryReducer(s, { type: 'SET_DIFFICULTY', difficulty: 'easy', now: 2000 });
    assert.equal(s.difficulty, 'easy');
    assert.equal(s.cards.length, 16);
    assert.equal(s.pairsTotal, 8);
    assert.equal(s.startedAt, 2000);
  });

  test('rejects invalid difficulty', () => {
    const s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    const same = memoryReducer(s, { type: 'SET_DIFFICULTY', difficulty: 'expert' });
    assert.equal(same, s);
  });

  test('no-op when difficulty unchanged', () => {
    let s = memoryReducer(initialState(), { type: 'NEW_GAME' });
    const before = s;
    const after = memoryReducer(s, { type: 'SET_DIFFICULTY', difficulty: 'standard' });
    assert.equal(after, before);
  });
});

describe('HYDRATE action', () => {
  test('restores difficulty + bests, ignores junk', () => {
    const s = memoryReducer(initialState(), {
      type: 'HYDRATE',
      state: {
        difficulty: 'hard',
        bestTimeMs: { easy: 25000, standard: 45000, hard: 80000 },
        bestComboStreak: 7,
        evil: '<script>',
      },
    });
    assert.equal(s.difficulty, 'hard');
    assert.equal(s.bestTimeMs.hard, 80000);
    assert.equal(s.bestComboStreak, 7);
    assert.equal(s.evil, undefined);
  });
});

describe('DIFFICULTIES + ORBS exports', () => {
  test('three difficulties with the right grid sizes', () => {
    assert.equal(DIFFICULTIES.easy.cols * DIFFICULTIES.easy.rows, 16);
    assert.equal(DIFFICULTIES.standard.cols * DIFFICULTIES.standard.rows, 24);
    assert.equal(DIFFICULTIES.hard.cols * DIFFICULTIES.hard.rows, 36);
  });

  test('orb list has at least 6 entries', () => {
    assert.ok(ORBS.length >= 6);
  });
});

describe('PAUSE / RESUME clock accounting', () => {
  const playing = (startedAt = 1000) => ({
    ...initialState(),
    phase: 'playing',
    startedAt,
    cards: [
      { id: 0, orb: 'sun', faceUp: false, matched: false },
      { id: 1, orb: 'sun', faceUp: false, matched: false },
    ],
    pairsTotal: 1,
  });

  test('PAUSE stamps pausedAt; only while playing; idempotent', () => {
    const p = memoryReducer(playing(), { type: 'PAUSE', now: 5000 });
    assert.equal(p.pausedAt, 5000);
    // Second PAUSE is a no-op — the original stamp survives
    assert.equal(memoryReducer(p, { type: 'PAUSE', now: 9000 }), p);
    // Not playing → no-op
    const idle = initialState();
    assert.equal(memoryReducer(idle, { type: 'PAUSE', now: 5000 }), idle);
  });

  test('FLIP is rejected while paused', () => {
    const p = memoryReducer(playing(), { type: 'PAUSE', now: 5000 });
    assert.equal(memoryReducer(p, { type: 'FLIP', idx: 0 }), p);
  });

  test('RESUME shifts startedAt forward by the paused duration', () => {
    let s = playing(1000);
    s = memoryReducer(s, { type: 'PAUSE', now: 5000 });
    s = memoryReducer(s, { type: 'RESUME', now: 8000 });
    // 3s paused → startedAt moves 1000 → 4000, so elapsed at t=10000 is
    // 6000ms (9000ms wall minus the 3000ms spent minimized).
    assert.equal(s.startedAt, 4000);
    assert.equal(s.pausedAt, null);
    // RESUME without a pause is a no-op
    assert.equal(memoryReducer(s, { type: 'RESUME', now: 9000 }), s);
  });

  test('repeated pause/resume cycles accumulate correctly', () => {
    let s = playing(1000);
    s = memoryReducer(s, { type: 'PAUSE', now: 2000 });
    s = memoryReducer(s, { type: 'RESUME', now: 3000 }); // +1000 → 2000
    s = memoryReducer(s, { type: 'PAUSE', now: 6000 });
    s = memoryReducer(s, { type: 'RESUME', now: 10000 }); // +4000 → 6000
    assert.equal(s.startedAt, 6000);
  });

  test('bestTimeMs recorded at win excludes paused time', () => {
    let s = playing(1000);
    s = memoryReducer(s, { type: 'PAUSE', now: 5000 });
    s = memoryReducer(s, { type: 'RESUME', now: 8000 }); // startedAt → 4000
    s = memoryReducer(s, { type: 'FLIP', idx: 0, now: 9000 });
    s = memoryReducer(s, { type: 'FLIP', idx: 1, now: 10000 });
    assert.equal(s.phase, 'won');
    // 10000 - 4000 = 6000: the 3s minimized never reaches the record.
    assert.equal(s.bestTimeMs.standard, 6000);
  });

  test('NEW_GAME clears any pause stamp', () => {
    let s = memoryReducer(playing(), { type: 'PAUSE', now: 5000 });
    s = memoryReducer(s, { type: 'NEW_GAME', now: 9000, random: fixedRng([0.5]) });
    assert.equal(s.pausedAt, null);
    assert.equal(s.startedAt, 9000);
  });
});
