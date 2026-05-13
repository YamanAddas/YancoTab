/**
 * Tests for pdf/v3/select/pageTextIndex.js
 *
 * These tests don't touch the DOM or pdf.js — they exercise the pure
 * transform from {items: [{str, hasEOL}]} to {flat, spans}.
 *
 * Why this matters: the v2 highlight pipeline failed on hyphenated line
 * breaks because the matcher couldn't reconcile "care-" + "ful" with
 * "careful". The v3 index heals these joins at index-build time so that
 * downstream offset arithmetic operates on a single coherent flat string.
 *
 * Run with: node --test tests/pdf-v3-page-text-index.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPageTextIndex,
  findSpanIdxForOffset,
  flatToSpanCoord,
  spanCoordToFlat,
  fnv32,
} from '../os/apps/pdf/v3/select/pageTextIndex.js';

// ── Fixture helpers ────────────────────────────────────────────────────

/** Build a fake pdf.js textContent shape. */
function tc(items) {
  return {
    items: items.map((it) =>
      typeof it === 'string'
        ? { str: it, hasEOL: false }
        : { str: it.str || '', hasEOL: !!it.eol }
    ),
  };
}

// ── buildPageTextIndex ─────────────────────────────────────────────────

describe('buildPageTextIndex — basic concatenation', () => {
  test('single item produces a single span', () => {
    const idx = buildPageTextIndex(tc(['Hello']));
    assert.equal(idx.flat, 'Hello');
    assert.equal(idx.spans.length, 1);
    assert.deepEqual(idx.spans[0], {
      itemIdx: 0, flatStart: 0, flatEnd: 5,
      hadHyphen: false, hasEOL: false, rawLength: 5,
    });
  });

  test('two items on same line concatenate without added space', () => {
    const idx = buildPageTextIndex(tc(['Hello ', 'world']));
    assert.equal(idx.flat, 'Hello world');
    assert.equal(idx.spans.length, 2);
    assert.equal(idx.spans[0].flatEnd, 6);
    assert.equal(idx.spans[1].flatStart, 6);
    assert.equal(idx.spans[1].flatEnd, 11);
  });

  test('empty items get zero-length span entries', () => {
    const idx = buildPageTextIndex(tc(['Hi', '', 'there']));
    assert.equal(idx.spans.length, 3);
    assert.equal(idx.spans[1].flatStart, idx.spans[1].flatEnd);
    assert.equal(idx.spans[1].rawLength, 0);
    // Middle empty item shouldn't insert a synthetic space.
    assert.equal(idx.flat, 'Hithere');
  });

  test('empty textContent input produces empty index', () => {
    assert.deepEqual(buildPageTextIndex(null), { flat: '', spans: [] });
    assert.deepEqual(buildPageTextIndex({}), { flat: '', spans: [] });
    assert.deepEqual(buildPageTextIndex({ items: [] }), { flat: '', spans: [] });
  });
});

