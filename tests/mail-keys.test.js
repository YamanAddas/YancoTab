/**
 * mail-keys.test.js
 *
 * The whole point of resolveKey being pure is that the matrix is testable, so
 * this tests the matrix rather than a few happy paths.
 *
 * Two rules carry most of the weight:
 *
 *   • Typing always wins. Every shortcut must be inert while focus is in a
 *     field, or `/` and the digits become unusable the moment a search bar
 *     exists.
 *   • `bubble` is not `none`. It means "deliberately do nothing AND let the
 *     shell see this", which is how Mail inherits the v1.10.6 Escape ladder
 *     (blur the field, then close the window) by declining to handle instead
 *     of reimplementing it. Collapsing bubble into none would silently delete
 *     the ability to close the Mail window with Escape.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveKey } from '../os/apps/mail/keys.js';

const base = {
    key: 'a', ctrl: false, alt: false, isComposing: false,
    editable: false, searchFocused: false, searchHasText: false,
    picking: false, accountCount: 3, canCompose: true, canSearch: true,
};
const at = (over) => resolveKey({ ...base, ...over });

describe('resolveKey — Escape ladder', () => {
    it('a typed query is cleared, and Mail claims the key', () => {
        assert.deepEqual(
            at({ key: 'Escape', editable: true, searchFocused: true, searchHasText: true }),
            { type: 'clearSearch' },
        );
    });

    it('an EMPTY focused search bubbles, so the shell blurs it', () => {
        // This is the two-stage rule: the key that dismisses a typo is not
        // also the key that tears the window down. Mail gets it by declining.
        assert.deepEqual(
            at({ key: 'Escape', editable: true, searchFocused: true, searchHasText: false }),
            { type: 'bubble' },
        );
    });

    it('cancels the picker before anything else', () => {
        assert.deepEqual(at({ key: 'Escape', picking: true }), { type: 'cancelPick' });
    });

    it('bubbles when there is nothing to cancel, so the shell closes the window', () => {
        assert.deepEqual(at({ key: 'Escape' }), { type: 'bubble' });
        assert.deepEqual(at({ key: 'Escape', accountCount: 0 }), { type: 'bubble' });
    });

    it('is evaluated BEFORE the editable bail-out', () => {
        // The old handler returned early on INPUT/TEXTAREA before looking at
        // Escape, which made "Escape clears search" dead code. Locked here.
        const r = at({ key: 'Escape', editable: true, searchFocused: true, searchHasText: true });
        assert.notDeepEqual(r, { type: 'none' });
    });

    it('a picker armed while typing still lets the field keep Escape', () => {
        assert.deepEqual(
            at({ key: 'Escape', picking: true, editable: true, searchFocused: true, searchHasText: true }),
            { type: 'clearSearch' },
        );
    });
});

describe('resolveKey — typing always wins', () => {
    for (const key of ['/', '1', '5', '9', 'c', 'C', 'Enter']) {
        it(`"${key}" is inert while focus is in a field`, () => {
            assert.deepEqual(at({ key, editable: true }), { type: 'none' });
        });
    }

    it('every key is inert mid IME composition, Escape included', () => {
        for (const key of ['Escape', '/', '1', 'c', 'Enter', 'a']) {
            assert.deepEqual(at({ key, isComposing: true }), { type: 'none' }, key);
        }
    });
});

describe('resolveKey — modifiers', () => {
    it('never shadows a Ctrl/Cmd shortcut', () => {
        for (const key of ['/', '1', 'c', 'Enter', 'Escape']) {
            assert.deepEqual(at({ key, ctrl: true }), { type: 'none' }, `ctrl+${key}`);
        }
    });

    it('never shadows an Alt shortcut', () => {
        for (const key of ['/', '1', 'c', 'Enter']) {
            assert.deepEqual(at({ key, alt: true }), { type: 'none' }, `alt+${key}`);
        }
    });
});

describe('resolveKey — account digits', () => {
    it('1-9 map to zero-based indexes', () => {
        assert.deepEqual(at({ key: '1', accountCount: 3 }), { type: 'openAccount', index: 0 });
        assert.deepEqual(at({ key: '3', accountCount: 3 }), { type: 'openAccount', index: 2 });
    });

    it('past the end is inert — never wraps', () => {
        // A silent jump to account 1 reads as the key having done something
        // else entirely.
        assert.deepEqual(at({ key: '4', accountCount: 3 }), { type: 'none' });
        assert.deepEqual(at({ key: '9', accountCount: 3 }), { type: 'none' });
        assert.deepEqual(at({ key: '1', accountCount: 0 }), { type: 'none' });
    });

    it('0 is not an account key', () => {
        assert.deepEqual(at({ key: '0', accountCount: 3 }), { type: 'none' });
    });

    it('covers the whole 1-9 range against a full board', () => {
        for (let n = 1; n <= 9; n++) {
            assert.deepEqual(
                at({ key: String(n), accountCount: 9 }),
                { type: 'openAccount', index: n - 1 },
            );
        }
    });
});

describe('resolveKey — capability gating', () => {
    it('/ only focuses search when something can search', () => {
        assert.deepEqual(at({ key: '/', canSearch: true }), { type: 'focusSearch' });
        assert.deepEqual(at({ key: '/', canSearch: false }), { type: 'none' });
    });

    it('C only composes when the default account declares compose', () => {
        assert.deepEqual(at({ key: 'c', canCompose: true }), { type: 'compose' });
        assert.deepEqual(at({ key: 'C', canCompose: true }), { type: 'compose' });
        // iCloud is the live case: it has no compose destination at all.
        assert.deepEqual(at({ key: 'c', canCompose: false }), { type: 'none' });
    });

    it('Enter opens the default', () => {
        assert.deepEqual(at({ key: 'Enter' }), { type: 'openDefault' });
    });
});

describe('resolveKey — hostile input', () => {
    it('a missing or non-string key is inert', () => {
        for (const key of [undefined, null, '', 0, {}, [], 42]) {
            assert.deepEqual(resolveKey({ ...base, key }), { type: 'none' }, JSON.stringify(key));
        }
    });

    it('an empty context does not throw', () => {
        assert.deepEqual(resolveKey(), { type: 'none' });
        assert.deepEqual(resolveKey({}), { type: 'none' });
    });

    it('unhandled keys are inert', () => {
        for (const key of ['a', 'Z', 'F5', 'Tab', 'ArrowDown', ' ', 'Dead']) {
            assert.deepEqual(at({ key }), { type: 'none' }, key);
        }
    });

    it('a non-finite accountCount cannot produce an index', () => {
        for (const n of [NaN, Infinity, -1, null, undefined, 'x']) {
            assert.deepEqual(at({ key: '1', accountCount: n }), { type: 'none' }, String(n));
        }
    });
});
