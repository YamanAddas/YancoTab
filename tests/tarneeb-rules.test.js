/**
 * Tests for os/apps/games/tarneeb/tarneebRules.js
 * Run with: node --test tests/tarneeb-rules.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SEATS, SUITS, TEAMS, MIN_BID, MAX_BID, WIN_TARGET,
    nextSeat, teamOf, otherTeam, partnerOf,
    rankValue, sortHand, legalTrickPlays,
    compareTrickCards, trickWinner, cardKey, sameCard,
    computeTeamTotals, checkWinningTeam,
    sameColorTrumpFromRevealedSuit,
} from '../os/apps/games/tarneeb/tarneebRules.js';

// ─────────────────────────────────────────────
// Seat navigation
// ─────────────────────────────────────────────
describe('nextSeat', () => {
    test('south → east', () => assert.equal(nextSeat('south'), 'east'));
    test('east → north', () => assert.equal(nextSeat('east'), 'north'));
    test('north → west', () => assert.equal(nextSeat('north'), 'west'));
    test('west → south (wraps)', () => assert.equal(nextSeat('west'), 'south'));
});

describe('teamOf', () => {
    test('south is NS', () => assert.equal(teamOf('south'), 'NS'));
    test('north is NS', () => assert.equal(teamOf('north'), 'NS'));
    test('east is EW', () => assert.equal(teamOf('east'), 'EW'));
    test('west is EW', () => assert.equal(teamOf('west'), 'EW'));
    test('unknown returns null', () => assert.equal(teamOf('nobody'), null));
});

describe('otherTeam', () => {
    test('NS → EW', () => assert.equal(otherTeam('NS'), 'EW'));
    test('EW → NS', () => assert.equal(otherTeam('EW'), 'NS'));
    test('unknown → null', () => assert.equal(otherTeam('X'), null));
});

describe('partnerOf', () => {
    test('south partner is north', () => assert.equal(partnerOf('south'), 'north'));
    test('north partner is south', () => assert.equal(partnerOf('north'), 'south'));
    test('east partner is west', () => assert.equal(partnerOf('east'), 'west'));
    test('west partner is east', () => assert.equal(partnerOf('west'), 'east'));
    test('unknown returns null', () => assert.equal(partnerOf('nobody'), null));
});

// ─────────────────────────────────────────────
// Card utilities
// ─────────────────────────────────────────────
describe('rankValue', () => {
    test('ace (1) maps to 14 (highest)', () => assert.equal(rankValue(1), 14));
    test('2 stays 2', () => assert.equal(rankValue(2), 2));
    test('king (13) stays 13', () => assert.equal(rankValue(13), 13));
    test('10 stays 10', () => assert.equal(rankValue(10), 10));
});

describe('cardKey', () => {
    test('formats suit:rank', () => assert.equal(cardKey({ suit: 'hearts', rank: 7 }), 'hearts:7'));
    test('handles empty card gracefully', () => assert.equal(cardKey({}), 'x:0'));
});

describe('sameCard', () => {
    test('same suit and rank → true', () => {
        assert.equal(sameCard({ suit: 'hearts', rank: 7 }, { suit: 'hearts', rank: 7 }), true);
    });
    test('different rank → false', () => {
        assert.equal(sameCard({ suit: 'hearts', rank: 7 }, { suit: 'hearts', rank: 8 }), false);
    });
    test('different suit → false', () => {
        assert.equal(sameCard({ suit: 'hearts', rank: 7 }, { suit: 'spades', rank: 7 }), false);
    });
    test('null inputs → false', () => {
        assert.equal(sameCard(null, { suit: 'hearts', rank: 7 }), false);
        assert.equal(sameCard(null, null), false);
    });
});

// ─────────────────────────────────────────────
// sortHand
// ─────────────────────────────────────────────
describe('sortHand', () => {
    test('sorts by suit then rank', () => {
        const hand = [
            { suit: 'hearts', rank: 3 },
            { suit: 'spades', rank: 10 },
            { suit: 'hearts', rank: 1 },  // ace = 14
            { suit: 'spades', rank: 2 },
        ];
        const sorted = sortHand(hand);
        assert.equal(sorted[0].suit, 'spades');
        assert.equal(sorted[0].rank, 2);
        assert.equal(sorted[1].suit, 'spades');
        assert.equal(sorted[1].rank, 10);
        assert.equal(sorted[2].suit, 'hearts');
        assert.equal(sorted[2].rank, 3);
        assert.equal(sorted[3].suit, 'hearts');
        assert.equal(sorted[3].rank, 1); // ace last in hearts (rank 14)
    });

    test('does not mutate original array', () => {
        const hand = [{ suit: 'clubs', rank: 5 }, { suit: 'spades', rank: 3 }];
        const original = [...hand];
        sortHand(hand);
        assert.deepEqual(hand, original);
    });
});

// ─────────────────────────────────────────────
// legalTrickPlays
// ─────────────────────────────────────────────
describe('legalTrickPlays', () => {
    const hand = [
        { suit: 'hearts', rank: 7 },
        { suit: 'hearts', rank: 10 },
        { suit: 'spades', rank: 3 },
        { suit: 'clubs', rank: 1 },
    ];

    test('no led suit → entire hand is legal', () => {
        const legal = legalTrickPlays(hand, null);
        assert.equal(legal.length, 4);
    });

    test('must follow led suit if possible', () => {
        const legal = legalTrickPlays(hand, 'hearts');
        assert.equal(legal.length, 2);
        assert.ok(legal.every(c => c.suit === 'hearts'));
    });

    test('can play anything if void in led suit', () => {
        const legal = legalTrickPlays(hand, 'diamonds');
        assert.equal(legal.length, 4);
    });
});

// ─────────────────────────────────────────────
// compareTrickCards
// ─────────────────────────────────────────────
describe('compareTrickCards', () => {
    test('trump beats non-trump', () => {
        const trump = { suit: 'spades', rank: 2 };
        const nonTrump = { suit: 'hearts', rank: 1 }; // ace of hearts
        assert.ok(compareTrickCards(trump, nonTrump, 'hearts', 'spades') > 0);
    });

    test('higher trump beats lower trump', () => {
        const high = { suit: 'spades', rank: 10 };
        const low = { suit: 'spades', rank: 3 };
        assert.ok(compareTrickCards(high, low, 'hearts', 'spades') > 0);
    });

    test('led suit beats off-suit (both non-trump)', () => {
        const led = { suit: 'hearts', rank: 2 };
        const off = { suit: 'clubs', rank: 1 };
        assert.ok(compareTrickCards(led, off, 'hearts', 'spades') > 0);
    });

    test('same suit: higher rank wins', () => {
        const high = { suit: 'hearts', rank: 1 }; // ace = 14
        const low = { suit: 'hearts', rank: 13 }; // king = 13
        assert.ok(compareTrickCards(high, low, 'hearts', 'spades') > 0);
    });

    test('two off-suit non-trump cards tie (0)', () => {
        const a = { suit: 'clubs', rank: 10 };
        const b = { suit: 'diamonds', rank: 1 };
        assert.equal(compareTrickCards(a, b, 'hearts', 'spades'), 0);
    });
});

// ─────────────────────────────────────────────
// trickWinner
// ─────────────────────────────────────────────
describe('trickWinner', () => {
    test('highest card of led suit wins when no trump', () => {
        const trick = [
            { seat: 'south', card: { suit: 'hearts', rank: 5 } },
            { seat: 'east', card: { suit: 'hearts', rank: 10 } },
            { seat: 'north', card: { suit: 'clubs', rank: 1 } },
            { seat: 'west', card: { suit: 'hearts', rank: 3 } },
        ];
        assert.equal(trickWinner(trick, 'spades'), 'east');
    });

    test('trump card wins even with low rank', () => {
        const trick = [
            { seat: 'south', card: { suit: 'hearts', rank: 1 } },
            { seat: 'east', card: { suit: 'spades', rank: 2 } }, // trump 2
            { seat: 'north', card: { suit: 'hearts', rank: 13 } },
            { seat: 'west', card: { suit: 'hearts', rank: 10 } },
        ];
        assert.equal(trickWinner(trick, 'spades'), 'east');
    });

    test('highest trump wins when multiple trumps', () => {
        const trick = [
            { seat: 'south', card: { suit: 'hearts', rank: 5 } },
            { seat: 'east', card: { suit: 'spades', rank: 3 } },
            { seat: 'north', card: { suit: 'spades', rank: 10 } },
            { seat: 'west', card: { suit: 'hearts', rank: 8 } },
        ];
        assert.equal(trickWinner(trick, 'spades'), 'north');
    });

    test('returns null for empty trick', () => {
        assert.equal(trickWinner([], 'spades'), null);
    });
});

// ─────────────────────────────────────────────
// sameColorTrumpFromRevealedSuit
// ─────────────────────────────────────────────
describe('sameColorTrumpFromRevealedSuit', () => {
    test('clubs → spades (both black)', () => assert.equal(sameColorTrumpFromRevealedSuit('clubs'), 'spades'));
    test('spades → clubs (both black)', () => assert.equal(sameColorTrumpFromRevealedSuit('spades'), 'clubs'));
    test('diamonds → hearts (both red)', () => assert.equal(sameColorTrumpFromRevealedSuit('diamonds'), 'hearts'));
    test('hearts → diamonds (both red)', () => assert.equal(sameColorTrumpFromRevealedSuit('hearts'), 'diamonds'));
});

// ─────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────
describe('computeTeamTotals', () => {
    test('sums scores by team', () => {
        const scores = { south: 5, east: 3, north: 8, west: 10 };
        const totals = computeTeamTotals(scores);
        assert.equal(totals.NS, 13); // south + north
        assert.equal(totals.EW, 13); // east + west
    });

    test('adds team bonus', () => {
        const scores = { south: 5, east: 3, north: 8, west: 10 };
        const totals = computeTeamTotals(scores, { NS: 2, EW: -1 });
        assert.equal(totals.NS, 15);
        assert.equal(totals.EW, 12);
    });

    test('handles missing scores', () => {
        const totals = computeTeamTotals({});
        assert.equal(totals.NS, 0);
        assert.equal(totals.EW, 0);
    });
});

describe('checkWinningTeam', () => {
    test('NS wins when south ≥ 41 and north > 0', () => {
        assert.equal(checkWinningTeam({ south: 41, north: 1, east: 10, west: 5 }), 'NS');
    });

    test('EW wins when east ≥ 41 and west > 0', () => {
        assert.equal(checkWinningTeam({ south: 10, north: 5, east: 42, west: 3 }), 'EW');
    });

    test('no winner if partner score is 0', () => {
        assert.equal(checkWinningTeam({ south: 50, north: 0, east: 10, west: 5 }), null);
    });

    test('no winner if nobody reaches 41', () => {
        assert.equal(checkWinningTeam({ south: 20, north: 20, east: 20, west: 20 }), null);
    });
});

// ─────────────────────────────────────────────
// Constants sanity checks
// ─────────────────────────────────────────────
describe('constants', () => {
    test('4 seats in order', () => {
        assert.deepEqual(SEATS, ['south', 'east', 'north', 'west']);
    });

    test('4 suits', () => {
        assert.equal(SUITS.length, 4);
    });

    test('bid range is 2–13', () => {
        assert.equal(MIN_BID, 2);
        assert.equal(MAX_BID, 13);
    });

    test('win target is 41', () => {
        assert.equal(WIN_TARGET, 41);
    });

    test('NS and EW each have 2 seats', () => {
        assert.equal(TEAMS.NS.length, 2);
        assert.equal(TEAMS.EW.length, 2);
    });
});
