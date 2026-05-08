/**
 * Tests for pdf/engine/highlights.js — add, remove, list, normalize.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyMap, listForDoc, listForDocPage, add, remove, clearDoc, COLORS,
} from '../os/apps/pdf/engine/highlights.js';

describe('emptyMap', () => {
  test('returns {}', () => {
    assert.deepEqual(emptyMap(), {});
  });
});

describe('add', () => {
  test('adds a highlight to a doc', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 5, text: 'evaluating the outcome' });
    assert.equal(m['/d.pdf'].length, 1);
    assert.equal(m['/d.pdf'][0].page, 5);
    assert.equal(m['/d.pdf'][0].text, 'evaluating the outcome');
    assert.equal(m['/d.pdf'][0].color, 'accent');
  });

  test('rejects malformed entries', () => {
    assert.deepEqual(add(emptyMap(), '/d.pdf', { page: 0, text: 'x' }), {});
    assert.deepEqual(add(emptyMap(), '/d.pdf', { page: 1, text: 'a' }), {}); // too short (< 2)
    assert.deepEqual(add(emptyMap(), '/d.pdf', { page: 'x', text: 'hello' }), {});
    assert.deepEqual(add(emptyMap(), '/d.pdf', null), {});
  });

  test('idempotent on (page, text) — re-add updates color/ts', () => {
    let m = add(emptyMap(), '/d.pdf', { page: 1, text: 'hi', color: 'accent' });
    m = add(m, '/d.pdf', { page: 1, text: 'hi', color: 'rose' });
    assert.equal(m['/d.pdf'].length, 1);
    assert.equal(m['/d.pdf'][0].color, 'rose');
  });

  test('rejects empty docId', () => {
    const m = add(emptyMap(), '', { page: 1, text: 'hello' });
    assert.deepEqual(m, {});
  });

  test('caps text length at 1200', () => {
    const long = 'x'.repeat(2000);
    const m = add(emptyMap(), '/d.pdf', { page: 1, text: long });
    assert.equal(m['/d.pdf'][0].text.length, 1200);
  });

  test('falls back to accent for unknown color', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 1, text: 'hi', color: 'fuchsia' });
    assert.equal(m['/d.pdf'][0].color, 'accent');
  });

  test('all valid colors round-trip', () => {
    for (const c of COLORS) {
      const m = add(emptyMap(), '/d.pdf', { page: 1, text: c, color: c });
      assert.equal(m['/d.pdf'][0].color, c);
    }
  });

  test('does not mutate caller map', () => {
    const a = emptyMap();
    add(a, '/d.pdf', { page: 1, text: 'hi' });
    assert.deepEqual(a, {});
  });

  test('trims whitespace in text', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 1, text: '   hello world   ' });
    assert.equal(m['/d.pdf'][0].text, 'hello world');
  });
});

describe('remove', () => {
  test('drops by (page, text)', () => {
    let m = add(emptyMap(), '/d.pdf', { page: 1, text: 'AA' });
    m = add(m, '/d.pdf', { page: 1, text: 'BB' });
    const out = remove(m, '/d.pdf', 1, 'AA');
    assert.equal(out['/d.pdf'].length, 1);
    assert.equal(out['/d.pdf'][0].text, 'BB');
  });

  test('removes the doc entry when last highlight goes', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 1, text: 'hi' });
    const out = remove(m, '/d.pdf', 1, 'hi');
    assert.equal('/d.pdf' in out, false);
  });

  test('no-op when (page, text) not present', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 1, text: 'hi' });
    const out = remove(m, '/d.pdf', 2, 'hi');
    assert.equal(out['/d.pdf'].length, 1);
  });
});

describe('listForDoc / listForDocPage', () => {
  test('listForDoc returns all entries for a doc', () => {
    let m = add(emptyMap(), '/d.pdf', { page: 1, text: 'AA' });
    m = add(m, '/d.pdf', { page: 2, text: 'BB' });
    m = add(m, '/d.pdf', { page: 1, text: 'CC' });
    const all = listForDoc(m, '/d.pdf');
    assert.equal(all.length, 3);
  });

  test('listForDocPage filters by page', () => {
    let m = add(emptyMap(), '/d.pdf', { page: 1, text: 'AA' });
    m = add(m, '/d.pdf', { page: 2, text: 'BB' });
    m = add(m, '/d.pdf', { page: 1, text: 'CC' });
    const p1 = listForDocPage(m, '/d.pdf', 1);
    assert.equal(p1.length, 2);
    const p2 = listForDocPage(m, '/d.pdf', 2);
    assert.equal(p2.length, 1);
  });

  test('returns [] for unknown doc/page', () => {
    assert.deepEqual(listForDoc(emptyMap(), '/missing'), []);
    assert.deepEqual(listForDocPage(emptyMap(), '/missing', 1), []);
  });

  test('drops malformed entries from stored maps silently', () => {
    const m = { '/d.pdf': [{ page: 1, text: 'real' }, null, { page: 0, text: 'bad' }, { foo: 1 }] };
    const out = listForDoc(m, '/d.pdf');
    assert.equal(out.length, 1);
    assert.equal(out[0].text, 'real');
  });
});

describe('clearDoc', () => {
  test('removes all highlights for a doc', () => {
    let m = add(emptyMap(), '/d.pdf', { page: 1, text: 'AA' });
    m = add(m, '/other.pdf', { page: 2, text: 'BB' });
    const out = clearDoc(m, '/d.pdf');
    assert.equal('/d.pdf' in out, false);
    assert.equal('/other.pdf' in out, true);
  });

  test('no-op for unknown doc', () => {
    const m = add(emptyMap(), '/d.pdf', { page: 1, text: 'AA' });
    const out = clearDoc(m, '/none');
    assert.equal(out, m);
  });
});
