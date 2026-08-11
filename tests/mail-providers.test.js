/**
 * mail-providers.test.js
 *
 * buildUrl() is the only thing in the Mail app that produces a value handed to
 * window.open, so it is the security boundary and gets swept rather than
 * spot-checked.
 *
 * Two properties are new in Mail v2 and both are *changes* of behaviour, so
 * they are asserted explicitly rather than left implied:
 *
 *   1. An unknown kind returns null, NOT the inbox. The old version fell back
 *      to the inbox, which meant a typo'd or unsupported kind silently opened
 *      the wrong thing — the same lie iCloud's compose button used to tell.
 *   2. Origin invariance: the result still starts with the template's own
 *      literal prefix. Stronger than a startsWith('https://') check, because
 *      it proves interpolation cannot move the host or path root regardless of
 *      how good the encoder is.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    PROVIDERS,
    KINDS,
    getProvider,
    buildUrl,
    searchUrl,
    searchableProviders,
    supports,
    destinations,
    supportsAccountIndex,
    normalizeAccountIndex,
    MAX_ACCOUNT_INDEX,
} from '../os/apps/mail/providers.js';

const HOSTILE = [
    'javascript:alert(1)', 'data:text/html,x', '../../evil', '//evil.example',
    '', ' ', null, undefined, {}, [], 0, NaN, '__proto__', 'constructor',
    'toString', 'hasOwnProperty',
];

describe('provider table integrity', () => {
    it('every provider has the required fields', () => {
        for (const p of PROVIDERS) {
            assert.equal(typeof p.id, 'string', 'id');
            assert.ok(p.id.length, `${p.id} id empty`);
            assert.ok(p.name.length, `${p.id} name empty`);
            assert.equal(typeof p.accountIndex, 'boolean', `${p.id} accountIndex`);
            assert.ok(['brand', 'light'].includes(p.plate), `${p.id} plate`);
            assert.match(p.brand, /^#[0-9a-f]{6}$/i, `${p.id} brand`);
            assert.equal(typeof p.dest, 'object', `${p.id} dest`);
        }
    });

    it('ids are unique', () => {
        const ids = PROVIDERS.map(p => p.id);
        assert.equal(new Set(ids).size, ids.length);
    });

    it('every declared destination is an https literal', () => {
        for (const p of PROVIDERS) {
            for (const [kind, tpl] of Object.entries(p.dest)) {
                assert.ok(KINDS.includes(kind), `${p.id}.${kind} is not a known kind`);
                assert.match(tpl, /^https:\/\//, `${p.id}.${kind}`);
            }
        }
    });

    it('every provider declares an inbox — it is the one universal destination', () => {
        for (const p of PROVIDERS) {
            assert.ok(supports(p.id, 'inbox'), `${p.id} has no inbox`);
        }
    });

    it('{i} appears only where the provider addresses accounts by index', () => {
        for (const p of PROVIDERS) {
            for (const [kind, tpl] of Object.entries(p.dest)) {
                if (!p.accountIndex) {
                    assert.ok(!tpl.includes('{i}'), `${p.id}.${kind} uses {i} but accountIndex is false`);
                }
            }
        }
    });

    it('{q} appears only in a search destination', () => {
        for (const p of PROVIDERS) {
            for (const [kind, tpl] of Object.entries(p.dest)) {
                if (tpl.includes('{q}')) assert.equal(kind, 'search', `${p.id}.${kind}`);
            }
        }
    });

    it('no template carries a placeholder other than {i} and {q}', () => {
        for (const p of PROVIDERS) {
            for (const [kind, tpl] of Object.entries(p.dest)) {
                const found = tpl.match(/\{[^}]*\}/g) || [];
                for (const ph of found) {
                    assert.ok(['{i}', '{q}'].includes(ph), `${p.id}.${kind} has ${ph}`);
                }
            }
        }
    });
});

describe('getProvider', () => {
    it('resolves every id in the table', () => {
        for (const p of PROVIDERS) assert.ok(getProvider(p.id), `${p.id} missing`);
    });

    it('never resolves an inherited Object property', () => {
        // The provider id comes out of a sync-replicated, import-reachable blob.
        assert.equal(getProvider('__proto__'), null);
        assert.equal(getProvider('constructor'), null);
        assert.equal(getProvider('toString'), null);
        assert.equal(getProvider('hasOwnProperty'), null);
    });

    it('returns null for hostile input rather than guessing', () => {
        for (const bad of HOSTILE) assert.equal(getProvider(bad), null, JSON.stringify(bad));
    });
});

describe('supports / destinations — capability is declared, not inferred', () => {
    it('iCloud declares no compose destination', () => {
        // Regression lock. This used to be the inbox URL copied into the
        // compose slot, so the button reopened the inbox and lied about it.
        assert.equal(supports('icloud', 'compose'), false);
        assert.equal(buildUrl('icloud', 'compose'), null);
        assert.deepEqual(destinations('icloud'), ['inbox']);
    });

    it('is false for an unknown provider and for an unknown kind', () => {
        assert.equal(supports('nope', 'inbox'), false);
        assert.equal(supports('gmail', 'nope'), false);
        assert.equal(supports('gmail', '__proto__'), false);
        for (const bad of HOSTILE) {
            assert.equal(supports(bad, 'inbox'), false, `provider ${JSON.stringify(bad)}`);
            assert.equal(supports('gmail', bad), false, `kind ${JSON.stringify(bad)}`);
        }
    });

    it('destinations() returns [] for an unknown provider', () => {
        assert.deepEqual(destinations('nope'), []);
        assert.deepEqual(destinations('__proto__'), []);
    });

    it('destinations() follows KINDS order, not the table authoring order', () => {
        for (const p of PROVIDERS) {
            const got = destinations(p.id);
            const expected = KINDS.filter(k => got.includes(k));
            assert.deepEqual(got, expected, `${p.id} chip order`);
        }
    });

    it('every listed destination actually builds', () => {
        for (const p of PROVIDERS) {
            for (const kind of destinations(p.id)) {
                const url = buildUrl(p.id, kind, { accountIndex: 0, query: 'x' });
                assert.ok(url, `${p.id}.${kind} listed but does not build`);
            }
        }
    });
});

describe('buildUrl', () => {
    it('substitutes the account index', () => {
        assert.equal(buildUrl('gmail', 'inbox'), 'https://mail.google.com/mail/u/0/');
        assert.equal(buildUrl('gmail', 'inbox', { accountIndex: 2 }), 'https://mail.google.com/mail/u/2/');
        assert.equal(buildUrl('outlook', 'inbox', { accountIndex: 1 }), 'https://outlook.live.com/mail/1/');
    });

    it('ignores the index for providers that do not address accounts', () => {
        assert.equal(buildUrl('icloud', 'inbox', { accountIndex: 5 }), 'https://www.icloud.com/mail');
        assert.equal(buildUrl('outlook365', 'inbox', { accountIndex: 3 }), 'https://outlook.office.com/mail/');
    });

    it('substitutes every occurrence of {i}, not just the first', () => {
        // The Outlook compose bug was an index that appeared twice; a
        // single-shot .replace() would leave the second one literal.
        for (const p of PROVIDERS) {
            for (const kind of destinations(p.id)) {
                const url = buildUrl(p.id, kind, { accountIndex: 7, query: 'x' });
                assert.ok(url && !url.includes('{i}'), `${p.id}.${kind} left an {i}`);
            }
        }
    });

    it('returns null for an unknown kind — NOT the inbox', () => {
        // Behaviour change from v1: the old fallback made a typo'd kind open
        // the inbox silently.
        assert.equal(buildUrl('gmail', 'garbage'), null);
        assert.equal(buildUrl('gmail', ''), null);
        assert.equal(buildUrl('gmail', undefined), null);
        assert.equal(buildUrl('gmail', '__proto__'), null);
        assert.notEqual(buildUrl('gmail', 'garbage'), buildUrl('gmail', 'inbox'));
    });

    it('a stale positional call is inert rather than silently wrong', () => {
        // Old signature was buildUrl(id, accountIndex, kind). A missed call
        // site passes a number where the kind goes; that must open nothing.
        assert.equal(buildUrl('gmail', 0, 'inbox'), null);
        assert.equal(buildUrl('gmail', 2, 'compose'), null);
    });

    it('returns null for an unknown provider', () => {
        for (const bad of HOSTILE) {
            assert.equal(buildUrl(bad, 'inbox'), null, JSON.stringify(bad));
        }
    });

    it('every provider x kind x hostile index stays on its own origin', () => {
        const indexes = [0, 1, 9, -1, 4.7, NaN, Infinity, '3', '', null, undefined,
            'javascript:alert(1)', '../../evil', 1e30];

        for (const p of PROVIDERS) {
            for (const kind of destinations(p.id)) {
                const template = p.dest[kind];
                const cut = template.search(/\{[iq]\}/);
                const prefix = cut === -1 ? template : template.slice(0, cut);
                const expectedOrigin = new URL(template.replace(/\{[iq]\}/g, '0')).origin;

                for (const idx of indexes) {
                    const url = buildUrl(p.id, kind, { accountIndex: idx, query: 'q' });
                    assert.ok(url, `${p.id}.${kind} @ ${String(idx)} produced null`);
                    assert.match(url, /^https:\/\//, `${p.id}.${kind} scheme`);
                    assert.ok(url.startsWith(prefix), `${p.id}.${kind} left its prefix`);
                    assert.equal(new URL(url).origin, expectedOrigin, `${p.id}.${kind} origin moved`);
                    assert.ok(!url.includes('{i}') && !url.includes('{q}'),
                        `${p.id}.${kind} unsubstituted placeholder`);
                }
            }
        }
    });
});

describe('searchUrl', () => {
    it('builds a Gmail search', () => {
        assert.equal(
            searchUrl('gmail', 'invoice', 1),
            'https://mail.google.com/mail/u/1/#search/invoice',
        );
    });

    it('returns null for a provider that declares no search', () => {
        for (const p of PROVIDERS) {
            if (supports(p.id, 'search')) continue;
            assert.equal(searchUrl(p.id, 'x', 0), null, p.id);
        }
    });

    it('refuses an empty or whitespace query rather than opening an empty result page', () => {
        for (const q of ['', '   ', '\t\n', null, undefined, 0, {}, []]) {
            assert.equal(searchUrl('gmail', q, 0), null, JSON.stringify(q));
        }
    });

    it('encodes so a query cannot escape its fragment', () => {
        const cases = {
            'a/b': '%2F',
            'a#b': '%23',
            'a?b': '%3F',
            'a&b': '%26',
            'a b': '%20',
        };
        for (const [q, encoded] of Object.entries(cases)) {
            const url = searchUrl('gmail', q, 0);
            assert.ok(url.includes(encoded), `${q} -> ${url}`);
        }
    });

    it('a javascript: query stays inert data inside the URL', () => {
        const url = searchUrl('gmail', 'javascript:alert(1)', 0);
        assert.match(url, /^https:\/\/mail\.google\.com\/mail\/u\/0\/#search\//);
        assert.equal(new URL(url).protocol, 'https:');
        // The colon and parens are encoded, so nothing reads as a scheme.
        assert.ok(!url.includes('javascript:'));
    });

    it('trims but preserves the query otherwise', () => {
        assert.equal(searchUrl('gmail', '  hello  ', 0),
            'https://mail.google.com/mail/u/0/#search/hello');
    });
});

describe('searchableProviders', () => {
    it('lists exactly the providers that declare a search route', () => {
        const listed = searchableProviders();
        for (const p of PROVIDERS) {
            assert.equal(listed.includes(p.id), supports(p.id, 'search'), p.id);
        }
    });

    it('Outlook has no search route, and that is settled rather than pending', () => {
        // Microsoft's own Q&A: OWA search is an AJAX POST, so the query never
        // enters the URL and outlook.office.com/mail/?query=... cannot work.
        // See DESTINATIONS.md. If anyone "fixes" this by inventing a template,
        // this is the test that stops it.
        assert.equal(supports('outlook', 'search'), false);
        assert.equal(supports('outlook365', 'search'), false);
        assert.equal(searchUrl('outlook', 'x', 0), null);
        assert.equal(searchUrl('outlook365', 'x', 0), null);
    });

    it('covers Gmail, Yahoo and AOL', () => {
        // Anti-vacuity: an empty list would make the first test pass trivially.
        const listed = searchableProviders();
        assert.ok(listed.length >= 3, `only ${listed.length} searchable`);
        for (const id of ['gmail', 'yahoo', 'aol']) {
            assert.ok(listed.includes(id), `${id} should be searchable`);
        }
    });

    it('Yahoo and AOL share one client, so their routes share one shape', () => {
        assert.equal(searchUrl('yahoo', 'receipt', 0),
            'https://mail.yahoo.com/d/search/keyword=receipt');
        assert.equal(searchUrl('aol', 'receipt', 0),
            'https://mail.aol.com/d/search/keyword=receipt');
    });
});

describe('normalizeAccountIndex', () => {
    it('clamps to [0, MAX]', () => {
        assert.equal(normalizeAccountIndex(-3), 0);
        assert.equal(normalizeAccountIndex(0), 0);
        assert.equal(normalizeAccountIndex(4), 4);
        assert.equal(normalizeAccountIndex(99), MAX_ACCOUNT_INDEX);
        assert.equal(normalizeAccountIndex(4.9), 4);
    });

    it('falls back to 0 for anything non-finite', () => {
        for (const bad of [NaN, Infinity, -Infinity, 'x', null, undefined, {}, []]) {
            assert.equal(normalizeAccountIndex(bad), 0, JSON.stringify(bad));
        }
    });
});

describe('supportsAccountIndex', () => {
    it('matches the table', () => {
        assert.equal(supportsAccountIndex('gmail'), true);
        assert.equal(supportsAccountIndex('outlook'), true);
        assert.equal(supportsAccountIndex('proton'), true);
        assert.equal(supportsAccountIndex('icloud'), false);
        assert.equal(supportsAccountIndex('outlook365'), false);
        assert.equal(supportsAccountIndex('nope'), false);
    });
});
