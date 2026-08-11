/**
 * mail-reorder.test.js
 *
 * The ordering rules live here because dragRail.js only measures and moves —
 * every decision it makes comes from this module. That split is what lets the
 * drop-index logic be exercised against boundaries a pointer gesture can only
 * hit by accident.
 *
 * The invariant that matters most is the one about *not losing accounts*:
 * reordering is a rearrangement, and no input — partial, duplicated, hostile —
 * may make an account disappear.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    moveAccount, dropIndexFor, isDragGesture, DRAG_MOVE_PX, DRAG_HOLD_MS,
} from '../os/apps/mail/reorder.js';
import { reorderAccounts } from '../os/apps/mail/persistence.js';

const list = (...ids) => ids.map(id => ({ id }));
const ids = (l) => l.map(a => a.id);

describe('moveAccount', () => {
    it('moves forward and backward', () => {
        assert.deepEqual(ids(moveAccount(list('a', 'b', 'c'), 'a', 2)), ['b', 'c', 'a']);
        assert.deepEqual(ids(moveAccount(list('a', 'b', 'c'), 'c', 0)), ['c', 'a', 'b']);
        assert.deepEqual(ids(moveAccount(list('a', 'b', 'c'), 'b', 2)), ['a', 'c', 'b']);
    });

    it('clamps out-of-range targets instead of dropping the item', () => {
        assert.deepEqual(ids(moveAccount(list('a', 'b', 'c'), 'a', 99)), ['b', 'c', 'a']);
        assert.deepEqual(ids(moveAccount(list('a', 'b', 'c'), 'c', -5)), ['c', 'a', 'b']);
    });

    it('returns the SAME reference on a no-op, so callers can skip the write', () => {
        const l = list('a', 'b', 'c');
        assert.equal(moveAccount(l, 'a', 0), l, 'same index');
        assert.equal(moveAccount(l, 'nope', 1), l, 'unknown id');
        assert.equal(moveAccount(l, 'a', NaN), l, 'NaN index');
        assert.equal(moveAccount(l, 'a', Infinity), l, 'non-finite index');
    });

    it('is a no-op on lists too short to reorder', () => {
        const one = list('a');
        assert.equal(moveAccount(one, 'a', 0), one);
        assert.equal(moveAccount([], 'a', 0).length, 0);
    });

    it('survives hostile input', () => {
        for (const bad of [null, undefined, 'x', 42, {}]) {
            assert.doesNotThrow(() => moveAccount(bad, 'a', 0), JSON.stringify(bad));
        }
    });

    it('never loses, duplicates, or mutates', () => {
        const original = list('a', 'b', 'c', 'd');
        const snapshot = ids(original);
        for (let from = 0; from < 4; from++) {
            for (let to = 0; to < 4; to++) {
                const out = moveAccount(original, snapshot[from], to);
                assert.equal(out.length, 4, `${from}->${to} length`);
                assert.deepEqual([...ids(out)].sort(), [...snapshot].sort(), `${from}->${to} set`);
            }
        }
        assert.deepEqual(ids(original), snapshot, 'input was mutated');
    });

    it('is idempotent', () => {
        const once = moveAccount(list('a', 'b', 'c'), 'a', 2);
        const twice = moveAccount(once, 'a', 2);
        assert.deepEqual(ids(twice), ids(once));
    });
});

describe('dropIndexFor', () => {
    // Two rows of two: [0][1] / [2][3]
    const rects = [
        { left: 0, top: 0, right: 100, bottom: 50 },
        { left: 110, top: 0, right: 210, bottom: 50 },
        { left: 0, top: 60, right: 100, bottom: 110 },
        { left: 110, top: 60, right: 210, bottom: 110 },
    ];

    it('above everything lands at 0', () => {
        assert.equal(dropIndexFor(rects, 50, -20), 0);
    });

    it('below everything lands at the end', () => {
        assert.equal(dropIndexFor(rects, 50, 400), rects.length);
    });

    it('decides by the horizontal midpoint within a row', () => {
        assert.equal(dropIndexFor(rects, 10, 25), 0, 'left of first midpoint');
        assert.equal(dropIndexFor(rects, 90, 25), 1, 'right of first midpoint');
        assert.equal(dropIndexFor(rects, 120, 25), 1, 'left of second midpoint');
    });

    it('past the last card of a row lands at the start of the next row, not the end', () => {
        // The naive version returned rects.length here, so dragging just to
        // the right of row 1 jumped the card all the way to the bottom.
        assert.equal(dropIndexFor(rects, 300, 25), 2);
    });

    it('handles an empty or malformed list', () => {
        assert.equal(dropIndexFor([], 0, 0), 0);
        assert.equal(dropIndexFor(null, 0, 0), 0);
        assert.equal(dropIndexFor(undefined, 0, 0), 0);
        assert.doesNotThrow(() => dropIndexFor([null, undefined], 0, 0));
    });

    it('always returns an index inside [0, length]', () => {
        for (const x of [-500, 0, 55, 105, 205, 900]) {
            for (const y of [-500, 0, 25, 55, 85, 900]) {
                const at = dropIndexFor(rects, x, y);
                assert.ok(Number.isInteger(at) && at >= 0 && at <= rects.length,
                    `(${x},${y}) -> ${at}`);
            }
        }
    });
});

describe('isDragGesture', () => {
    it('a still, brief press is a click', () => {
        assert.equal(isDragGesture({ dx: 0, dy: 0, heldMs: 0 }), false);
        assert.equal(isDragGesture({ dx: 3, dy: 3, heldMs: 100 }), false);
    });

    it('commits on distance', () => {
        assert.equal(isDragGesture({ dx: DRAG_MOVE_PX, dy: 0, heldMs: 0 }), true);
        assert.equal(isDragGesture({ dx: 0, dy: -DRAG_MOVE_PX, heldMs: 0 }), true);
    });

    it('commits on hold, with no movement at all', () => {
        assert.equal(isDragGesture({ dx: 0, dy: 0, heldMs: DRAG_HOLD_MS }), true);
    });

    it('tolerates a missing field', () => {
        assert.equal(isDragGesture({}), false);
    });
});

describe('reorderAccounts (persistence)', () => {
    const state = {
        accounts: [
            { id: 'gmail:0', providerId: 'gmail', accountIndex: 0, label: 'work' },
            { id: 'gmail:1', providerId: 'gmail', accountIndex: 1, label: 'home' },
            { id: 'proton:0', providerId: 'proton', accountIndex: 0, label: 'private' },
        ],
        defaultId: 'gmail:1',
    };

    it('applies the given order', () => {
        const next = reorderAccounts(state, ['proton:0', 'gmail:1', 'gmail:0']);
        assert.deepEqual(next.accounts.map(a => a.id), ['proton:0', 'gmail:1', 'gmail:0']);
    });

    it('keeps the default pointing at the same account', () => {
        const next = reorderAccounts(state, ['proton:0', 'gmail:1', 'gmail:0']);
        assert.equal(next.defaultId, 'gmail:1');
    });

    it('appends anything the list omitted rather than deleting it', () => {
        // A partial list must never be able to remove an account.
        const next = reorderAccounts(state, ['proton:0']);
        assert.equal(next.accounts.length, 3);
        assert.equal(next.accounts[0].id, 'proton:0');
        assert.deepEqual(next.accounts.map(a => a.id).sort(),
            state.accounts.map(a => a.id).sort());
    });

    it('ignores unknown and duplicated ids', () => {
        const next = reorderAccounts(state, ['nope', 'gmail:1', 'gmail:1', '__proto__', 'gmail:0']);
        assert.deepEqual(next.accounts.map(a => a.id), ['gmail:1', 'gmail:0', 'proton:0']);
    });

    it('survives a hostile order argument', () => {
        for (const bad of [null, undefined, 'x', 42, {}, [null, 1, {}, []]]) {
            const next = reorderAccounts(state, bad);
            assert.equal(next.accounts.length, 3, JSON.stringify(bad));
        }
    });
});
