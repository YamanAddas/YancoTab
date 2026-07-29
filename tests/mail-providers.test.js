/**
 * Mail provider registry.
 *
 * buildUrl() is the only thing in the Mail app that produces a value handed to
 * window.open, so it is the security boundary. These tests pin that it can
 * never emit a non-https URL, never guess a provider, and never let an
 * out-of-range or hostile account index reach a URL.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    PROVIDERS,
    getProvider,
    buildUrl,
    supportsAccountIndex,
    normalizeAccountIndex,
    MAX_ACCOUNT_INDEX,
} from '../os/apps/mail/providers.js';

describe('provider registry — integrity', () => {
    test('every provider has the full required shape', () => {
        for (const p of PROVIDERS) {
            assert.equal(typeof p.id, 'string', `${p.name} id`);
            assert.ok(p.id.length, `${p.name} id non-empty`);
            assert.equal(typeof p.name, 'string');
            assert.equal(typeof p.short, 'string');
            assert.match(p.brand, /^#[0-9a-f]{6}$/i, `${p.name} brand must be a hex colour`);
            assert.equal(typeof p.accountIndex, 'boolean');
            assert.equal(typeof p.inbox, 'string');
            assert.equal(typeof p.compose, 'string');
        }
    });

    test('provider ids are unique — storage keys off them', () => {
        const ids = PROVIDERS.map(p => p.id);
        assert.equal(new Set(ids).size, ids.length);
    });

    test('every template is https', () => {
        // http would be a downgrade on a login-bearing page; anything else
        // (javascript:, data:) would be an outright injection vector.
        for (const p of PROVIDERS) {
            assert.ok(p.inbox.startsWith('https://'), `${p.id} inbox: ${p.inbox}`);
            assert.ok(p.compose.startsWith('https://'), `${p.id} compose: ${p.compose}`);
        }
    });

    test('only providers flagged accountIndex use the {i} placeholder', () => {
        // A stray {i} on a non-indexed provider would ship a literal "{i}" in
        // the URL; a missing {i} on an indexed one would silently ignore the
        // account the user picked and always open account 0.
        for (const p of PROVIDERS) {
            const uses = p.inbox.includes('{i}') || p.compose.includes('{i}');
            if (p.accountIndex) {
                assert.ok(p.inbox.includes('{i}'), `${p.id} claims accountIndex but inbox has no {i}`);
            } else {
                assert.ok(!uses, `${p.id} is not indexed but a template contains {i}`);
            }
        }
    });

    test('the providers the user asked for are present', () => {
        for (const id of ['gmail', 'outlook', 'icloud']) {
            assert.ok(getProvider(id), `${id} missing`);
        }
    });

    test('gmail and outlook support multi-account, icloud does not', () => {
        assert.equal(supportsAccountIndex('gmail'), true);
        assert.equal(supportsAccountIndex('outlook'), true);
        // Apple exposes no per-account path segment.
        assert.equal(supportsAccountIndex('icloud'), false);
        assert.equal(supportsAccountIndex('nope'), false);
    });
});

describe('normalizeAccountIndex', () => {
    test('passes through valid indexes', () => {
        assert.equal(normalizeAccountIndex(0), 0);
        assert.equal(normalizeAccountIndex(3), 3);
        assert.equal(normalizeAccountIndex(MAX_ACCOUNT_INDEX), MAX_ACCOUNT_INDEX);
    });

    test('clamps out-of-range', () => {
        assert.equal(normalizeAccountIndex(-1), 0);
        assert.equal(normalizeAccountIndex(-999), 0);
        assert.equal(normalizeAccountIndex(1e9), MAX_ACCOUNT_INDEX);
    });

    test('coerces junk to 0 rather than emitting NaN into a URL', () => {
        // parseInt('') is NaN; a NaN reaching the template yields
        // /mail/u/NaN/ which 404s. These are the realistic inputs: an empty
        // number field, a hand-edited storage blob, a bad import.
        for (const junk of [NaN, undefined, null, '', 'abc', {}, [], Infinity, -Infinity]) {
            assert.equal(normalizeAccountIndex(junk), 0, `input ${JSON.stringify(junk)}`);
        }
    });

    test('truncates floats and numeric strings', () => {
        assert.equal(normalizeAccountIndex(2.9), 2);
        assert.equal(normalizeAccountIndex('2'), 2);
        assert.equal(normalizeAccountIndex('2.9'), 2);
        assert.equal(normalizeAccountIndex(-0.5), 0);
    });
});

describe('buildUrl', () => {
    test('substitutes the account index for indexed providers', () => {
        assert.equal(buildUrl('gmail', 0, 'inbox'), 'https://mail.google.com/mail/u/0/');
        assert.equal(buildUrl('gmail', 2, 'inbox'), 'https://mail.google.com/mail/u/2/');
        assert.equal(buildUrl('outlook', 1, 'inbox'), 'https://outlook.live.com/mail/1/');
    });

    test('ignores the index for providers that have no such concept', () => {
        // Passing 5 must not produce a bogus path — iCloud has one inbox URL.
        assert.equal(buildUrl('icloud', 5, 'inbox'), 'https://www.icloud.com/mail');
        assert.equal(buildUrl('outlook365', 3, 'inbox'), 'https://outlook.office.com/mail/');
    });

    test('compose differs from inbox where the provider supports it', () => {
        assert.notEqual(buildUrl('gmail', 0, 'compose'), buildUrl('gmail', 0, 'inbox'));
        assert.match(buildUrl('gmail', 0, 'compose'), /compose/);
    });

    test('defaults to the inbox for an unknown kind', () => {
        assert.equal(buildUrl('gmail', 0, 'garbage'), buildUrl('gmail', 0, 'inbox'));
        assert.equal(buildUrl('gmail'), 'https://mail.google.com/mail/u/0/');
    });

    test('returns null — never a guess — for an unknown provider', () => {
        // Falling back to a default provider would silently send a user's
        // click to a mail host that is not theirs.
        for (const bad of ['nope', '', null, undefined, 0, {}, '__proto__', 'constructor']) {
            assert.equal(buildUrl(bad, 0, 'inbox'), null, `input ${JSON.stringify(bad)}`);
        }
    });

    test('no reachable input yields a non-https URL', () => {
        // Sweep the whole matrix: every provider x hostile indexes x both kinds.
        const hostile = [0, -1, 99, NaN, '3', 2.7, null, undefined, '../../evil', 'javascript:alert(1)'];
        for (const p of PROVIDERS) {
            for (const idx of hostile) {
                for (const kind of ['inbox', 'compose']) {
                    const url = buildUrl(p.id, idx, kind);
                    assert.ok(url && url.startsWith('https://'),
                        `${p.id}/${String(idx)}/${kind} produced ${url}`);
                    // A string index must never survive into the path.
                    assert.ok(!url.includes('javascript:'), `${p.id} leaked a scheme`);
                    assert.ok(!url.includes('..'), `${p.id} leaked path traversal`);
                    assert.ok(!url.includes('{i}'), `${p.id} left an unsubstituted placeholder`);
                }
            }
        }
    });

    test('prototype keys on the registry lookup do not resolve', () => {
        // BY_ID is a Map, so this is already safe — pinned so a future switch
        // to a plain object cannot reintroduce prototype-chain hits.
        assert.equal(getProvider('__proto__'), null);
        assert.equal(getProvider('toString'), null);
        assert.equal(getProvider('hasOwnProperty'), null);
    });
});
