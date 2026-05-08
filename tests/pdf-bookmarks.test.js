/**
 * Tests for pdf/engine/bookmarks.js — add, remove, list, clear.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyMap, listForDoc, add, remove, clearDoc, isBookmarked, COLORS,
} from '../os/apps/pdf/engine/bookmarks.js';

describe('emptyMap', () => {
  test('returns {}', () => {
    assert.deepEqual(emptyMap(), {});
  });
});

describe('add', () => {
  test('adds a bookmark to a doc', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 42, label: 'Seven Stages' });
    assert.equal(m['/d.pdf'].length, 1);
    assert.equal(m['/d.pdf'][0].page, 42);
    assert.equal(m['/d.pdf'][0].label, 'Seven Stages');
  });

  test('rejects malformed entry', () => {
    const a = add(emptyMap(), '/d.pdf', { page: 0 });        // page<1
    const b = add(emptyMap(), '/d.pdf', { page: 'x' });      // bad type
    const c = add(emptyMap(), '/d.pdf', null);
    assert.deepEqual(a, {});
    assert.deepEqual(b, {});
    assert.deepEqual(c, {});
  });

  test('keeps list sorted by page', () => {
    let m = emptyMap();
    m = add(m, '/d.pdf', { page: 100, label: 'C' });
    m = add(m, '/d.pdf', { page: 12,  label: 'A' });
    m = add(m, '/d.pdf', { page: 50,  label: 'B' });
    assert.deepEqual(m['/d.pdf'].map((b) => b.label), ['A', 'B', 'C']);
  });

  test('replaces an existing bookmark with same page+label', () => {
    let m = emptyMap();
    m = add(m, '/d.pdf', { page: 42, label: 'X', color: 'warm' });
    m = add(m, '/d.pdf', { page: 42, label: 'X', color: 'rose' });
    assert.equal(m['/d.pdf'].length, 1);
    assert.equal(m['/d.pdf'][0].color, 'rose');
  });

  test('does not mutate caller map', () => {
    const a = emptyMap();
    add(a, '/d.pdf', { page: 1 });
    assert.deepEqual(a, {});
  });

  test('handles missing docId gracefully', () => {
    const a = emptyMap();
    const b = add(a, '', { page: 1 });
    assert.equal(b, a);  // returns original reference
  });

  test('defaults color to accent for unknown values', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 1, label: 'X', color: 'fuchsia' });
    assert.equal(m['/d.pdf'][0].color, 'accent');
  });

  test('accepts all defined colors', () => {
    for (const c of COLORS) {
      const m = add(emptyMap(), '/d.pdf', { page: 1, label: c, color: c });
      assert.equal(m['/d.pdf'][0].color, c);
    }
  });
});

describe('remove', () => {
  test('drops by page+label', () => {
    let m = add(emptyMap(), '/d.pdf', { page: 1, label: 'A' });
    m = add(m, '/d.pdf', { page: 1, label: 'B' });
    const out = remove(m, '/d.pdf', 1, 'A');
    assert.equal(out['/d.pdf'].length, 1);
    assert.equal(out['/d.pdf'][0].label, 'B');
  });

  test('drops all on a page when label is null', () => {
    let m = add(emptyMap(), '/d.pdf', { page: 1, label: 'A' });
    m = add(m, '/d.pdf', { page: 1, label: 'B' });
    const out = remove(m, '/d.pdf', 1);
    assert.equal('/d.pdf' in out, false);
  });

  test('removes the doc entry when last bookmark goes', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 1, label: 'A' });
    const out = remove(m, '/d.pdf', 1, 'A');
    assert.equal('/d.pdf' in out, false);
  });
});

describe('listForDoc', () => {
  test('returns [] for unknown doc', () => {
    assert.deepEqual(listForDoc(emptyMap(), '/missing'), []);
  });

  test('returns normalized entries', () => {
    const m = { '/d.pdf': [{ page: 5, label: 'X', color: 'accent' }, null, { foo: 1 }] };
    const list = listForDoc(m, '/d.pdf');
    assert.equal(list.length, 1);
    assert.equal(list[0].page, 5);
  });
});

describe('clearDoc', () => {
  test('removes all bookmarks for a doc', () => {
    let m = add(emptyMap(), '/d.pdf', { page: 1 });
    m = add(m, '/other.pdf', { page: 2 });
    const out = clearDoc(m, '/d.pdf');
    assert.equal('/d.pdf' in out, false);
    assert.equal('/other.pdf' in out, true);
  });

  test('no-op for unknown doc', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 1 });
    const out = clearDoc(m, '/none');
    assert.equal(out, m);
  });
});

describe('isBookmarked', () => {
  test('true when present', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 12, label: 'A' });
    assert.equal(isBookmarked(m, '/d.pdf', 12, 'A'), true);
    assert.equal(isBookmarked(m, '/d.pdf', 12), true);  // page-only check
  });

  test('false when absent', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 12 });
    assert.equal(isBookmarked(m, '/d.pdf', 99), false);
    assert.equal(isBookmarked(m, '/other.pdf', 12), false);
  });
});
