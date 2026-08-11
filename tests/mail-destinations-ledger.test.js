/**
 * mail-destinations-ledger.test.js
 *
 * Webmail deep links cannot be verified by probing — every provider 302s
 * unknown paths to its login page, and the highest-value destinations are hash
 * fragments that never reach a server at all. See DESTINATIONS.md for the
 * measurements.
 *
 * So the defence is a ledger: every shipped URL is written down with its
 * evidence, and this test makes the table and the ledger unable to drift. It
 * cannot prove a human actually looked — it converts a silent mistake into a
 * deliberate one, which is the most a test can do here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PROVIDERS, KINDS } from '../os/apps/mail/providers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(ROOT, 'os/apps/mail/DESTINATIONS.md');

/** Statuses that are allowed to ship. */
const SHIPPABLE = new Set(['verified', 'inherited', 'documented']);

function parseLedger() {
    const text = readFileSync(LEDGER, 'utf8');
    const rows = [];

    for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('|')) continue;
        const cells = t.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length !== 6) continue;
        const [provider, kind, url, status] = cells;
        // Skip the header and its separator row.
        if (provider === 'provider' || /^-+$/.test(provider)) continue;
        // Only the ledger table has a url cell wrapped in backticks; the
        // status-vocabulary and deliberately-absent tables do not, so they
        // fall out here rather than needing a section-aware parser.
        if (!url.startsWith('`') || !url.endsWith('`')) continue;
        rows.push({ provider, kind, url: url.slice(1, -1), status });
    }
    return rows;
}

describe('destination ledger', () => {
    const rows = parseLedger();

    it('parses a plausible number of rows (anti-vacuity)', () => {
        // A broken parser must fail loudly rather than pass on zero rows.
        assert.ok(rows.length >= 30, `only parsed ${rows.length} rows`);
        const kinds = new Set(rows.map(r => r.kind));
        assert.ok(kinds.size >= 4, `only ${kinds.size} distinct kinds parsed`);
        const providers = new Set(rows.map(r => r.provider));
        assert.equal(providers.size, PROVIDERS.length, 'not every provider appears');
    });

    it('every row has a shippable status', () => {
        for (const r of rows) {
            assert.ok(SHIPPABLE.has(r.status),
                `${r.provider}.${r.kind} has status "${r.status}"`);
        }
    });

    it('every row names a real provider and a real kind', () => {
        const ids = new Set(PROVIDERS.map(p => p.id));
        for (const r of rows) {
            assert.ok(ids.has(r.provider), `unknown provider "${r.provider}"`);
            assert.ok(KINDS.includes(r.kind), `unknown kind "${r.kind}"`);
        }
    });

    it('every destination in the table has a ledger row', () => {
        const byKey = new Map(rows.map(r => [`${r.provider}.${r.kind}`, r]));
        for (const p of PROVIDERS) {
            for (const kind of Object.keys(p.dest)) {
                assert.ok(byKey.has(`${p.id}.${kind}`),
                    `${p.id}.${kind} ships with no ledger row — add it to DESTINATIONS.md`);
            }
        }
    });

    it('every ledger row matches the table byte for byte', () => {
        const byId = new Map(PROVIDERS.map(p => [p.id, p]));
        for (const r of rows) {
            const tpl = byId.get(r.provider)?.dest?.[r.kind];
            assert.equal(tpl, r.url,
                `${r.provider}.${r.kind} ledger and table disagree`);
        }
    });

    it('no ledger row describes a destination the table does not ship', () => {
        const byId = new Map(PROVIDERS.map(p => [p.id, p]));
        for (const r of rows) {
            assert.ok(byId.get(r.provider)?.dest?.[r.kind],
                `${r.provider}.${r.kind} is in the ledger but not in the table`);
        }
    });

    it('records how many rows are still short of independent verification', () => {
        // Not a failure — a visible number, so it can only fall deliberately.
        // `documented` means "the provider's own address-bar route, confident,
        // not personally seen"; `inherited` means "shipped since v1.2.0,
        // never re-checked". Both are honest labels, neither is `verified`.
        const unverified = rows.filter(r => r.status !== 'verified');
        assert.ok(unverified.length <= rows.length,
            'sanity: cannot have more unverified rows than rows');
        if (unverified.length) {
            console.log(`      note: ${unverified.length}/${rows.length} destinations `
                + 'await a signed-in human (see DESTINATIONS.md)');
        }
    });
});
