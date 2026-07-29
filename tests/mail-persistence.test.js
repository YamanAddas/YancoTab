/**
 * Mail account persistence.
 *
 * This blob is replicated through chrome.storage.sync and is reachable by the
 * JSON import path, so it can legitimately arrive malformed, truncated, from a
 * future version, or hand-edited. normalizeState() is the gate; these tests
 * push hostile and merely-weird input through it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    MAIL_KEY,
    MAX_ACCOUNTS,
    MAX_LABEL,
    emptyState,
    normalizeState,
    makeId,
    loadState,
    saveState,
    addAccount,
    removeAccount,
    setDefault,
    getDefaultAccount,
} from '../os/apps/mail/persistence.js';

/** Minimal kernel double with an in-memory store. */
function fakeKernel({ throwOnSave = false } = {}) {
    const store = new Map();
    const toasts = [];
    return {
        toasts,
        store,
        storage: {
            load: (k) => store.get(k),
            save: (k, v) => {
                if (throwOnSave) throw new Error('QuotaExceededError');
                store.set(k, JSON.parse(JSON.stringify(v)));
            },
        },
        emit: (evt, payload) => { if (evt === 'toast') toasts.push(payload); },
    };
}

describe('normalizeState — malformed input', () => {
    test('anything that is not a state object becomes empty', () => {
        for (const junk of [null, undefined, 0, '', 'x', [], {}, { accounts: null }, { accounts: 'no' }]) {
            assert.deepEqual(normalizeState(junk), emptyState(), `input ${JSON.stringify(junk)}`);
        }
    });

    test('drops entries with an unknown provider instead of remapping them', () => {
        // Remapping would silently repoint the row at a different mail host.
        const state = normalizeState({
            accounts: [
                { providerId: 'gmail', accountIndex: 0 },
                { providerId: 'not-a-provider', accountIndex: 0 },
                { providerId: null },
                'a string',
                null,
            ],
            defaultId: null,
        });
        assert.equal(state.accounts.length, 1);
        assert.equal(state.accounts[0].providerId, 'gmail');
    });

    test('de-duplicates rows that collapse to the same id', () => {
        // Two devices adding gmail/0 must converge on one row after sync.
        const state = normalizeState({
            accounts: [
                { providerId: 'gmail', accountIndex: 0, label: 'work' },
                { providerId: 'gmail', accountIndex: 0, label: 'work again' },
            ],
            defaultId: null,
        });
        assert.equal(state.accounts.length, 1);
        assert.equal(state.accounts[0].label, 'work');
    });

    test('caps the list at MAX_ACCOUNTS', () => {
        const accounts = Array.from({ length: 50 }, (_, i) => ({ providerId: 'gmail', accountIndex: i }));
        const state = normalizeState({ accounts, defaultId: null });
        assert.ok(state.accounts.length <= MAX_ACCOUNTS, `got ${state.accounts.length}`);
    });

    test('normalizes a hostile account index rather than storing it', () => {
        const state = normalizeState({
            accounts: [{ providerId: 'gmail', accountIndex: '../../evil' }],
            defaultId: null,
        });
        assert.equal(state.accounts[0].accountIndex, 0);
    });

    test('forces accountIndex to 0 for providers with no account concept', () => {
        const state = normalizeState({
            accounts: [{ providerId: 'icloud', accountIndex: 7 }],
            defaultId: null,
        });
        assert.equal(state.accounts[0].accountIndex, 0);
    });
});

