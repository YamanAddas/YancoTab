/**
 * Tests for os/apps/pdf/library/libraryReducer.js
 * Pure filter / sort / search / format helpers — no DOM, no IDB.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    selectVisibleDocs,
    matchesQuery,
    progressFraction,
    formatBytes,
    formatRelativeTime,
    FILTERS, SORTS, VIEW_MODES,
} from '../os/apps/pdf/library/libraryReducer.js';

const T = (y, m, d, h = 12) => new Date(y, m, d, h, 0, 0).getTime();

const docs = [
    { id: 'a', name: 'Cosmic Klondike Strategy.pdf', sizeBytes: 2_500_000,  importedAt: T(2026, 4, 1),  pageCount: 108 },
    { id: 'b', name: 'Snow Crash.pdf',                 sizeBytes: 4_000_000,  importedAt: T(2026, 4, 2),  pageCount: 470 },
    { id: 'c', name: 'ICRP-103.pdf',                   sizeBytes: 12_000_000, importedAt: T(2026, 4, 3),  pageCount: 96 },
    { id: 'd', name: 'thesis.pdf',                     sizeBytes: 800_000,    importedAt: T(2025, 11, 1), pageCount: 210 },
    { id: 'e', name: 'tagged.pdf',                     sizeBytes: 100_000,    importedAt: T(2026, 4, 5),  pageCount: 30, tags: ['research', 'physics'] },
];

const NOW = T(2026, 4, 10);
const viewStates = {
    a: { lastOpenedAt: T(2026, 4, 9), page: 12 },
    b: { lastOpenedAt: T(2026, 4, 1), page: 1 },
    c: { lastOpenedAt: T(2026, 4, 5), page: 4 },
    // d: never opened
    e: { lastOpenedAt: T(2026, 4, 10, 11), page: 30 },  // finished, current page == total
};

describe('selectVisibleDocs — filter', () => {
    test('"all" returns every doc', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'lastOpened', now: NOW });
        assert.equal(out.length, 5);
    });

    test('"recent" cuts off at 30 days', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'recent', sort: 'lastOpened', now: NOW });
        // d has lastOpenedAt = importedAt = 2025-12-01; 30+ days ago
        const ids = out.map((d) => d.id).sort();
        assert.deepEqual(ids, ['a', 'b', 'c', 'e'].sort());
    });

    test('"reading" requires page > 1 and recent open and unfinished', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'reading', sort: 'lastOpened', now: NOW });
        const ids = out.map((d) => d.id);
        // a: page 12 of 108, recent → in
        // b: page 1, never started → out
        // c: page 4 of 96, recent → in
        // d: never opened → out
        // e: finished (page = total) → out
        assert.deepEqual(ids.sort(), ['a', 'c'].sort());
    });
});

describe('selectVisibleDocs — sort', () => {
    test('sort by name', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'name', now: NOW });
        assert.deepEqual(out.map((d) => d.id), ['a', 'c', 'b', 'e', 'd']);
    });

    test('sort by size descending', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'size', now: NOW });
        assert.deepEqual(out.map((d) => d.id), ['c', 'b', 'a', 'd', 'e']);
    });

    test('sort by lastOpened descending', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'lastOpened', now: NOW });
        // e is most recent (Apr 10 11h), a next (Apr 9), c (Apr 5), b (Apr 1), d (Dec 1)
        assert.deepEqual(out.map((d) => d.id), ['e', 'a', 'c', 'b', 'd']);
    });

    test('sort by dateAdded descending', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'dateAdded', now: NOW });
        assert.deepEqual(out.map((d) => d.id), ['e', 'c', 'b', 'a', 'd']);
    });
});

describe('selectVisibleDocs — query', () => {
    test('matches doc name', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'name', query: 'snow', now: NOW });
        assert.deepEqual(out.map((d) => d.id), ['b']);
    });

    test('matches doc tag', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'name', query: 'physics', now: NOW });
        assert.deepEqual(out.map((d) => d.id), ['e']);
    });

    test('case-insensitive', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'name', query: 'KLONDIKE', now: NOW });
        assert.deepEqual(out.map((d) => d.id), ['a']);
    });

    test('empty query passes through', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'name', query: '', now: NOW });
        assert.equal(out.length, 5);
    });
});

describe('selectVisibleDocs — derived fields', () => {
    test('attaches lastOpenedAt fallback to importedAt when no view state', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'lastOpened', now: NOW });
        const d = out.find((x) => x.id === 'd');
        assert.equal(d.lastOpenedAt, T(2025, 11, 1));
    });

    test('attaches progress fraction', () => {
        const out = selectVisibleDocs(docs, viewStates, { filter: 'all', sort: 'name', now: NOW });
        const a = out.find((x) => x.id === 'a');
        assert.ok(a.progress > 0.1 && a.progress < 0.2);
        const e = out.find((x) => x.id === 'e');
        assert.equal(e.progress, 1);
    });
});

describe('matchesQuery', () => {
    test('returns true on empty query', () => {
        assert.equal(matchesQuery({ name: 'x' }, ''), true);
    });
    test('returns false for non-matching name + tags', () => {
        assert.equal(matchesQuery({ name: 'foo', tags: ['x', 'y'] }, 'bar'), false);
    });
});

describe('progressFraction', () => {
    test('returns 0 when page < 1', () => assert.equal(progressFraction(0, 100), 0));
    test('returns 0 when count missing', () => assert.equal(progressFraction(5, 0), 0));
    test('clamps to 1', () => assert.equal(progressFraction(200, 100), 1));
    test('correct mid-doc', () => assert.equal(progressFraction(50, 100), 0.5));
});

describe('formatBytes', () => {
    test('< 1 KB', () => assert.equal(formatBytes(500), '500 B'));
    test('KB', () => assert.equal(formatBytes(2048), '2.0 KB'));
    test('MB', () => assert.equal(formatBytes(2_500_000), '2.4 MB'));
    test('GB', () => assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2.00 GB'));
    test('em-dash on invalid', () => assert.equal(formatBytes(NaN), '—'));
});

describe('formatRelativeTime', () => {
    test('Just now', () => assert.equal(formatRelativeTime(NOW - 30_000, NOW), 'Just now'));
    test('minutes ago', () => assert.equal(formatRelativeTime(NOW - 5 * 60_000, NOW), '5m ago'));
    test('hours ago', () => assert.equal(formatRelativeTime(NOW - 3 * 3_600_000, NOW), '3h ago'));
    test('Yesterday', () => assert.equal(formatRelativeTime(NOW - 25 * 60 * 60 * 1000, NOW), 'Yesterday'));
    test('days ago', () => assert.equal(formatRelativeTime(NOW - 4 * 24 * 60 * 60 * 1000, NOW), '4d ago'));
});

describe('exported constants', () => {
    test('FILTERS has the expected values', () => {
        assert.deepEqual([...FILTERS], ['all', 'recent', 'reading']);
    });
    test('SORTS has the expected values', () => {
        assert.deepEqual([...SORTS], ['lastOpened', 'dateAdded', 'name', 'size']);
    });
    test('VIEW_MODES has the expected values', () => {
        assert.deepEqual([...VIEW_MODES], ['grid', 'list']);
    });
});
