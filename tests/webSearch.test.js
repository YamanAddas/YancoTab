/**
 * Chrome Web Store compliance: web search must use the user's Chrome
 * default search engine via the Chrome Search API (Single Purpose policy,
 * warning "Red Argon", 2026-11-03). See docs/adr/0001-chrome-search-permission.md.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  runWebSearch,
  usesBrowserDefaultSearch,
  webSearchLabel,
} from '../os/services/webSearch.js';

const ROOT = new URL('..', import.meta.url).pathname;

function fakeChromeEnv({ fail = false } = {}) {
  const calls = [];
  const opened = [];
  const env = {
    chrome: {
      search: {
        query: async (info) => {
          calls.push(info);
          if (fail) throw new Error('boom');
        },
      },
    },
    open: (u) => opened.push(u),
  };
  return { env, calls, opened };
}

describe('runWebSearch', () => {
  test('extension: sends the text to chrome.search.query in a new tab', async () => {
    const { env, calls, opened } = fakeChromeEnv();
    const ok = await runWebSearch('  black holes  ', { env });
    assert.equal(ok, true);
    assert.deepEqual(calls, [{ text: 'black holes', disposition: 'NEW_TAB' }]);
    assert.equal(opened.length, 0, 'must not open any engine URL itself');
  });

  test('extension: a failing chrome.search.query never falls back to an engine URL', async () => {
    const { env, opened } = fakeChromeEnv({ fail: true });
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const ok = await runWebSearch('x', { env });
      assert.equal(ok, false);
    } finally {
      console.warn = origWarn;
    }
    assert.equal(opened.length, 0);
  });

  test('empty query does nothing', async () => {
    const { env, calls, opened } = fakeChromeEnv();
    assert.equal(await runWebSearch('   ', { env }), false);
    assert.equal(calls.length + opened.length, 0);
  });

  test('standalone (no chrome.search): opens one plain search URL', async () => {
    const opened = [];
    const ok = await runWebSearch('a&b', { env: {}, openUrl: (u) => opened.push(u) });
    assert.equal(ok, true);
    assert.equal(opened.length, 1);
    assert.ok(opened[0].endsWith('a%26b'));
  });

  test('usesBrowserDefaultSearch reflects chrome.search availability', () => {
    assert.equal(usesBrowserDefaultSearch(fakeChromeEnv().env), true);
    assert.equal(usesBrowserDefaultSearch({}), false);
    assert.equal(usesBrowserDefaultSearch({ chrome: {} }), false);
  });

  test('label never names a search engine', () => {
    assert.doesNotMatch(webSearchLabel('cats'), /google|bing|duck/i);
  });
});

describe('manifest + source guard', () => {
  test('manifest declares the search permission and no search override', () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok(m.permissions.includes('search'));
    assert.equal(m.chrome_settings_overrides, undefined);
  });

  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith('.js')) out.push(p);
    }
    return out;
  }

  test('no code outside webSearch.js builds an engine search URL', () => {
    const ENGINE_URL = /google\.[a-z.]+\/search\?|duckduckgo\.com\/\?q=|bing\.com\/search\?/i;
    const offenders = walk(join(ROOT, 'os'))
      .filter((p) => !p.endsWith(join('services', 'webSearch.js')))
      .filter((p) => ENGINE_URL.test(readFileSync(p, 'utf8')))
      .map((p) => relative(ROOT, p));
    assert.deepEqual(offenders, []);
  });

  test('no UI reads the legacy engine preference', () => {
    const offenders = walk(join(ROOT, 'os'))
      .filter((p) => !p.endsWith(join('services', 'appStorage.js')))
      .filter((p) => /yancotabSearchEngine/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(ROOT, p));
    assert.deepEqual(offenders, []);
  });
});
