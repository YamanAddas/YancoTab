/**
 * Tests for the Table salon banter dispatcher.
 * Run with: node --test tests/table-banter.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BanterDispatcher,
  mapEventToTrigger,
  pickSeatForEvent,
} from '../os/apps/games/table/banter.js';

// ── Stable RNG + clock for determinism ──
function fixedRng(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

function fixedClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

const PACK = {
  match_start: { east: ['line A', 'line B', 'line C'], west: ['hi'] },
  bid_total:   { east: ['well played', 'good luck'] },
  trick_won:   { east: ['👏', 'nice'] },
  emote_received: { east: ['back at ya'], west: ['👋'] },
};

function makeDispatcher(opts = {}) {
  const updates = [];
  const clock = opts.clock || fixedClock();
  const dispatcher = new BanterDispatcher({
    pack: opts.pack || PACK,
    onUpdate: (entries) => updates.push(entries.slice()),
    getName: (s) => `name-${s}`,
    roleOf: (s) => s === 'south' ? 'you' : (s === 'west' ? 'partner' : 'opponent'),
    random: opts.random || fixedRng([0.1, 0.2, 0.3, 0.4]),
    now: clock.now,
  });
  return { dispatcher, updates, clock };
}

describe('mapEventToTrigger', () => {
  test('maps known event types', () => {
    assert.equal(mapEventToTrigger({ type: 'match:start' }), 'match_start');
    assert.equal(mapEventToTrigger({ type: 'trick:won' }), 'trick_won');
    assert.equal(mapEventToTrigger({ type: 'bid:total' }), 'bid_total');
    assert.equal(mapEventToTrigger({ type: 'game:end' }), 'game_end');
  });

  test('returns null for unknown', () => {
    assert.equal(mapEventToTrigger({ type: 'whatever' }), null);
    assert.equal(mapEventToTrigger(null), null);
    assert.equal(mapEventToTrigger({}), null);
  });
});

describe('pickSeatForEvent', () => {
  test('uses event.seat for seat-bound triggers', () => {
    assert.equal(pickSeatForEvent({ seat: 'east' }, 'bid_placed'), 'east');
    assert.equal(pickSeatForEvent({ winner: 'west' }, 'trick_won'), 'west');
  });

  test('falls back to a default seat for ambient triggers', () => {
    assert.equal(pickSeatForEvent({}, 'deal_start'), 'east');
    assert.equal(pickSeatForEvent({}, 'match_start'), 'west');
  });
});

describe('BanterDispatcher feed pushing', () => {
  test('handleEvents fires a line for a matched trigger', () => {
    const { dispatcher, updates } = makeDispatcher({
      // first random gates trigger probability — needs to be < TRIGGER_PROB
      // for trick_won (0.30); 0.1 passes. Rest pick line + cooldown noise.
      random: fixedRng([0.05, 0.0]),
    });
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].length, 1);
    assert.equal(updates[0][0].seat, 'east');
    assert.equal(updates[0][0].name, 'name-east');
    assert.equal(updates[0][0].text, '👏');
  });

  test('does not speak for the user (south)', () => {
    const { dispatcher, updates } = makeDispatcher();
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'south' }]);
    assert.equal(updates.length, 0);
  });

  test('skips when probability gate fails', () => {
    const { dispatcher, updates } = makeDispatcher({
      random: fixedRng([0.99]), // > all TRIGGER_PROB values
    });
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 0);
  });

  test('cooldown prevents same seat from speaking twice within window', () => {
    const clock = fixedClock();
    const { dispatcher, updates } = makeDispatcher({
      clock,
      random: fixedRng([0.05, 0.0, 0.05, 0.0]), // pass gate every time
    });
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    clock.advance(500); // < 1500ms cooldown
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 1, 'second call within cooldown should be suppressed');
  });

  test('cooldown allows same seat after window elapses', () => {
    const clock = fixedClock();
    const { dispatcher, updates } = makeDispatcher({
      clock,
      random: fixedRng([0.05, 0.0, 0.05, 0.0]),
    });
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    clock.advance(2000); // > 1500ms
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 2);
  });

  test('non-repeat: avoids picking the most-recent line for same trigger+seat', () => {
    // Force same trigger, same seat, repeatedly. First call picks pool[0]
    // ('line A'). Second call should NOT pick 'line A' again because the
    // recent buffer keeps it for 3 picks. Use trick:won so we can pin the
    // seat via `winner: 'east'` (match_start defaults to 'west').
    const clock = fixedClock();
    const { dispatcher, updates } = makeDispatcher({
      pack: { trick_won: { east: ['line A', 'line B'] } },
      clock,
      random: fixedRng([0.05, 0.0]), // gate pass + pick index 0
    });
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    clock.advance(2000);
    // Set RNG so floor(rng * pool.len) again picks index 0 from filtered pool
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 2);
    // updates[i] is the cumulative feed after speak i — newest line is the
    // LAST entry, not the first. Compare the newest from each snapshot.
    const firstSpoke = updates[0][updates[0].length - 1];
    const secondSpoke = updates[1][updates[1].length - 1];
    assert.notEqual(firstSpoke.text, secondSpoke.text,
      'second pick should not repeat the first');
  });

  test('missing pack key falls through silently', () => {
    const { dispatcher, updates } = makeDispatcher({
      pack: {}, // empty
      random: fixedRng([0.01]),
    });
    assert.doesNotThrow(() => {
      dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    });
    assert.equal(updates.length, 0);
  });

  test('feed is capped at 5 entries', () => {
    const clock = fixedClock();
    const { dispatcher, updates } = makeDispatcher({
      pack: { match_start: { east: ['e'], west: ['w'], north: ['n'] } },
      clock,
      random: fixedRng([0.05, 0.0]),
    });
    // Bypass cooldown by varying seat each call
    for (const seat of ['east', 'west', 'north', 'east', 'west', 'north', 'east']) {
      clock.advance(2000);
      dispatcher.handleEvents([{ type: 'match:start' /* defaults to 'west' */ }]);
      // For variety, also force-push directly
      dispatcher.pushSystem(`tick ${seat}`);
    }
    const finalFeed = updates[updates.length - 1];
    assert.ok(finalFeed.length <= 5, `feed length ${finalFeed.length} should be ≤ 5`);
  });
});

