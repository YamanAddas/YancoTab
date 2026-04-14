/**
 * Tests for os/utils/notes-utils.js
 * Run with: node --test tests/notes-utils.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    sanitizeTitle,
    titleFromPath,
    extractTags,
    snippet,
    formatDate,
    wordCount,
} from '../os/utils/notes-utils.js';

// ─────────────────────────────────────────────
// sanitizeTitle
// ─────────────────────────────────────────────
describe('sanitizeTitle', () => {
    test('returns Untitled for empty string', () => {
        assert.equal(sanitizeTitle(''), 'Untitled');
    });

    test('returns Untitled for whitespace-only string', () => {
        assert.equal(sanitizeTitle('   '), 'Untitled');
    });

    test('returns Untitled for null', () => {
        assert.equal(sanitizeTitle(null), 'Untitled');
    });

    test('returns Untitled for undefined', () => {
        assert.equal(sanitizeTitle(undefined), 'Untitled');
    });

    test('removes forward slash', () => {
        assert.equal(sanitizeTitle('file/name'), 'filename');
    });

    test('removes backslash', () => {
        assert.equal(sanitizeTitle('back\\slash'), 'backslash');
    });

    test('removes colon', () => {
        assert.equal(sanitizeTitle('a:b'), 'ab');
    });

    test('removes all illegal filename characters', () => {
        assert.equal(sanitizeTitle('a*b?c"d<e>f|g'), 'abcdefg');
    });

    test('normalizes multiple spaces to single space', () => {
        assert.equal(sanitizeTitle('hello   world'), 'hello world');
    });

    test('trims leading and trailing whitespace', () => {
        assert.equal(sanitizeTitle('  hello  '), 'hello');
    });

    test('preserves parentheses and numbers', () => {
        assert.equal(sanitizeTitle('My Note (2)'), 'My Note (2)');
    });

    test('preserves hyphens and underscores', () => {
        assert.equal(sanitizeTitle('my-note_draft'), 'my-note_draft');
    });
});

// ─────────────────────────────────────────────
// titleFromPath
// ─────────────────────────────────────────────
describe('titleFromPath', () => {
    test('extracts name from .txt path', () => {
        assert.equal(titleFromPath('/home/documents/My Note.txt'), 'My Note');
    });

    test('extracts name from .md path', () => {
        assert.equal(titleFromPath('/home/documents/README.md'), 'README');
    });

    test('extracts name from .json path', () => {
        assert.equal(titleFromPath('/home/documents/data.json'), 'data');
    });

    test('preserves non-note extensions as part of the title', () => {
        assert.equal(titleFromPath('/home/documents/report.pdf'), 'report.pdf');
    });

    test('returns Untitled for empty string', () => {
        assert.equal(titleFromPath(''), 'Untitled');
    });

    test('returns Untitled for null', () => {
        assert.equal(titleFromPath(null), 'Untitled');
    });

    test('handles path with no directories', () => {
        assert.equal(titleFromPath('note.txt'), 'note');
    });
});

// ─────────────────────────────────────────────
// extractTags
// ─────────────────────────────────────────────
describe('extractTags', () => {
    test('returns empty array for empty string', () => {
        assert.deepEqual(extractTags(''), []);
    });

    test('returns empty array when called with no argument', () => {
        assert.deepEqual(extractTags(), []);
    });

    test('extracts a single tag', () => {
        assert.deepEqual(extractTags('hello #world'), ['world']);
    });

    test('extracts multiple tags', () => {
        assert.deepEqual(extractTags('#alpha and #beta'), ['alpha', 'beta']);
    });

    test('ignores tags shorter than 2 characters', () => {
        assert.deepEqual(extractTags('#a is short'), []);
    });

    test('deduplicates repeated tags', () => {
        assert.deepEqual(extractTags('#foo bar #foo baz'), ['foo']);
    });

    test('limits results to 6 tags', () => {
        assert.equal(extractTags('#t1 #t2 #t3 #t4 #t5 #t6 #t7 #t8').length, 6);
    });

    test('lowercases all tags', () => {
        assert.deepEqual(extractTags('#Hello #WORLD'), ['hello', 'world']);
    });

    test('supports hyphens in tags', () => {
        assert.deepEqual(extractTags('#my-tag'), ['my-tag']);
    });

    test('supports underscores in tags', () => {
        assert.deepEqual(extractTags('#my_tag'), ['my_tag']);
    });

    test('ignores tags exceeding 32 characters', () => {
        const longTag = '#' + 'a'.repeat(33);
        assert.deepEqual(extractTags(longTag), []);
    });

    test('extracts tags at start of line', () => {
        assert.deepEqual(extractTags('#start of line'), ['start']);
    });

    test('does not extract mid-word hashes', () => {
        // e.g., a hash that's part of a word (no space before) should not match
        const result = extractTags('word#notag');
        assert.deepEqual(result, []);
    });
});

// ─────────────────────────────────────────────
// snippet
// ─────────────────────────────────────────────
describe('snippet', () => {
    test('returns "Empty document" for empty string', () => {
        assert.equal(snippet(''), 'Empty document');
    });

    test('returns "Empty document" for whitespace-only string', () => {
        assert.equal(snippet('   '), 'Empty document');
    });

    test('returns full text when within max length', () => {
        assert.equal(snippet('hello world', 120), 'hello world');
    });

    test('truncates with ellipsis when over max', () => {
        const long = 'a'.repeat(200);
        const result = snippet(long, 120);
        assert.ok(result.endsWith('\u2026'), 'should end with ellipsis character');
        assert.equal(result.length, 121); // 120 chars + '…'
    });

    test('collapses multiple whitespace to single space', () => {
        assert.equal(snippet('hello    world', 120), 'hello world');
    });

    test('collapses newlines to space', () => {
        assert.equal(snippet('line1\nline2', 120), 'line1 line2');
    });

    test('uses default max of 120', () => {
        const long = 'x'.repeat(200);
        const result = snippet(long);
        assert.ok(result.length <= 121);
        assert.ok(result.endsWith('\u2026'));
    });

    test('does not truncate text exactly at max', () => {
        const exact = 'a'.repeat(120);
        assert.equal(snippet(exact, 120), exact); // no ellipsis needed
    });
});

// ─────────────────────────────────────────────
// formatDate
// ─────────────────────────────────────────────
describe('formatDate', () => {
    const NOW = 1_000_000_000_000; // fixed reference point

    test('returns "Just now" for 0ms ago', () => {
        assert.equal(formatDate(NOW, NOW), 'Just now');
    });

    test('returns "Just now" for 30 seconds ago', () => {
        assert.equal(formatDate(NOW - 30_000, NOW), 'Just now');
    });

    test('returns "Just now" for 59 seconds ago', () => {
        assert.equal(formatDate(NOW - 59_000, NOW), 'Just now');
    });

    test('returns "1m ago" for exactly 60 seconds ago', () => {
        assert.equal(formatDate(NOW - 60_000, NOW), '1m ago');
    });

    test('returns "5m ago" for 5 minutes ago', () => {
        assert.equal(formatDate(NOW - 5 * 60_000, NOW), '5m ago');
    });

    test('returns "59m ago" for 59 minutes ago', () => {
        assert.equal(formatDate(NOW - 59 * 60_000, NOW), '59m ago');
    });

    test('returns "1h ago" for exactly 1 hour ago', () => {
        assert.equal(formatDate(NOW - 3_600_000, NOW), '1h ago');
    });

    test('returns "23h ago" for 23 hours ago', () => {
        assert.equal(formatDate(NOW - 23 * 3_600_000, NOW), '23h ago');
    });

    test('returns locale date string for 2 days ago', () => {
        const result = formatDate(NOW - 2 * 86_400_000, NOW);
        assert.ok(typeof result === 'string' && result.length > 0);
        assert.ok(!result.includes('ago'), 'should not say "ago" for old dates');
    });
});

// ─────────────────────────────────────────────
// wordCount
// ─────────────────────────────────────────────
describe('wordCount', () => {
    test('returns 0 for empty string', () => {
        assert.equal(wordCount(''), 0);
    });

    test('returns 0 for whitespace-only string', () => {
        assert.equal(wordCount('   '), 0);
    });

    test('returns 0 when called with no argument', () => {
        assert.equal(wordCount(), 0);
    });

    test('counts a single word', () => {
        assert.equal(wordCount('hello'), 1);
    });

    test('counts two words', () => {
        assert.equal(wordCount('hello world'), 2);
    });

    test('counts five words', () => {
        assert.equal(wordCount('one two three four five'), 5);
    });

    test('handles multiple spaces between words', () => {
        assert.equal(wordCount('one   two   three'), 3);
    });

    test('handles leading/trailing whitespace', () => {
        assert.equal(wordCount('  hello world  '), 2);
    });

    test('handles newlines as word separators', () => {
        assert.equal(wordCount('line1\nline2'), 2);
    });
});
