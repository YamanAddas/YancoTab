/**
 * Tests for os/apps/games/trix/trixRules.js
 * Run with: node --test tests/trix-rules.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SEATS, TEAMS, CONTRACTS, TRIX_LAYOUT_SCORES,
    nextSeat, seatIndex, teamOf, partnerOf,
    cardKey, parseCardKey, isSameCard, rankValue,
    trickWinner, legalTrickPlays,
    find7HeartsOwner, legalLayoutPlays, applyLayoutCard,
    sortHand,
} from '../os/apps/games/trix/trixRules.js';

// ─────────────────────────────────────────────
// Seat navigation
// ─────────────────────────────────────────────
describe('nextSeat', () => {
    test('south → east → north → west → south', () => {
        assert.equal(nextSeat('south'), 'east');
        assert.equal(nextSeat('east'), 'north');
        assert.equal(nextSeat('north'), 'west');
        assert.equal(nextSeat('west'), 'south');
    });
});

describe('seatIndex', () => {
    test('returns index in SEATS array', () => {
        assert.equal(seatIndex('south'), 0);
        assert.equal(seatIndex('west'), 3);
    });
});

describe('teamOf / partnerOf', () => {
    test('south and north are team A', () => {
        assert.equal(teamOf('south'), 'A');
        assert.equal(teamOf('north'), 'A');
    });
    test('east and west are team B', () => {
        assert.equal(teamOf('east'), 'B');
        assert.equal(teamOf('west'), 'B');
    });
    test('partner of south is north', () => assert.equal(partnerOf('south'), 'north'));
    test('partner of east is west', () => assert.equal(partnerOf('east'), 'west'));
});

// ─────────────────────────────────────────────
// Card utilities
// ─────────────────────────────────────────────
describe('cardKey / parseCardKey', () => {
    test('cardKey formats suit:rank', () => {
        assert.equal(cardKey({ suit: 'hearts', rank: 7 }), 'hearts:7');
    });

    test('parseCardKey reverses cardKey', () => {
        const card = parseCardKey('diamonds:10');
        assert.equal(card.suit, 'diamonds');
        assert.equal(card.rank, 10);
    });

    test('round-trip', () => {
        const orig = { suit: 'clubs', rank: 1 };
        const parsed = parseCardKey(cardKey(orig));
        assert.equal(parsed.suit, orig.suit);
        assert.equal(parsed.rank, orig.rank);
    });
});

describe('isSameCard', () => {
    test('identical cards → true', () => {
        assert.equal(isSameCard({ suit: 'hearts', rank: 5 }, { suit: 'hearts', rank: 5 }), true);
    });
    test('different cards → false', () => {
        assert.equal(isSameCard({ suit: 'hearts', rank: 5 }, { suit: 'hearts', rank: 6 }), false);
    });
    test('null → falsy', () => {
        assert.ok(!isSameCard(null, { suit: 'hearts', rank: 5 }));
    });
});

describe('rankValue', () => {
    test('ace → 14', () => assert.equal(rankValue(1), 14));
    test('king → 13', () => assert.equal(rankValue(13), 13));
    test('7 → 7', () => assert.equal(rankValue(7), 7));
});

// ─────────────────────────────────────────────
// Trick game rules
// ─────────────────────────────────────────────
describe('trickWinner', () => {
    test('highest of led suit wins (no trump in trix)', () => {
        const trick = [
            { seat: 'south', card: { suit: 'hearts', rank: 5 } },
            { seat: 'east', card: { suit: 'hearts', rank: 1 } },  // ace=14
            { seat: 'north', card: { suit: 'clubs', rank: 13 } },  // off-suit
            { seat: 'west', card: { suit: 'hearts', rank: 10 } },
        ];
        assert.equal(trickWinner(trick), 'east');
    });

    test('off-suit cards cannot win', () => {
        const trick = [
            { seat: 'south', card: { suit: 'diamonds', rank: 3 } },
            { seat: 'east', card: { suit: 'hearts', rank: 1 } },
            { seat: 'north', card: { suit: 'diamonds', rank: 7 } },
            { seat: 'west', card: { suit: 'clubs', rank: 13 } },
        ];
        assert.equal(trickWinner(trick), 'north');
    });

    test('first player wins if nobody follows suit', () => {
        const trick = [
            { seat: 'south', card: { suit: 'spades', rank: 2 } },
            { seat: 'east', card: { suit: 'hearts', rank: 13 } },
            { seat: 'north', card: { suit: 'diamonds', rank: 1 } },
            { seat: 'west', card: { suit: 'clubs', rank: 1 } },
        ];
        assert.equal(trickWinner(trick), 'south');
    });
});

describe('legalTrickPlays', () => {
    const hand = [
        { suit: 'hearts', rank: 3 },
        { suit: 'hearts', rank: 9 },
        { suit: 'spades', rank: 5 },
    ];

    test('must follow led suit', () => {
        const legal = legalTrickPlays(hand, 'hearts');
        assert.equal(legal.length, 2);
        assert.ok(legal.every(c => c.suit === 'hearts'));
    });

    test('all cards legal if void in led suit', () => {
        const legal = legalTrickPlays(hand, 'clubs');
        assert.equal(legal.length, 3);
    });

    test('all cards legal when leading (no led suit)', () => {
        const legal = legalTrickPlays(hand, null);
        assert.equal(legal.length, 3);
    });
});

// ─────────────────────────────────────────────
// Trix layout game rules
// ─────────────────────────────────────────────
describe('find7HeartsOwner', () => {
    test('finds seat with 7 of hearts', () => {
        const hands = {
            south: [{ suit: 'spades', rank: 3 }],
            east: [{ suit: 'hearts', rank: 7 }],
            north: [{ suit: 'clubs', rank: 1 }],
            west: [{ suit: 'diamonds', rank: 10 }],
        };
        assert.equal(find7HeartsOwner(hands), 'east');
    });

    test('defaults to south if nobody has it', () => {
        const hands = { south: [], east: [], north: [], west: [] };
        assert.equal(find7HeartsOwner(hands), 'south');
    });
});

describe('legalLayoutPlays', () => {
    test('only jacks are legal when no suit started', () => {
        const hand = [
            { suit: 'hearts', rank: 11 },
            { suit: 'hearts', rank: 10 },
            { suit: 'spades', rank: 11 },
            { suit: 'clubs', rank: 5 },
        ];
        const layout = {};
        const legal = legalLayoutPlays(hand, layout);
        assert.equal(legal.length, 2);
        assert.ok(legal.every(c => c.rank === 11));
    });

    test('can extend low or high on started suit', () => {
        const hand = [
            { suit: 'hearts', rank: 10 },
            { suit: 'hearts', rank: 12 },
            { suit: 'hearts', rank: 5 },
        ];
        // Hearts started with jack (11), range is 11–11
        const layout = { hearts: { started: true, low: 11, high: 11 } };
        const legal = legalLayoutPlays(hand, layout);
        // Can play 10 (extends low: 11-1=10) or 12 (extends high: 11+1=12)
        assert.equal(legal.length, 2);
        assert.ok(legal.some(c => c.rank === 10));
        assert.ok(legal.some(c => c.rank === 12));
    });

    test('ace can follow king', () => {
        const hand = [{ suit: 'hearts', rank: 1 }];
        // Hearts range: low=5, high=13 (king). Next high = ace (1)
        const layout = { hearts: { started: true, low: 5, high: 13 } };
        const legal = legalLayoutPlays(hand, layout);
        assert.equal(legal.length, 1);
        assert.equal(legal[0].rank, 1);
    });

    test('nothing beyond ace (ace is terminal high)', () => {
        const hand = [{ suit: 'hearts', rank: 2 }];
        // Hearts range: low=3, high=1 (ace). Next high after ace = null
        const layout = { hearts: { started: true, low: 3, high: 1 } };
        const legal = legalLayoutPlays(hand, layout);
        assert.equal(legal.length, 1); // can play 2 as low extension (3-1=2)
    });
});

describe('applyLayoutCard', () => {
    test('starting a suit with jack sets range 11–11', () => {
        const layout = {};
        applyLayoutCard(layout, { suit: 'hearts', rank: 11 });
        assert.deepEqual(layout.hearts, { started: true, low: 11, high: 11 });
    });

    test('extending low decrements low', () => {
        const layout = { hearts: { started: true, low: 11, high: 11 } };
        applyLayoutCard(layout, { suit: 'hearts', rank: 10 });
        assert.equal(layout.hearts.low, 10);
    });

    test('extending high increments high', () => {
        const layout = { hearts: { started: true, low: 11, high: 11 } };
        applyLayoutCard(layout, { suit: 'hearts', rank: 12 });
        assert.equal(layout.hearts.high, 12);
    });

    test('ace extends from king', () => {
        const layout = { hearts: { started: true, low: 5, high: 13 } };
        applyLayoutCard(layout, { suit: 'hearts', rank: 1 });
        assert.equal(layout.hearts.high, 1);
    });
});

// ─────────────────────────────────────────────
// sortHand
// ─────────────────────────────────────────────
describe('sortHand', () => {
    test('sorts by suit order then rank', () => {
        const hand = [
            { suit: 'clubs', rank: 5 },
            { suit: 'spades', rank: 1 },
            { suit: 'hearts', rank: 3 },
        ];
        const sorted = sortHand(hand);
        assert.equal(sorted[0].suit, 'spades');
        assert.equal(sorted[1].suit, 'hearts');
        assert.equal(sorted[2].suit, 'clubs');
    });

    test('does not mutate original', () => {
        const hand = [{ suit: 'clubs', rank: 5 }, { suit: 'spades', rank: 1 }];
        const copy = [...hand];
        sortHand(hand);
        assert.deepEqual(hand, copy);
    });
});

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
describe('constants', () => {
    test('5 contracts defined', () => {
        assert.equal(CONTRACTS.length, 5);
    });

    test('contracts have id, name, kind', () => {
        for (const c of CONTRACTS) {
            assert.ok(c.id);
            assert.ok(c.name);
            assert.ok(['trick', 'layout'].includes(c.kind));
        }
    });

    test('4 trix layout scores', () => {
        assert.equal(TRIX_LAYOUT_SCORES.length, 4);
        // Scores should be descending
        for (let i = 1; i < TRIX_LAYOUT_SCORES.length; i++) {
            assert.ok(TRIX_LAYOUT_SCORES[i] < TRIX_LAYOUT_SCORES[i - 1]);
        }
    });
});