describe('BanterDispatcher emote', () => {
  test('sendEmote pushes user line immediately', () => {
    const { dispatcher, updates } = makeDispatcher({
      // first rng: emote echo prob (0.5 > 0.4 → no echo)
      random: fixedRng([0.5]),
    });
    dispatcher.sendEmote('👏');
    assert.equal(updates.length, 1);
    assert.equal(updates[0][0].seat, 'south');
    assert.equal(updates[0][0].role, 'you');
    assert.equal(updates[0][0].text, '👏');
  });
});

describe('BanterDispatcher pack swap', () => {
  test('setPack swaps to a new pack and clears recent caches', () => {
    const clock = fixedClock();
    const { dispatcher, updates } = makeDispatcher({
      pack: { trick_won: { east: ['orig'] } },
      clock,
      random: fixedRng([0.05, 0.0]),
    });
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 1);
    assert.equal(updates[0][updates[0].length - 1].text, 'orig');
    dispatcher.setPack({ trick_won: { east: ['fresh'] } });
    clock.advance(2000);
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 2);
    assert.equal(updates[1][updates[1].length - 1].text, 'fresh');
  });
});

describe('BanterDispatcher destroy', () => {
  test('destroy clears feed and ignores subsequent events', () => {
    const { dispatcher, updates } = makeDispatcher({
      random: fixedRng([0.05, 0.0]),
    });
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 1);
    dispatcher.destroy();
    dispatcher.handleEvents([{ type: 'trick:won', winner: 'east' }]);
    assert.equal(updates.length, 1, 'no new updates after destroy');
  });
});
