/**
 * Tests for os/apps/pdf/engine/search.js — in-doc text search.
 * Pure logic — no DOM, no pdf.js (extractText needs pdf.js but we
 * test findMatches against fabricated page strings).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildMatcher,
    findMatches,
    startCursorIndex,
    stepCursor,
    __TEST__,
} from '../os/apps/pdf/engine/search.js';

const PAGES = [
    'the quick brown fox jumps over the lazy dog',
    'pack my box with five dozen liquor jugs',
    'the FOX in the box jumps over the box again',
];

describe('buildMatcher', () => {
    test('builds case-insensitive by default', () => {
        const re = buildMatcher({ query: 'fox' });
        assert.equal(re.flags, 'gi');
    });
    test('builds case-sensitive when flag set', () => {
        const re = buildMatcher({ query: 'fox', caseSensitive: true });
        assert.equal(re.flags, 'g');
    });
    test('whole-word wraps in word boundaries', () => {
        const re = buildMatcher({ query: 'fox', wholeWord: true });
        assert.equal(re.source.startsWith('\\b'), true);
        assert.equal(re.source.endsWith('\\b'), true);
    });
    test('escapes regex special characters', () => {
        const re = buildMatcher({ query: 'a.b+c' });
        assert.equal(re.source, 'a\\.b\\+c');
    });
    test('returns null for empty query', () => {
        assert.equal(buildMatcher({ query: '' }), null);
        assert.equal(buildMatcher({ query: null }), null);
    });
});

describe('findMatches — basic', () => {
    test('finds every occurrence across pages', () => {
        const m = findMatches(PAGES, { query: 'fox' });
        assert.equal(m.length, 2);   // case-insensitive picks up "FOX" too
        assert.equal(m[0].page, 1);
        assert.equal(m[1].page, 3);
    });

    test('character offsets are correct', () => {
        const m = findMatches(['hello world hello'], { query: 'hello' });
        assert.equal(m.length, 2);
        assert.equal(m[0].start, 0);
        assert.equal(m[0].end, 5);
        assert.equal(m[1].start, 12);
        assert.equal(m[1].end, 17);
    });

    test('empty query returns no matches', () => {
        const m = findMatches(PAGES, { query: '' });
        assert.equal(m.length, 0);
    });

    test('no occurrences returns empty', () => {
        const m = findMatches(PAGES, { query: 'kangaroo' });
        assert.equal(m.length, 0);
    });
});

describe('findMatches — flags', () => {
    test('case-sensitive narrows results', () => {
        const m = findMatches(PAGES, { query: 'fox', caseSensitive: true });
        // Only the first page's 'fox' matches; 'FOX' on page 3 doesn't.
        assert.equal(m.length, 1);
        assert.equal(m[0].page, 1);
    });

    test('whole-word excludes substrings', () => {
        const corp = ['boxing matches in the box'];
        const sub = findMatches(corp, { query: 'box' });
        assert.equal(sub.length, 2);  // 'boxing' + 'box'
        const whole = findMatches(corp, { query: 'box', wholeWord: true });
        assert.equal(whole.length, 1);  // just 'box'
    });
});

describe('findMatches — limit', () => {
    test('respects custom limit', () => {
        const corp = ['x'.repeat(100).split('').join(' ')];
        const m = findMatches(corp, { query: 'x', limit: 5 });
        assert.equal(m.length, 5);
    });
    test('caps at MAX_MATCHES', () => {
        const corp = [Array(2000).fill('x').join(' ')];
        const m = findMatches(corp, { query: 'x' });
        assert.equal(m.length, __TEST__.MAX_MATCHES);
    });
});

describe('startCursorIndex', () => {
    test('returns 0 for empty matches', () => {
        assert.equal(startCursorIndex([], 5), 0);
    });
    test('finds first match at-or-after current page', () => {
        const m = [{ page: 2 }, { page: 4 }, { page: 6 }];
        assert.equal(startCursorIndex(m, 1), 0);
        assert.equal(startCursorIndex(m, 3), 1);
        assert.equal(startCursorIndex(m, 5), 2);
    });
    test('wraps to 0 when current is past last match page', () => {
        const m = [{ page: 1 }, { page: 2 }, { page: 3 }];
        assert.equal(startCursorIndex(m, 99), 0);
    });
});

describe('stepCursor', () => {
    const m = [0, 1, 2, 3].map((i) => ({ page: i + 1 }));
    test('next wraps at end', () => {
        assert.equal(stepCursor(3, m, 1), 0);
    });
    test('prev wraps at start', () => {
        assert.equal(stepCursor(0, m, -1), 3);
    });
    test('handles single-element list', () => {
        assert.equal(stepCursor(0, [{ page: 1 }], 1), 0);
    });
    test('returns 0 on empty', () => {
        assert.equal(stepCursor(5, [], 1), 0);
    });
});
