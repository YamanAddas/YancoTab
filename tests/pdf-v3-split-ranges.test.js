/**
 * Tests for os/apps/pdf/v3/ops/split.js range parser.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRanges, totalParsedPages } from '../os/apps/pdf/v3/ops/split.js';

describe('parseRanges', () => {
  it('returns [] for non-string input', () => {
    assert.deepEqual(parseRanges(null, 10), []);
    assert.deepEqual(parseRanges(123, 10), []);
  });

  it('returns [] for non-finite totalPages', () => {
    assert.deepEqual(parseRanges('1-5', NaN), []);
    assert.deepEqual(parseRanges('1-5', 0), []);
  });

  it('parses a single page', () => {
    assert.deepEqual(parseRanges('5', 10), [{ label: '5', pages: [5] }]);
  });

  it('parses a single range', () => {
    assert.deepEqual(parseRanges('2-4', 10), [{ label: '2-4', pages: [2, 3, 4] }]);
  });

  it('parses comma-separated mix', () => {
    const r = parseRanges('1, 3-4, 9', 10);
    assert.deepEqual(r, [
      { label: '1', pages: [1] },
      { label: '3-4', pages: [3, 4] },
      { label: '9', pages: [9] },
    ]);
  });

  it('tolerates whitespace', () => {
    const r = parseRanges('  1 ,  3 - 4  ', 10);
    assert.equal(r.length, 2);
    assert.deepEqual(r[1].pages, [3, 4]);
  });

  it('swaps reversed ranges', () => {
    assert.deepEqual(parseRanges('5-2', 10), [{ label: '2-5', pages: [2, 3, 4, 5] }]);
  });

  it('clamps to totalPages', () => {
    const r = parseRanges('1-50', 10);
    assert.deepEqual(r[0].pages, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(r[0].label, '1-10');
  });

  it('drops pages out of range entirely', () => {
    assert.deepEqual(parseRanges('20', 10), []);
    assert.deepEqual(parseRanges('0', 10), []);
  });

  it('drops a fully-out-of-range hyphen segment', () => {
    assert.deepEqual(parseRanges('15-20', 10), []);
  });

  it('skips malformed segments', () => {
    const r = parseRanges('abc, 1, ?, 2-3', 10);
    assert.equal(r.length, 2);
    assert.deepEqual(r[0].pages, [1]);
    assert.deepEqual(r[1].pages, [2, 3]);
  });

  it('caps at MAX_RANGES (50)', () => {
    const segs = Array.from({ length: 60 }, (_, i) => String(i + 1)).join(',');
    const r = parseRanges(segs, 100);
    assert.equal(r.length, 50);
  });

  it('totalParsedPages sums correctly', () => {
    const r = parseRanges('1-3, 5, 7-9', 20);
    assert.equal(totalParsedPages(r), 7);
  });

  it('totalParsedPages handles empty + non-array', () => {
    assert.equal(totalParsedPages([]), 0);
    assert.equal(totalParsedPages(null), 0);
    assert.equal(totalParsedPages(undefined), 0);
  });
});