describe('buildPageTextIndex — visual line breaks (hasEOL)', () => {
  test('EOL between items inserts a single space', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'first line', eol: true },
      { str: 'second line', eol: false },
    ]));
    assert.equal(idx.flat, 'first line second line');
    assert.equal(idx.spans[0].flatEnd, 10);
    // Synthetic space at index 10 lives BETWEEN spans, in the gap.
    assert.equal(idx.spans[1].flatStart, 11);
  });

  test('EOL with previous-ending-hyphen heals hyphenation', () => {
    // "care-" on one line, "ful" on the next, should become "careful".
    const idx = buildPageTextIndex(tc([
      { str: 'care-', eol: true },
      { str: 'ful', eol: false },
    ]));
    assert.equal(idx.flat, 'careful');
    assert.equal(idx.spans.length, 2);
    // Prev span's hyphen is no longer in flat.
    assert.equal(idx.spans[0].flatStart, 0);
    assert.equal(idx.spans[0].flatEnd, 4);
    assert.equal(idx.spans[0].hadHyphen, true);
    assert.equal(idx.spans[0].rawLength, 5);   // original "care-"
    // Next span starts immediately after, no synthetic space inserted.
    assert.equal(idx.spans[1].flatStart, 4);
    assert.equal(idx.spans[1].flatEnd, 7);
  });

  test('EOL with prev hyphen, but next item starts non-letter, does NOT heal', () => {
    // E.g. a real em-dash situation — the hyphen is meaningful, not soft.
    // Phase A's rule: only heal when the next item starts with a letter.
    const idx = buildPageTextIndex(tc([
      { str: 'one-', eol: true },
      { str: '2 three', eol: false },
    ]));
    assert.equal(idx.flat, 'one- 2 three');
    assert.equal(idx.spans[0].hadHyphen, false);
  });

  test('multiple consecutive EOLs each insert one space', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'a', eol: true },
      { str: 'b', eol: true },
      { str: 'c', eol: false },
    ]));
    assert.equal(idx.flat, 'a b c');
  });

  test('EOL followed by empty item does not insert a stray space', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'first', eol: true },
      { str: '', eol: false },
      { str: 'second', eol: false },
    ]));
    // Empty item is a span with flatStart==flatEnd; no space between first
    // and empty, second concatenates onto empty without space (since empty
    // has no hasEOL).
    assert.equal(idx.flat, 'firstsecond');
  });

  test('hyphenation heal applies uniformly when next item starts with letter', () => {
    // Real-world ambiguity: PDFs don't distinguish soft hyphens (line-break
    // only, should heal) from real compound hyphens (must keep). The flat
    // index always heals — same as Adobe's text extraction. The cached
    // annotation text loses the visual hyphen for compound words, but the
    // DOM Range still covers the rendered "well-" + "behaved" spans
    // correctly because offsets are span-positional, not text-derived.
    const idx = buildPageTextIndex(tc([
      { str: 'The well-', eol: true },
      { str: 'behaved cat sat on the win-', eol: true },
      { str: 'dow sill.', eol: false },
    ]));
    assert.equal(idx.flat, 'The wellbehaved cat sat on the window sill.');
    assert.equal(idx.spans[0].hadHyphen, true);
    assert.equal(idx.spans[1].hadHyphen, true);
    assert.equal(idx.spans[2].hadHyphen, false);
  });
});

describe('buildPageTextIndex — span/flat alignment', () => {
  test('spans are positional 1:1 with input items', () => {
    const idx = buildPageTextIndex(tc(['a', { str: 'b', eol: true }, 'c']));
    assert.equal(idx.spans.length, 3);
    assert.equal(idx.spans[0].itemIdx, 0);
    assert.equal(idx.spans[1].itemIdx, 1);
    assert.equal(idx.spans[2].itemIdx, 2);
  });

  test('rawLength reflects original item.str length even when hyphen is elided', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'inter-', eol: true },
      { str: 'esting', eol: false },
    ]));
    assert.equal(idx.spans[0].rawLength, 6);
    assert.equal(idx.spans[0].flatEnd - idx.spans[0].flatStart, 5); // "inter"
  });
});

// ── findSpanIdxForOffset ───────────────────────────────────────────────

