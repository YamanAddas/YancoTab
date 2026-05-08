/**
 * Regression tests for the Trix layout-phase turn-skip bug.
 *
 * Prior bug: when a player emptied their hand during the Trix
 * (layout) contract, the reducer kept rotating turns through them.
 * The deal would hang at "Your turn" with a zero-card hand and the
 * pass button as the only escape, which had to be tapped repeatedly
 * to limp toward deal-end.
 *
 * Fix: nextLayoutSeat() skips past out-players. When no seat has
 * cards, the deal ends immediately (any seat still holding cards is
 * conscripted into outOrder so scoring still covers all four — only
 * relevant when the layout is locked but cards remain).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Stub `document` because trixState imports Deck → Card → utils/dom.js,
// which calls document.createElement at module evaluation only via the
// `el` function — but importing the file pulls it in. We never call el
// in this test; the stub just satisfies the import-time check.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, append() {}, appendChild() {}, setAttribute() {} }),
  };
}

import { trixReducer } from '../os/apps/games/trix/trixReducer.js';
import { initMatch } from '../os/apps/games/trix/trixState.js';

function pickContract(state, seat, contractId) {
  return trixReducer(state, { type: 'PICK_CONTRACT', seat, contractId }).state;
}

/**
 * Build a Trix-layout state where the Jack of every suit has already
 * been played and:
 *   - south's hand is empty (already out, place 1)
 *   - east, north, west each hold one extending card that's currently
 *     not legal (the layout's low/high don't allow them yet)
 * The bug surface is: with state.turn set to south and south's hand
 * empty, what should the reducer do?
 */
function buildStuckLayout({ outSouthAlready = false } = {}) {
  const s = initMatch({ skipSetup: true });
  s.phase = 'TRIX_LAYOUT_PLAY';
  s.currentContract = { id: 'trix', name: 'Trix', kind: 'layout' };
  s.kingdomOwner = 'south';
  s.dealNumber = 1;
  s.turn = 'south';
  s.leader = 'south';
  s.layoutBySuit = {
    spades:   { started: true, low: 11, high: 11 },
    hearts:   { started: true, low: 11, high: 11 },
    diamonds: { started: true, low: 11, high: 11 },
    clubs:    { started: true, low: 11, high: 11 },
  };
  s.hands = {
    south: [],
    east:  [{ suit: 'spades', rank: 12 }],   // Q♠ — legal extension up
    north: [{ suit: 'hearts', rank: 12 }],   // Q♥
    west:  [{ suit: 'diamonds', rank: 12 }], // Q♦
  };
  s.outOrder = outSouthAlready ? ['south'] : [];
  s.scores = { south: 0, east: 0, north: 0, west: 0 };
  s.dealDeltas = { south: 0, east: 0, north: 0, west: 0 };
  s.taken = { south: [], east: [], north: [], west: [] };
  s.tricksTakenCount = { south: 0, east: 0, north: 0, west: 0 };
  s.playedCards = [];
  s.completedTricks = [];
  s.contractsRemaining = { south: ['queens'], east: ['queens'], north: ['queens'], west: ['queens'] };
  return s;
}

describe('Trix layout — skip out-players in turn rotation', () => {
  test('LAYOUT_PASS from out-south advances to a non-out seat', () => {
    const start = buildStuckLayout({ outSouthAlready: true });
    const { state } = trixReducer(start, { type: 'LAYOUT_PASS', seat: 'south' });
    // east is the next non-out seat after south.
    assert.equal(state.turn, 'east');
  });

  test('LAYOUT_PLAY that empties a hand advances past the now-out player', () => {
    const start = buildStuckLayout({ outSouthAlready: true });
    // east plays Q♠ → out.
    start.turn = 'east';
    const { state, events } = trixReducer(start, {
      type: 'LAYOUT_PLAY', seat: 'east', card: { suit: 'spades', rank: 12 },
    });
    assert.ok(events.some((e) => e.type === 'layout:out' && e.seat === 'east'));
    // After east goes out: south is also out, so next is north.
    assert.equal(state.turn, 'north');
  });

  test('when 3 are out and the only remaining player passes, deal ends', () => {
    // Three seats already out; the only remaining seat (north) has cards
    // but the seat passing is south (already empty hand). With south's
    // pass count = 1 and stillIn = [north] (count 1), the pass-chain
    // length matches and the deal locks → ends.
    const start = buildStuckLayout();
    start.outOrder = ['south', 'east', 'west'];
    start.hands.east = [];
    start.hands.west = [];
    start.turn = 'south';
    const { events } = trixReducer(start, { type: 'LAYOUT_PASS', seat: 'south' });
    assert.ok(events.some((e) => e.type === 'deal:end'),
      'expected the deal to end when no remaining seat can progress');
  });

  test('deal ends when a play empties the last hand — deal:end fires + scores applied', () => {
    const start = buildStuckLayout({ outSouthAlready: true });
    start.outOrder = ['south', 'east', 'west'];
    start.hands.east = [];
    start.hands.west = [];
    start.turn = 'north';
    // North plays Q♥ (legal — extending hearts up from J).
    const { state, events } = trixReducer(start, {
      type: 'LAYOUT_PLAY', seat: 'north', card: { suit: 'hearts', rank: 12 },
    });
    assert.ok(events.some((e) => e.type === 'layout:out' && e.seat === 'north'));
    assert.ok(events.some((e) => e.type === 'deal:end'));
    // Scoring must reflect the final order — south=200 (1st out),
    // east=150 (2nd), west=100 (3rd), north=50 (4th, last to play).
    // Note: state.outOrder is reset by advanceAfterDeal as the next
    // deal starts; we check scores instead.
    assert.equal(state.scores.south, 200);
    assert.equal(state.scores.east,  150);
    assert.equal(state.scores.west,  100);
    assert.equal(state.scores.north,  50);
  });

  test('LAYOUT_PASS from the only-remaining seat with no legal play ends the deal', () => {
    // Edge case: layout is locked, three players are out, the last
    // player has cards but no legal play. They pass → deal must end
    // even though SEATS.every(hand=0) is false.
    const start = buildStuckLayout();
    start.outOrder = ['south', 'east', 'west'];
    start.hands.east = [];
    start.hands.west = [];
    start.turn = 'north';
    // Lock north's layout option: hearts already at A↑ which can't extend.
    start.layoutBySuit.hearts = { started: true, low: 2, high: 1 };
    const { events, state } = trixReducer(start, { type: 'LAYOUT_PASS', seat: 'north' });
    assert.ok(events.some((e) => e.type === 'deal:end'));
    // Scores reflect the locked deal-end: north was last → 4th place.
    assert.equal(state.scores.south, 200);
    assert.equal(state.scores.east,  150);
    assert.equal(state.scores.west,  100);
    assert.equal(state.scores.north,  50);
  });
});