describe('normalizeState — label hygiene', () => {
    test('strips control characters, zero-widths and bidi overrides', () => {
        // Built from codepoints rather than pasted literals so this file stays
        // text: embedding raw C0 bytes makes git treat the test as binary and
        // the diff becomes unreviewable.
        const HOSTILE = [0x0000, 0x001f, 0x007f, 0x200b, 0x202e, 0x2069];
        const ch = (cp) => String.fromCodePoint(cp);
        const nasty = 'wo' + ch(0x0000) + 'rk' + ch(0x001f) + ch(0x007f)
            + ch(0x200b) + ch(0x202e) + 'reversed' + ch(0x2069);
        const state = normalizeState({ accounts: [{ providerId: 'gmail', label: nasty }], defaultId: null });
        const label = state.accounts[0].label;
        for (const cp of HOSTILE) {
            assert.ok(!label.includes(ch(cp)),
                `U+${cp.toString(16)} survived in ${JSON.stringify(label)}`);
        }
        assert.equal(label, 'workreversed');
    });

    test('keeps ordinary non-ASCII intact — Arabic labels must survive', () => {
        const state = normalizeState({
            accounts: [{ providerId: 'gmail', label: 'بريد العمل' }],
            defaultId: null,
        });
        assert.equal(state.accounts[0].label, 'بريد العمل');
    });

    test('keeps emoji intact (surrogate pairs are iterated as one char)', () => {
        const state = normalizeState({
            accounts: [{ providerId: 'gmail', label: '📮 inbox' }],
            defaultId: null,
        });
        assert.equal(state.accounts[0].label, '📮 inbox');
    });

    test('truncates to MAX_LABEL and trims', () => {
        const state = normalizeState({
            accounts: [{ providerId: 'gmail', label: '   ' + 'x'.repeat(500) + '   ' }],
            defaultId: null,
        });
        assert.equal(state.accounts[0].label.length, MAX_LABEL);
    });

    test('non-string labels become empty rather than "undefined"', () => {
        for (const bad of [undefined, null, 42, {}, []]) {
            const state = normalizeState({ accounts: [{ providerId: 'gmail', label: bad }], defaultId: null });
            assert.equal(state.accounts[0].label, '');
        }
    });
});

describe('defaultId consistency', () => {
    test('a dangling defaultId falls back to the first account', () => {
        // Otherwise the header would render with no primary action.
        const state = normalizeState({
            accounts: [{ providerId: 'gmail', accountIndex: 0 }],
            defaultId: 'gmail:9',
        });
        assert.equal(state.defaultId, 'gmail:0');
    });

    test('defaultId is null when there are no accounts', () => {
        assert.equal(normalizeState({ accounts: [], defaultId: 'gmail:0' }).defaultId, null);
    });

    test('a non-string defaultId is discarded', () => {
        const state = normalizeState({ accounts: [{ providerId: 'gmail' }], defaultId: { evil: 1 } });
        assert.equal(state.defaultId, 'gmail:0');
    });
});

describe('addAccount', () => {
    test('adds and makes the first account the default', () => {
        const s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0, label: 'work' });
        assert.equal(s.accounts.length, 1);
        assert.equal(s.defaultId, 'gmail:0');
    });

    test('a second account does not steal the default', () => {
        let s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0 });
        s = addAccount(s, { providerId: 'gmail', accountIndex: 1 });
        assert.equal(s.accounts.length, 2);
        assert.equal(s.defaultId, 'gmail:0');
    });

    test('same provider, different index → two distinct accounts', () => {
        // This is the whole point of the feature: work vs personal Gmail.
        let s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0, label: 'work' });
        s = addAccount(s, { providerId: 'gmail', accountIndex: 1, label: 'personal' });
        assert.deepEqual(s.accounts.map(a => a.id), ['gmail:0', 'gmail:1']);
    });

    test('re-adding an existing account renames instead of duplicating', () => {
        let s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0, label: 'old' });
        s = addAccount(s, { providerId: 'gmail', accountIndex: 0, label: 'new' });
        assert.equal(s.accounts.length, 1);
        assert.equal(s.accounts[0].label, 'new');
    });

    test('re-adding with a blank label keeps the old one', () => {
        let s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0, label: 'keep' });
        s = addAccount(s, { providerId: 'gmail', accountIndex: 0, label: '' });
        assert.equal(s.accounts[0].label, 'keep');
    });

    test('an unknown provider is refused', () => {
        const s = addAccount(emptyState(), { providerId: 'evil', accountIndex: 0 });
        assert.equal(s.accounts.length, 0);
    });

    test('refuses to grow past MAX_ACCOUNTS', () => {
        let s = emptyState();
        // Only 10 distinct gmail indexes exist (0..9), so mix providers.
        for (let i = 0; i <= 9; i++) s = addAccount(s, { providerId: 'gmail', accountIndex: i });
        for (let i = 0; i <= 9; i++) s = addAccount(s, { providerId: 'outlook', accountIndex: i });
        assert.equal(s.accounts.length, MAX_ACCOUNTS);
    });

    test('does not mutate the input state', () => {
        const before = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0 });
        const snapshot = JSON.stringify(before);
        addAccount(before, { providerId: 'outlook', accountIndex: 0 });
        assert.equal(JSON.stringify(before), snapshot);
    });
});

