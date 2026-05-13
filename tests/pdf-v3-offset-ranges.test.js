/**
 * Tests for pdf/v3/select/offsetRanges.js — pure span-coord algebra.
 *
 * Covers the algorithmic core that converts between "user selection in
 * flat coords" and "which span(s) does the selection touch, at what
 * within-span offsets." DOM-coupled adapters (offsetsFromRange,
 * rangeFromOffsets, segmentation rendering) aren't unit-tested here —
 * they require a real TextLayer DOM and land in Phase B integration tests.
 *
 * The pure functions tested here are the load-bearing pieces:
 *   - offsetsFromSpanCoords  — (which span + char-in-span) → flat offsets
 *   - spanCoordsFromOffsets  — flat offsets → (which span + char-in-span)
 *   - segmentByOffsets       — split a multi-span range into per-span <mark> pieces
 *
 * Why this matters: every highlight ever stored or rendered will pass
 * through these functions. A bug here makes selection feel broken in
 * ways no UI test will catch quickly.
 *
 * Run with: node --test tests/pdf-v3-offset-ranges.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildPageTextIndex } from '../os/apps/pdf/v3/select/pageTextIndex.js';
import {
  offsetsFromSpanCoords,
  spanCoordsFromOffsets,
  segmentByOffsets,
} from '../os/apps/pdf/v3/select/offsetRanges.js';

// ── Fixture helpers ────────────────────────────────────────────────────

function tc(items) {
  return {
    items: items.map((it) =>
      typeof it === 'string'
        ? { str: it, hasEOL: false }
        : { str: it.str || '', hasEOL: !!it.eol }
    ),
  };
}

// ── offsetsFromSpanCoords ──────────────────────────────────────────────

describe('offsetsFromSpanCoords — pure conversion', () => {
  test('simple selection within one span', () => {
    const idx = buildPageTextIndex(tc(['Hello world']));
    // Select "ello" (chars 1..5)
    const result = offsetsFromSpanCoords(idx, {
      startSpanIdx: 0, startCharInSpan: 1,
      endSpanIdx: 0,   endCharInSpan: 5,
    });
    assert.deepEqual(result, { charStart: 1, charEnd: 5 });
  });

  test('selection spanning two adjacent spans', () => {
    const idx = buildPageTextIndex(tc(['Hello ', 'world']));
    // flat = "Hello world", select "lo w" (chars 3..7)
    const result = offsetsFromSpanCoords(idx, {
      startSpanIdx: 0, startCharInSpan: 3,
      endSpanIdx: 1,   endCharInSpan: 1,
    });
    assert.deepEqual(result, { charStart: 3, charEnd: 7 });
  });

  test('selection across hyphen-elided span', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'care-', eol: true },
      { str: 'ful', eol: false },
    ]));
    // flat = "careful", select "are" inside the first span (chars 1..4)
    const result = offsetsFromSpanCoords(idx, {
      startSpanIdx: 0, startCharInSpan: 1,
      endSpanIdx: 0,   endCharInSpan: 4,
    });
    assert.deepEqual(result, { charStart: 1, charEnd: 4 });
  });

  test('selection that includes the elided hyphen position clamps to flatEnd', () => {
    // User selected up through the position where '-' was rendered.
    // We want the flat range to stop at the joined character (flatEnd).
    const idx = buildPageTextIndex(tc([
      { str: 'care-', eol: true },     // flatStart=0, flatEnd=4, hadHyphen=true
      { str: 'ful', eol: false },      // flatStart=4, flatEnd=7
    ]));
    // Select "care-" entirely (including DOM hyphen): startCharInSpan=0,
    // endCharInSpan=5 (one past the raw text length minus null terminator).
    const result = offsetsFromSpanCoords(idx, {
      startSpanIdx: 0, startCharInSpan: 0,
      endSpanIdx: 0,   endCharInSpan: 5,
    });
    // The hyphen has no flat home; the range ends at span[0].flatEnd = 4.
    assert.deepEqual(result, { charStart: 0, charEnd: 4 });
  });

  test('reversed selection (start > end) gets normalized', () => {
    const idx = buildPageTextIndex(tc(['Hello']));
    const result = offsetsFromSpanCoords(idx, {
      startSpanIdx: 0, startCharInSpan: 4,
      endSpanIdx: 0,   endCharInSpan: 1,
    });
    assert.deepEqual(result, { charStart: 1, charEnd: 4 });
  });

  test('invalid coords return null', () => {
    const idx = buildPageTextIndex(tc(['Hi']));
    assert.equal(offsetsFromSpanCoords(idx, {
      startSpanIdx: 99, startCharInSpan: 0,
      endSpanIdx: 0, endCharInSpan: 0,
    }), null);
    assert.equal(offsetsFromSpanCoords(null, {
      startSpanIdx: 0, startCharInSpan: 0,
      endSpanIdx: 0, endCharInSpan: 0,
    }), null);
    assert.equal(offsetsFromSpanCoords(idx, null), null);
  });
});

// ── spanCoordsFromOffsets ──────────────────────────────────────────────

describe('spanCoordsFromOffsets — inverse conversion', () => {
  test('selection within one span', () => {
    const idx = buildPageTextIndex(tc(['Hello world']));
    const result = spanCoordsFromOffsets(idx, 1, 5);
    assert.deepEqual(result, {
      startSpanIdx: 0, startCharInSpan: 1,
      endSpanIdx: 0,   endCharInSpan: 5,
    });
  });

  test('selection spanning two adjacent spans', () => {
    const idx = buildPageTextIndex(tc(['Hello ', 'world']));
    // flat = "Hello world", offsets 3..7 = "lo w"
    const result = spanCoordsFromOffsets(idx, 3, 7);
    assert.deepEqual(result, {
      startSpanIdx: 0, startCharInSpan: 3,
      endSpanIdx: 1,   endCharInSpan: 1,
    });
  });

  test('end at a span boundary maps to closing span', () => {
    const idx = buildPageTextIndex(tc(['abc', 'def']));
    // flat = "abcdef", end at offset 3 = end of span 0 (not start of span 1).
    const result = spanCoordsFromOffsets(idx, 0, 3);
    assert.equal(result.endSpanIdx, 0);
    assert.equal(result.endCharInSpan, 3);
  });

  test('start at a span boundary maps to opening span', () => {
    const idx = buildPageTextIndex(tc(['abc', 'def']));
    // flat = "abcdef", start at offset 3 = beginning of span 1.
    const result = spanCoordsFromOffsets(idx, 3, 5);
    assert.equal(result.startSpanIdx, 1);
    assert.equal(result.startCharInSpan, 0);
  });

  test('range that lands in a synthetic-space gap returns null', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'first', eol: true },     // flat 0..5
      { str: 'second', eol: false },   // flat 6..12 (with synth space at 5)
    ]));
    // Offset 5 is the synthetic space — start mode can't land there.
    const result = spanCoordsFromOffsets(idx, 5, 10);
    // findSpanIdxForOffset returns -1 for the gap with 'start' mode.
    assert.equal(result, null);
  });

  test('negative or non-finite offsets return null', () => {
    const idx = buildPageTextIndex(tc(['Hi']));
    assert.equal(spanCoordsFromOffsets(idx, -1, 1), null);
    assert.equal(spanCoordsFromOffsets(idx, 0, Number.NaN), null);
    assert.equal(spanCoordsFromOffsets(idx, Infinity, 1), null);
  });
});

// ── offsetsFromSpanCoords ↔ spanCoordsFromOffsets round-trip ───────────

describe('span coords ↔ flat offsets round-trip', () => {
  test('every position inside a multi-span fixture survives the round-trip', () => {
    const idx = buildPageTextIndex(tc([
      'The ',
      { str: 'quick brown fox', eol: true },
      'jumps over',
    ]));
    // flat = "The quick brown fox jumps over"
    //         0123456789012345678901234567890
    //                   1111111111222222222233
    assert.equal(idx.flat, 'The quick brown fox jumps over');

    // Round-trip every {start, end} pair where the offsets land in real spans.
    // Skip the synthetic-space position between span[1] and span[2] (offset 19).
    const skipOffsets = new Set([19]);
    for (let lo = 0; lo <= idx.flat.length; lo++) {
      if (skipOffsets.has(lo)) continue;
      for (let hi = lo; hi <= idx.flat.length; hi++) {
        if (skipOffsets.has(hi) && hi !== lo) continue;
        const coords = spanCoordsFromOffsets(idx, lo, hi);
        if (!coords) continue;
        const back = offsetsFromSpanCoords(idx, coords);
        if (!back) continue;
        assert.equal(back.charStart, lo, `lo=${lo} hi=${hi} round-trip lost charStart`);
        assert.equal(back.charEnd, hi, `lo=${lo} hi=${hi} round-trip lost charEnd`);
      }
    }
  });

  test('round-trip across a hyphen-elided span preserves offsets', () => {
    const idx = buildPageTextIndex(tc([
      'The ',
      { str: 'inter-', eol: true },
      { str: 'esting word', eol: false },
    ]));
    // flat = "The interesting word"  (length 20)
    assert.equal(idx.flat, 'The interesting word');
    for (let lo = 0; lo <= 20; lo++) {
      for (let hi = lo; hi <= 20; hi++) {
        const coords = spanCoordsFromOffsets(idx, lo, hi);
        if (!coords) continue;
        const back = offsetsFromSpanCoords(idx, coords);
        assert.equal(back.charStart, lo);
        assert.equal(back.charEnd, hi);
      }
    }
  });
});

// ── segmentByOffsets ───────────────────────────────────────────────────

describe('segmentByOffsets — split multi-span range for rendering', () => {
  test('range inside one span emits one segment', () => {
    const idx = buildPageTextIndex(tc(['Hello world']));
    const segs = segmentByOffsets(idx, 1, 5);
    assert.deepEqual(segs, [
      { spanIdx: 0, startInSpan: 1, endInSpan: 5 },
    ]);
  });

  test('range spanning two adjacent spans emits two segments', () => {
    const idx = buildPageTextIndex(tc(['abc', 'def']));
    // flat = "abcdef", select "bcde" (1..5)
    const segs = segmentByOffsets(idx, 1, 5);
    assert.deepEqual(segs, [
      { spanIdx: 0, startInSpan: 1, endInSpan: 3 },
      { spanIdx: 1, startInSpan: 0, endInSpan: 2 },
    ]);
  });

  test('range covering three spans emits three segments', () => {
    const idx = buildPageTextIndex(tc(['abc', 'def', 'ghi']));
    // flat = "abcdefghi"
    const segs = segmentByOffsets(idx, 2, 8);
    assert.deepEqual(segs, [
      { spanIdx: 0, startInSpan: 2, endInSpan: 3 },
      { spanIdx: 1, startInSpan: 0, endInSpan: 3 },
      { spanIdx: 2, startInSpan: 0, endInSpan: 2 },
    ]);
  });

  test('zero-width range emits no segments', () => {
    const idx = buildPageTextIndex(tc(['Hello']));
    assert.deepEqual(segmentByOffsets(idx, 2, 2), []);
  });

  test('reversed range produces normalized segments', () => {
    const idx = buildPageTextIndex(tc(['Hello']));
    const a = segmentByOffsets(idx, 1, 4);
    const b = segmentByOffsets(idx, 4, 1);
    assert.deepEqual(a, b);
  });

  test('hyphen-elided span gets a single segment for its flat slice', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'inter-', eol: true },    // flat 0..5
      { str: 'esting', eol: false },   // flat 5..11
    ]));
    // Highlight the whole word "interesting" = flat 0..11.
    const segs = segmentByOffsets(idx, 0, 11);
    assert.deepEqual(segs, [
      { spanIdx: 0, startInSpan: 0, endInSpan: 5 },
      { spanIdx: 1, startInSpan: 0, endInSpan: 6 },
    ]);
    // Note: span 0's endInSpan is 5 (the flat-length), not 6 (rawLength).
    // The rendered <span> shows "inter-", and the renderer will wrap only
    // the first 5 chars (everything up to but not including the hyphen).
  });

  test('range that hits a synthetic-space gap skips it', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'one', eol: true },        // flat 0..3
      { str: 'two', eol: false },       // flat 4..7 (synth space at 3)
    ]));
    // flat = "one two", select "ne tw" = offsets 1..6.
    const segs = segmentByOffsets(idx, 1, 6);
    assert.deepEqual(segs, [
      { spanIdx: 0, startInSpan: 1, endInSpan: 3 },
      { spanIdx: 1, startInSpan: 0, endInSpan: 2 },
    ]);
    // The synthetic space at flat position 3 doesn't get its own segment.
  });

  test('empty index produces no segments', () => {
    const idx = buildPageTextIndex({ items: [] });
    assert.deepEqual(segmentByOffsets(idx, 0, 5), []);
  });
});
