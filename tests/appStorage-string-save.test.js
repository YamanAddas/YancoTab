/**
 * Regression test for AppStorage.normalize string handling.
 *
 * The bug: normalize() called JSON.parse() on every string input. For
 * raw scalar values like 'duck' (search engine) or 'auto' (theme mode),
 * JSON.parse('duck') threw and the function returned the registry
 * default. Effect: every string-typed preference save() silently
 * dropped the user's input and persisted the default instead.
 *
 * Fix: on JSON.parse failure, treat the string AS the value.
 *
 * This regression matters because a CWS reviewer flipping the theme
 * to 'light' would see the toggle move but the next page reload would
 * snap it back to 'dark' — looks like a broken extension.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Stub localStorage for the AppStorage module load.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

// _emit() dispatches a CustomEvent on window — stub for node.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
}

const { AppStorage } = await import('../os/services/appStorage.js');

function freshStorage() {
  globalThis.localStorage.clear();
  return new AppStorage();
}

describe('AppStorage.save — string-typed preferences', () => {
  test("yancotabSearchEngine accepts 'duck' (was silently reverted to 'google')", () => {
    const s = freshStorage();
    s.save('yancotabSearchEngine', 'duck');
    assert.equal(s.load('yancotabSearchEngine'), 'duck');
  });

  test("yancotabSearchEngine accepts 'bing'", () => {
    const s = freshStorage();
    s.save('yancotabSearchEngine', 'bing');
    assert.equal(s.load('yancotabSearchEngine'), 'bing');
  });

  test("yancotab_theme_mode round-trips 'dark', 'light', 'auto'", () => {
    const s = freshStorage();
    for (const mode of ['dark', 'light', 'auto']) {
      s.save('yancotab_theme_mode', mode);
      assert.equal(s.load('yancotab_theme_mode'), mode);
    }
  });

  test('normalize still rejects values that fail validate()', () => {
    const s = freshStorage();
    // 'banana' is not in the searchEngine allowlist — validator should
    // reject and we fall back to default.
    s.save('yancotabSearchEngine', 'banana');
    assert.equal(s.load('yancotabSearchEngine'), 'google');
  });

  test('JSON-stringified strings still parse correctly', () => {
    const s = freshStorage();
    // If a caller passed JSON.stringify('duck') = '"duck"', that should
    // still land as 'duck' (the JSON.parse path still works).
    s.save('yancotabSearchEngine', '"duck"');
    assert.equal(s.load('yancotabSearchEngine'), 'duck');
  });
});