describe('removeAccount / setDefault', () => {
    test('removing the default promotes another account', () => {
        let s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0 });
        s = addAccount(s, { providerId: 'outlook', accountIndex: 0 });
        assert.equal(s.defaultId, 'gmail:0');
        s = removeAccount(s, 'gmail:0');
        assert.equal(s.accounts.length, 1);
        assert.equal(s.defaultId, 'outlook:0', 'default must not dangle');
    });

    test('removing the last account nulls the default', () => {
        let s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0 });
        s = removeAccount(s, 'gmail:0');
        assert.deepEqual(s, emptyState());
    });

    test('removing an unknown id is a no-op', () => {
        const s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0 });
        assert.deepEqual(removeAccount(s, 'nope:0'), s);
    });

    test('setDefault only accepts an existing account', () => {
        let s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0 });
        s = addAccount(s, { providerId: 'outlook', accountIndex: 0 });
        s = setDefault(s, 'outlook:0');
        assert.equal(s.defaultId, 'outlook:0');
        s = setDefault(s, 'ghost:0');
        assert.equal(s.defaultId, 'outlook:0', 'must ignore an unknown id');
    });

    test('getDefaultAccount returns the row, or null', () => {
        assert.equal(getDefaultAccount(emptyState()), null);
        const s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 3, label: 'x' });
        assert.equal(getDefaultAccount(s).id, 'gmail:3');
    });
});

describe('load / save through kernel.storage', () => {
    test('round-trips through the storage layer', () => {
        const k = fakeKernel();
        const s = addAccount(emptyState(), { providerId: 'gmail', accountIndex: 1, label: 'work' });
        saveState(k, s);
        assert.deepEqual(loadState(k), s);
        assert.ok(k.store.has(MAIL_KEY), 'must write the registered key');
    });

    test('loading with no stored value yields empty state', () => {
        assert.deepEqual(loadState(fakeKernel()), emptyState());
    });

    test('a storage quota failure toasts instead of failing silently', () => {
        // Otherwise the row appears in the UI and vanishes on next open.
        const k = fakeKernel({ throwOnSave: true });
        saveState(k, addAccount(emptyState(), { providerId: 'gmail', accountIndex: 0 }));
        assert.equal(k.toasts.length, 1);
        assert.equal(k.toasts[0].type, 'error');
    });

    test('a throwing storage.load degrades to empty rather than crashing the app', () => {
        const k = { storage: { load: () => { throw new Error('corrupt'); } } };
        assert.deepEqual(loadState(k), emptyState());
    });

    test('survives a kernel with no storage at all', () => {
        assert.deepEqual(loadState({}), emptyState());
        assert.doesNotThrow(() => saveState({}, emptyState()));
    });

    test('save normalizes before writing, so junk never lands in storage', () => {
        const k = fakeKernel();
        saveState(k, { accounts: [{ providerId: 'evil' }, { providerId: 'gmail', label: 'a b' }], defaultId: 'x' });
        const stored = k.store.get(MAIL_KEY);
        assert.equal(stored.accounts.length, 1);
        assert.equal(stored.accounts[0].label, 'ab');
        assert.equal(stored.defaultId, 'gmail:0');
    });
});

describe('makeId', () => {
    test('is stable and derived, not random', () => {
        assert.equal(makeId('gmail', 0), makeId('gmail', 0));
        assert.equal(makeId('gmail', 2), 'gmail:2');
    });

    test('normalizes the index so junk cannot fork the id', () => {
        assert.equal(makeId('gmail', NaN), 'gmail:0');
        assert.equal(makeId('gmail', '2'), 'gmail:2');
        assert.equal(makeId('gmail', -5), 'gmail:0');
    });
});
