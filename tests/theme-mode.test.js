/**
 * Tests for os/theme/theme.js — getStoredMode + getThemeMode resolution
 * Run with: node --test tests/theme-mode.test.js
 *
 * Mocks localStorage and matchMedia in globalThis since theme.js relies
 * on browser globals. Resets between tests to avoid leakage.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Browser-global mocks ───
function makeFakeStorage() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        clear: () => map.clear(),
        get length() { return map.size; },
    };
}

function makeFakeMatchMedia(prefersLight) {
    return (query) => ({
        matches: query === '(prefers-color-scheme: light)' ? prefersLight : !prefersLight,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
    });
}

// Set up globals before importing the module
globalThis.localStorage = makeFakeStorage();
globalThis.window = {
    matchMedia: makeFakeMatchMedia(false),
    dispatchEvent: () => true,
    CustomEvent: class { constructor(name, init) { this.type = name; this.detail = init?.detail; } },
};
globalThis.document = {
    body: { classList: { toggle: () => {} } },
    documentElement: { style: {} },
};

// Import AFTER globals are set
const { getStoredMode, getThemeMode } = await import('../os/theme/theme.js');

// ─── Tests ───

describe('getStoredMode — explicit choices', () => {
    beforeEach(() => globalThis.localStorage.clear());

    test('returns "dark" for explicit dark in primary key', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'dark');
        assert.equal(getStoredMode(), 'dark');
    });

    test('returns "light" for explicit light in primary key', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'light');
        assert.equal(getStoredMode(), 'light');
    });

    test('returns "auto" for explicit auto', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'auto');
        assert.equal(getStoredMode(), 'auto');
    });

    test('returns null when nothing stored', () => {
        assert.equal(getStoredMode(), null);
    });

    test('ignores unknown values', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'sepia');
        assert.equal(getStoredMode(), null);
    });
});

describe('getStoredMode — legacy fallback', () => {
    beforeEach(() => globalThis.localStorage.clear());

    test('reads legacy yancotab_theme=dark', () => {
        globalThis.localStorage.setItem('yancotab_theme', 'dark');
        assert.equal(getStoredMode(), 'dark');
    });

    test('reads legacy yancotab_theme=light', () => {
        globalThis.localStorage.setItem('yancotab_theme', 'light');
        assert.equal(getStoredMode(), 'light');
    });

    test('reads legacy yancotab_theme_dark=true → dark', () => {
        globalThis.localStorage.setItem('yancotab_theme_dark', 'true');
        assert.equal(getStoredMode(), 'dark');
    });

    test('reads legacy yancotab_theme_dark=false → light', () => {
        globalThis.localStorage.setItem('yancotab_theme_dark', 'false');
        assert.equal(getStoredMode(), 'light');
    });

    test('primary key takes precedence over legacy', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'light');
        globalThis.localStorage.setItem('yancotab_theme', 'dark');
        globalThis.localStorage.setItem('yancotab_theme_dark', 'true');
        assert.equal(getStoredMode(), 'light');
    });
});

describe('getThemeMode — resolves auto + null to OS preference', () => {
    beforeEach(() => globalThis.localStorage.clear());

    test('null + OS=light → "light"', () => {
        globalThis.window.matchMedia = makeFakeMatchMedia(true);
        assert.equal(getThemeMode(), 'light');
    });

    test('null + OS=dark → "dark"', () => {
        globalThis.window.matchMedia = makeFakeMatchMedia(false);
        assert.equal(getThemeMode(), 'dark');
    });

    test('"auto" + OS=light → "light"', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'auto');
        globalThis.window.matchMedia = makeFakeMatchMedia(true);
        assert.equal(getThemeMode(), 'light');
    });

    test('"auto" + OS=dark → "dark"', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'auto');
        globalThis.window.matchMedia = makeFakeMatchMedia(false);
        assert.equal(getThemeMode(), 'dark');
    });

    test('explicit "dark" overrides OS=light', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'dark');
        globalThis.window.matchMedia = makeFakeMatchMedia(true);
        assert.equal(getThemeMode(), 'dark');
    });

    test('explicit "light" overrides OS=dark', () => {
        globalThis.localStorage.setItem('yancotab_theme_mode', 'light');
        globalThis.window.matchMedia = makeFakeMatchMedia(false);
        assert.equal(getThemeMode(), 'light');
    });
});