describe('findSpanIdxForOffset — boundary behavior', () => {
  const idx = buildPageTextIndex(tc(['foo', { str: 'bar', eol: true }, 'baz']));
  // flat = 'foobar baz'
  //         0123456789
  // spans: [0..3) 'foo', [3..6) 'bar', [7..10) 'baz' (gap at 6 is the synthetic space)

  test('start mode: offset inside a span maps to that span', () => {
    assert.equal(findSpanIdxForOffset(idx, 1, 'start'), 0);
    assert.equal(findSpanIdxForOffset(idx, 4, 'start'), 1);
    assert.equal(findSpanIdxForOffset(idx, 8, 'start'), 2);
  });

  test('start mode: offset at exact span boundary maps to the OPENING span', () => {
    assert.equal(findSpanIdxForOffset(idx, 0, 'start'), 0);
    assert.equal(findSpanIdxForOffset(idx, 3, 'start'), 1); // start of 'bar'
    assert.equal(findSpanIdxForOffset(idx, 7, 'start'), 2); // start of 'baz'
  });

  test('end mode: offset at exact span END boundary maps to the CLOSING span', () => {
    assert.equal(findSpanIdxForOffset(idx, 3, 'end'), 0); // end of 'foo'
    assert.equal(findSpanIdxForOffset(idx, 6, 'end'), 1); // end of 'bar'
    assert.equal(findSpanIdxForOffset(idx, 10, 'end'), 2); // end of 'baz'
  });

  test('offset in synthetic-space gap returns -1', () => {
    // Position 6 is the synthetic space between 'bar' and 'baz'.
    assert.equal(findSpanIdxForOffset(idx, 6, 'start'), -1);
  });

  test('out-of-range offsets return -1', () => {
    assert.equal(findSpanIdxForOffset(idx, -1, 'start'), -1);
    assert.equal(findSpanIdxForOffset(idx, 999, 'start'), -1);
    assert.equal(findSpanIdxForOffset(idx, Number.NaN, 'start'), -1);
  });

  test('end-of-doc offset maps to last span (start or end mode)', () => {
    assert.equal(findSpanIdxForOffset(idx, 10, 'start'), 2);
  });

  test('empty index returns -1 for any offset', () => {
    const e = buildPageTextIndex({ items: [] });
    assert.equal(findSpanIdxForOffset(e, 0), -1);
  });
});

// ── flatToSpanCoord / spanCoordToFlat round-trip ───────────────────────

describe('flat ↔ span coord round-trip', () => {
  test('simple round-trip preserves offsets inside a span', () => {
    const idx = buildPageTextIndex(tc(['hello', { str: 'world', eol: false }]));
    for (let i = 0; i <= 10; i++) {
      const coord = flatToSpanCoord(idx, i, i === 5 ? 'end' : 'start');
      if (!coord) continue;
      const back = spanCoordToFlat(idx, coord.spanIdx, coord.charWithinSpan);
      assert.equal(back, i, `offset ${i} round-trip failed`);
    }
  });

  test('hyphen-elided span: round-trip clamps at flatEnd', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'care-', eol: true },     // rawLength 5, flatLen 4
      { str: 'ful', eol: false },
    ]));
    // The hyphen-elided position is span[0].charWithinSpan === 4 (where the
    // hyphen used to be in raw text). Reverse-mapping should yield
    // span[0].flatEnd === 4.
    assert.equal(spanCoordToFlat(idx, 0, 4), 4);
    // Anything past it (e.g. charWithinSpan = 5) also clamps to flatEnd.
    assert.equal(spanCoordToFlat(idx, 0, 5), 4);
  });

  test('flatToSpanCoord clamps charWithinSpan to flat length, not raw', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'inter-', eol: true },
      { str: 'esting', eol: false },
    ]));
    // Offset 5 is inside span 1's "esting" (flat = "interesting", pos 5 = 'e').
    const c = flatToSpanCoord(idx, 5, 'start');
    assert.equal(c.spanIdx, 1);
    assert.equal(c.charWithinSpan, 0);
  });

  test('invalid inputs return null/-1 gracefully', () => {
    const idx = buildPageTextIndex(tc(['hi']));
    assert.equal(flatToSpanCoord(idx, -1), null);
    assert.equal(spanCoordToFlat(idx, 99, 0), -1);
    assert.equal(spanCoordToFlat(idx, 0, -1), -1);
    assert.equal(spanCoordToFlat(null, 0, 0), -1);
  });
});

// ── fnv32 hash ─────────────────────────────────────────────────────────

describe('fnv32', () => {
  test('produces stable hex digest', () => {
    assert.equal(fnv32(''), '811c9dc5');           // empty FNV-1a seed
    assert.equal(fnv32('a').length, 8);
    assert.equal(fnv32('foo'), fnv32('foo'));      // deterministic
  });

  test('different inputs produce different digests', () => {
    assert.notEqual(fnv32('foo'), fnv32('foobar'));
    assert.notEqual(fnv32('a'), fnv32('b'));
  });

  test('handles non-string input', () => {
    assert.equal(fnv32(null).length, 8);
    assert.equal(fnv32(undefined).length, 8);
    assert.equal(fnv32(123), fnv32('123'));
  });
});
