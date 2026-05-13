/**
 * Tests for pdf/v3/select/textSearch.js — pure case-insensitive
 * substring search across a pageTextIndex.
 *
 * Run with: node --test tests/pdf-v3-text-search.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildPageTextIndex } from '../os/apps/pdf/v3/select/pageTextIndex.js';
import { searchInIndex } from '../os/apps/pdf/v3/select/textSearch.js';

function tc(items) {
  return {
    items: items.map((it) =>
      typeof it === 'string'
        ? { str: it, hasEOL: false }
        : { str: it.str || '', hasEOL: !!it.eol }
    ),
  };
}

describe('searchInIndex — basic', () => {
  test('finds a single match', () => {
    const idx = buildPageTextIndex(tc(['Hello world']));
    const matches = searchInIndex(idx, 'world');
    assert.deepEqual(matches, [{ charStart: 6, charEnd: 11 }]);
  });

  test('case-insensitive by default', () => {
    const idx = buildPageTextIndex(tc(['Hello World']));
    const matches = searchInIndex(idx, 'world');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].charStart, 6);
  });

  test('finds multiple matches', () => {
    const idx = buildPageTextIndex(tc(['the cat and the dog and the bird']));
    const matches = searchInIndex(idx, 'the');
    assert.equal(matches.length, 3);
    assert.equal(matches[0].charStart, 0);
    assert.equal(matches[1].charStart, 12);
    assert.equal(matches[2].charStart, 24);
  });

  test('empty query returns no matches', () => {
    const idx = buildPageTextIndex(tc(['Hello']));
    assert.deepEqual(searchInIndex(idx, ''), []);
    assert.deepEqual(searchInIndex(idx, null), []);
  });

  test('empty index returns no matches', () => {
    const idx = buildPageTextIndex({ items: [] });
    assert.deepEqual(searchInIndex(idx, 'foo'), []);
  });

  test('finds match across hyphen-elided span', () => {
    // The whole reason for the rewrite: hyphenated line breaks must
    // be searchable as a single word.
    const idx = buildPageTextIndex(tc([
      { str: 'inter-', eol: true },
      { str: 'esting', eol: false },
    ]));
    const matches = searchInIndex(idx, 'interesting');
    assert.deepEqual(matches, [{ charStart: 0, charEnd: 11 }]);
  });

  test('finds match across visual line break (space-joined)', () => {
    const idx = buildPageTextIndex(tc([
      { str: 'foo bar', eol: true },
      { str: 'baz qux', eol: false },
    ]));
    // flat = "foo bar baz qux"
    const matches = searchInIndex(idx, 'bar baz');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].charStart, 4);
  });
});

describe('searchInIndex — case sensitivity', () => {
  test('caseSensitive: true requires exact case', () => {
    const idx = buildPageTextIndex(tc(['Hello hello']));
    const insensitive = searchInIndex(idx, 'Hello', { caseSensitive: false });
    const sensitive = searchInIndex(idx, 'Hello', { caseSensitive: true });
    assert.equal(insensitive.length, 2);
    assert.equal(sensitive.length, 1);
    assert.equal(sensitive[0].charStart, 0);
  });
});

describe('searchInIndex — whole-word', () => {
  test('whole-word match excludes partial-word hits', () => {
    const idx = buildPageTextIndex(tc(['cat catfish catalog cat.']));
    // flat = "cat catfish catalog cat."
    //         0   4       12      20
    const matches = searchInIndex(idx, 'cat', { wholeWord: true });
    // Should match 'cat' at 0 and 'cat' at 20 (followed by '.'), but
    // not the 'cat' inside 'catfish' or 'catalog'.
    const starts = matches.map((m) => m.charStart);
    assert.deepEqual(starts, [0, 20]);
  });

  test('whole-word treats digit and underscore as word chars', () => {
    const idx = buildPageTextIndex(tc(['fast fast42 _fast']));
    const matches = searchInIndex(idx, 'fast', { wholeWord: true });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].charStart, 0);
  });
});

describe('searchInIndex — pathological inputs', () => {
  test('non-string index.flat returns empty', () => {
    assert.deepEqual(searchInIndex({ flat: null }, 'x'), []);
    assert.deepEqual(searchInIndex({}, 'x'), []);
    assert.deepEqual(searchInIndex(null, 'x'), []);
  });

  test('single-character query at end of flat', () => {
    const idx = buildPageTextIndex(tc(['abc']));
    assert.deepEqual(searchInIndex(idx, 'c'), [{ charStart: 2, charEnd: 3 }]);
  });

  test('matches advance past the needle (no overlapping)', () => {
    // Matches Chrome / Acrobat find behavior: 'aa' in 'aaaaa' yields
    // 2 non-overlapping matches at positions 0 and 2.
    const idx = buildPageTextIndex(tc(['aaaaa']));
    const matches = searchInIndex(idx, 'aa');
    assert.equal(matches.length, 2);
    assert.deepEqual(matches.map((m) => m.charStart), [0, 2]);
  });
});
