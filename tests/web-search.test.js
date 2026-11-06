import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runWebSearch, usesBrowserDefaultSearch, webSearchLabel } from '../os/services/webSearch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (e.name.endsWith('.js')) out.push(full);
    }
    return out;
}

describe('runWebSearch', () => {
    test('extension: sends trimmed text to chrome.search in a new tab', async () => {
        const calls = [];
        const env = { chrome: { search: { query: async (o) => { calls.push(o); } } } };
        assert.equal(await runWebSearch('  cats  ', { env }), true);
        assert.deepEqual(calls, [{ text: 'cats', disposition: 'NEW_TAB' }]);
    });

    test('empty / whitespace / nullish input starts nothing', async () => {
        const calls = [];
        const env = { chrome: { search: { query: async (o) => { calls.push(o); } } } };
        for (const q of ['', '   ', null, undefined]) assert.equal(await runWebSearch(q, { env }), false);
        assert.equal(calls.length, 0);
    });

    test('extension: a chrome.search failure does NOT fall back to a hardcoded engine', async () => {
        const opened = [];
        const env = { chrome: { search: { query: async () => { throw new Error('boom'); } } } };
        const orig = console.warn; console.warn = () => {};
        try {
            assert.equal(await runWebSearch('x', { env, openUrl: (u) => opened.push(u) }), false);
        } finally { console.warn = orig; }
        assert.deepEqual(opened, []);
    });

    test('standalone web build: falls back to a URL, query is fully encoded', async () => {
        const opened = [];
        assert.equal(await runWebSearch('a/b?c&d', { env: {}, openUrl: (u) => opened.push(u) }), true);
        assert.equal(opened.length, 1);
        assert.ok(opened[0].endsWith('a%2Fb%3Fc%26d'));
    });

    test('usesBrowserDefaultSearch reflects API presence; a stub without query() is ignored', () => {
        assert.equal(usesBrowserDefaultSearch({ chrome: { search: { query() {} } } }), true);
        assert.equal(usesBrowserDefaultSearch({ chrome: { search: {} } }), false);
        assert.equal(usesBrowserDefaultSearch({}), false);
    });

    test('label never names an engine', () => {
        assert.ok(!/google|bing|duck/i.test(webSearchLabel('q')));
    });
});

describe('Chrome Web Store single-purpose guard (Red Argon)', () => {
    test('manifest declares the search permission', () => {
        const m = JSON.parse(read('manifest.json'));
        assert.ok(m.permissions.includes('search'));
        assert.ok(m.permissions.includes('storage'));
    });

    test('privacy page discloses the search permission', () => {
        assert.match(read('privacy.html'), /<code>search<\/code>/);
    });

    test('no code outside webSearch.js hardcodes a search-engine URL', () => {
        const re = /google\.com\/search|duckduckgo\.com\/\?|bing\.com\/search|yahoo\.com\/search/;
        const offenders = walk(path.join(ROOT, 'os'))
            .filter((f) => !f.endsWith(path.join('services', 'webSearch.js')))
            .filter((f) => re.test(read(path.relative(ROOT, f))))
            .map((f) => path.relative(ROOT, f));
        assert.deepEqual(offenders, []);
    });

    test('no engine picker UI remains', () => {
        for (const f of ['os/ui/components/Onboarding.js', 'os/apps/browser/view/toolbar.js', 'os/apps/settings/BrowserSettings.js']) {
            assert.ok(!/DuckDuckGo|'duck'/.test(read(f)), f);
        }
    });
});
