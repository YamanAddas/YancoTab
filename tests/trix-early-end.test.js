/**
 * Regression tests for trick-contract early termination in Trix.
 *
 * Bug: King/Queens/Diamonds deals played out all 13 tricks even after
 * every penalty card had been captured. No more scoring was possible
 * but the user was forced to keep playing.
 *
 * Fix: shouldEndTrickContract() + endTrickDealEarly() in trixReducer.
 *   - king     → end the moment K♥ lands in any taken pile.
 *   - queens   → end when 4 queens have been captured.
 *   - diamonds → end when 13 diamonds have been captured.
 *   - ltoosh   → never early-ends; every trick scores.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, append() {}, appendChild() {}, setAttribute() {} }),
  };
}

import { trixReducer } from '../os/apps/games/trix/trixReducer.js';
import { initMatch } from '../os/apps/games/trix/trixState.js';

function emptyDoubling() {
  return { pending: false, contractId: null, holder: null, closed: false,
    options: [], doubledKeys: [], map: {} };
}

function preTrickState(contractId, hands) {
  const s = initMatch({ skipSetup: true });
  s.phase = 'TRICK_PLAY';
  s.currentContract = { id: contractId, kind: 'trick' };
  s.kingdomOwner = 'south';
  s.dealNumber = 1;
  s.turn = 'south';
  s.leader = 'south';
  s.trick = [];
  s.scores = { south: 0, east: 0, north: 0, west: 0 };
  s.dealDeltas = { south: 0, east: 0, north: 0, west: 0 };
  s.taken = { south: [], east: [], north: [], west: [] };
  s.tricksTakenCount = { south: 0, east: 0, north: 0, west: 0 };
  s.playedCards = [];
  s.completedTricks = [];
  s.doubling = emptyDoubling();
  s.contractsRemaining = {
    south: ['queens', 'diamonds', 'ltoosh', 'trix'],
    east:  ['king', 'queens', 'diamonds', 'ltoosh', 'trix'],
    north: ['king', 'queens', 'diamonds', 'ltoosh', 'trix'],
    west:  ['king', 'queens', 'diamonds', 'ltoosh', 'trix'],
  };
  s.hands = hands;
  return s;
}

function play(state, seat, card) {
  return trixReducer(state, { type: 'PLAY_CARD', seat, card });
}

describe('Trix — King of Hearts ends the moment ♥K is captured', () => {
  test('deal ends after the trick that takes ♥K, even though hands still have cards', () => {
    let state = preTrickState('king', {
      south: [{ suit: 'hearts', rank: 7 }, { suit: 'clubs', rank: 2 }],
      east:  [{ suit: 'hearts', rank: 10 }, { suit: 'clubs', rank: 3 }],
      north: [{ suit: 'hearts', rank: 13 }, { suit: 'clubs', rank: 4 }],
      west:  [{ suit: 'hearts', rank: 1 },  { suit: 'clubs', rank: 5 }],
    });
    let r = play(state, 'south', { suit: 'hearts', rank: 7 });
    r = play(r.state, 'east',  { suit: 'hearts', rank: 10 });
    r = play(r.state, 'north', { suit: 'hearts', rank: 13 });
    r = play(r.state, 'west',  { suit: 'hearts', rank: 1 });

    const dealEnd = r.events.find((e) => e.type === 'deal:end');
    assert.ok(dealEnd, 'deal:end must fire after the trick that takes ♥K');
    assert.equal(dealEnd.deltas.west, -75, 'west took ♥K → −75 this deal');
    // Scores persist across deals; dealDeltas gets reset by advanceAfterDeal
    // → dealNewHands. So we check cumulative scores instead.
    assert.equal(r.state.scores.west, -75);
    // advanceAfterDeal moves to the next deal — king must be cleared.
    assert.notEqual(r.state.currentContract?.id, 'king',
      'king deal must be cleared after early end');
  });

  test('king deal does NOT end before ♥K is taken', () => {
    let state = preTrickState('king', {
      south: [{ suit: 'hearts', rank: 7 }, { suit: 'hearts', rank: 13 }],
      east:  [{ suit: 'hearts', rank: 10 }, { suit: 'clubs', rank: 3 }],
      north: [{ suit: 'hearts', rank: 5 },  { suit: 'clubs', rank: 4 }],
      west:  [{ suit: 'hearts', rank: 9 },  { suit: 'clubs', rank: 5 }],
    });
    // south leads ♥7; everyone else plays under. south wins the trick
    // and takes a heart (but NOT ♥K — south led 7, the K is still in
    // south's hand). Deal must continue.
    let r = play(state, 'south', { suit: 'hearts', rank: 7 });
    r = play(r.state, 'east',  { suit: 'hearts', rank: 10 });
    r = play(r.state, 'north', { suit: 'hearts', rank: 5 });
    r = play(r.state, 'west',  { suit: 'hearts', rank: 9 });
    assert.ok(!r.events.some((e) => e.type === 'deal:end'),
      'deal:end must NOT fire while ♥K is still in a hand');
    assert.equal(r.state.currentContract?.id, 'king');
  });
});

describe('Trix — Queens ends when the 4th queen is captured', () => {
  test('deal ends after the trick that takes the 4th queen', () => {
    let state = preTrickState('queens', {
      south: [{ suit: 'spades',   rank: 12 }, { suit: 'clubs', rank: 2 }],
      east:  [{ suit: 'hearts',   rank: 12 }, { suit: 'clubs', rank: 3 }],
      north: [{ suit: 'diamonds', rank: 12 }, { suit: 'clubs', rank: 4 }],
      west:  [{ suit: 'spades',   rank: 1 },  { suit: 'clubs', rank: 5 }],
    });
    // Pre-load 1 queen in west's taken pile (clubs). 3 more queens to fall this trick.
    state.taken.west = [{ suit: 'clubs', rank: 12 }];

    // south leads ♠Q; east and north must play off-suit (no spades)
    // so they dump their queens. west plays ♠A → wins, takes 3 queens.
    let r = play(state, 'south', { suit: 'spades', rank: 12 });
    r = play(r.state, 'east',  { suit: 'hearts',   rank: 12 });
    r = play(r.state, 'north', { suit: 'diamonds', rank: 12 });
    r = play(r.state, 'west',  { suit: 'spades',   rank: 1 });

    const dealEnd = r.events.find((e) => e.type === 'deal:end');
    assert.ok(dealEnd, 'deal:end must fire when the 4th queen is captured');
    assert.equal(dealEnd.deltas.west, -75, 'west took 3 queens this trick → −75 this deal');
    assert.equal(r.state.scores.west, -75);
    assert.notEqual(r.state.currentContract?.id, 'queens');
  });

  test('queens deal does NOT end while queens still in hands', () => {
    let state = preTrickState('queens', {
      south: [{ suit: 'spades',   rank: 12 }, { suit: 'spades',   rank: 7 }],
      east:  [{ suit: 'hearts',   rank: 12 }, { suit: 'spades',   rank: 6 }],
      north: [{ suit: 'diamonds', rank: 12 }, { suit: 'spades',   rank: 5 }],
      west:  [{ suit: 'clubs',    rank: 12 }, { suit: 'spades',   rank: 1 }],
    });
    // south leads ♠7 (low). Everyone follows. west wins with ♠A but
    // no queens fall. 4 queens still in hands.
    let r = play(state, 'south', { suit: 'spades', rank: 7 });
    r = play(r.state, 'east',  { suit: 'spades', rank: 6 });
    r = play(r.state, 'north', { suit: 'spades', rank: 5 });
    r = play(r.state, 'west',  { suit: 'spades', rank: 1 });
    assert.ok(!r.events.some((e) => e.type === 'deal:end'));
    assert.equal(r.state.currentContract?.id, 'queens');
  });
});

describe('Trix — Diamonds ends when the 13th diamond is captured', () => {
  test('deal ends after the trick that takes the 13th diamond', () => {
    let state = preTrickState('diamonds', {
      south: [{ suit: 'diamonds', rank: 7 },  { suit: 'clubs', rank: 2 }],
      east:  [{ suit: 'diamonds', rank: 10 }, { suit: 'clubs', rank: 3 }],
      north: [{ suit: 'diamonds', rank: 13 }, { suit: 'clubs', rank: 4 }],
      west:  [{ suit: 'diamonds', rank: 1 },  { suit: 'clubs', rank: 5 }],
    });
    // Pre-load 9 diamonds in east's pile so this trick brings the count to 13.
    state.taken.east = [
      { suit: 'diamonds', rank: 2 }, { suit: 'diamonds', rank: 3 },
      { suit: 'diamonds', rank: 4 }, { suit: 'diamonds', rank: 5 },
      { suit: 'diamonds', rank: 6 }, { suit: 'diamonds', rank: 8 },
      { suit: 'diamonds', rank: 9 }, { suit: 'diamonds', rank: 11 },
      { suit: 'diamonds', rank: 12 },
    ];

    // south leads ♦7. All follow diamonds. west wins with ♦A and takes
    // the 4 diamonds in this trick → 9 + 4 = 13.
    let r = play(state, 'south', { suit: 'diamonds', rank: 7 });
    r = play(r.state, 'east',  { suit: 'diamonds', rank: 10 });
    r = play(r.state, 'north', { suit: 'diamonds', rank: 13 });
    r = play(r.state, 'west',  { suit: 'diamonds', rank: 1 });

    const dealEnd = r.events.find((e) => e.type === 'deal:end');
    assert.ok(dealEnd, 'deal:end must fire when the 13th diamond is captured');
    // west took 4 diamonds this trick → −40 to west
    assert.equal(dealEnd.deltas.west, -40);
    assert.equal(r.state.scores.west, -40);
    assert.notEqual(r.state.currentContract?.id, 'diamonds');
  });

  test('diamonds deal does NOT end while some diamonds still in hands', () => {
    let state = preTrickState('diamonds', {
      south: [{ suit: 'diamonds', rank: 7 },  { suit: 'diamonds', rank: 13 }],
      east:  [{ suit: 'diamonds', rank: 10 }, { suit: 'clubs', rank: 3 }],
      north: [{ suit: 'diamonds', rank: 5 },  { suit: 'clubs', rank: 4 }],
      west:  [{ suit: 'diamonds', rank: 9 },  { suit: 'clubs', rank: 5 }],
    });
    let r = play(state, 'south', { suit: 'diamonds', rank: 7 });
    r = play(r.state, 'east',  { suit: 'diamonds', rank: 10 });
    r = play(r.state, 'north', { suit: 'diamonds', rank: 5 });
    r = play(r.state, 'west',  { suit: 'diamonds', rank: 9 });
    assert.ok(!r.events.some((e) => e.type === 'deal:end'),
      '4 of 13 diamonds taken — deal must continue');
  });
});

describe('Trix — Ltoosh always plays all 13 tricks (no early end)', () => {
  test('a single completed ltoosh trick does NOT end the deal', () => {
    let state = preTrickState('ltoosh', {
      south: [{ suit: 'spades', rank: 7 },  { suit: 'clubs', rank: 2 }],
      east:  [{ suit: 'spades', rank: 10 }, { suit: 'clubs', rank: 3 }],
      north: [{ suit: 'spades', rank: 5 },  { suit: 'clubs', rank: 4 }],
      west:  [{ suit: 'spades', rank: 9 },  { suit: 'clubs', rank: 5 }],
    });
    let r = play(state, 'south', { suit: 'spades', rank: 7 });
    r = play(r.state, 'east',  { suit: 'spades', rank: 10 });
    r = play(r.state, 'north', { suit: 'spades', rank: 5 });
    r = play(r.state, 'west',  { suit: 'spades', rank: 9 });
    assert.ok(!r.events.some((e) => e.type === 'deal:end'),
      'ltoosh has no penalty card — deal must continue every trick');
    assert.equal(r.state.currentContract?.id, 'ltoosh');
    // east wins ♠10 → −15 ltoosh
    assert.equal(r.state.dealDeltas.east, -15);
  });
});
