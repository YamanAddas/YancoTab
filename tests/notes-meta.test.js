/**
 * Tests for notes/engine/meta.js + layout.js — metadata normalization
 * and deterministic grid positions.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMetaEntry, normalizeMeta, inferStatus, STATUSES,
} from '../os/apps/notes/engine/meta.js';
import {
  gridPosition, fillPositions, STAR_COLS, STAR_ROWS,
} from '../os/apps/notes/engine/layout.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 4, 7, 14, 0, 0).getTime();

describe('normalizeMetaEntry', () => {
  test('null/non-object → null', () => {
    assert.equal(normalizeMetaEntry(null), null);
    assert.equal(normalizeMetaEntry('string'), null);
    assert.equal(normalizeMetaEntry(42), null);
  });

  test('preserves valid existing fields', () => {
    const out = normalizeMetaEntry({
      title: 'Hello', created: 100, updated: 200, pinned: true,
      tags: ['foo', 'bar'], x: 30, y: 70, status: 'idea',
    });
    assert.equal(out.title, 'Hello');
    assert.equal(out.created, 100);
    assert.equal(out.updated, 200);
    assert.equal(out.pinned, true);
    assert.deepEqual(out.tags, ['foo', 'bar']);
    assert.equal(out.x, 30);
    assert.equal(out.y, 70);
    assert.equal(out.status, 'idea');
  });

  test('fills missing fields with defaults', () => {
    const out = normalizeMetaEntry({});
    assert.equal(out.title, 'Untitled');
    assert.equal(out.created, 0);
    assert.equal(out.updated, 0);
    assert.equal(out.pinned, false);
    assert.deepEqual(out.tags, []);
    assert.equal(out.x, 50);
    assert.equal(out.y, 50);
    assert.equal(out.status, null);
  });

  test('fallback position used when x/y missing', () => {
    const out = normalizeMetaEntry({ title: 'A' }, { x: 22, y: 78 });
    assert.equal(out.x, 22);
    assert.equal(out.y, 78);
  });

  test('clamps x/y to 4..96', () => {
    const lo = normalizeMetaEntry({ x: -50, y: -10 });
    assert.equal(lo.x, 4);
    assert.equal(lo.y, 4);
    const hi = normalizeMetaEntry({ x: 200, y: 999 });
    assert.equal(hi.x, 96);
    assert.equal(hi.y, 96);
  });

  test('rejects unknown status', () => {
    const out = normalizeMetaEntry({ status: 'nonsense' });
    assert.equal(out.status, null);
  });

  test('accepts every documented status', () => {
    for (const s of STATUSES) {
      const out = normalizeMetaEntry({ status: s });
      assert.equal(out.status, s);
    }
  });

  test('tags lowercased + deduped + capped at 6', () => {
    const out = normalizeMetaEntry({ tags: ['Foo', 'foo', 'Bar', '  baz  ', 'a', 'b', 'c', 'd', 'e'] });
    // Set ordering preserves first-seen → ['foo', 'bar', 'baz', 'a', 'b', 'c']
    assert.equal(out.tags.length, 6);
    assert.equal(out.tags[0], 'foo');
    assert.equal(out.tags[1], 'bar');
    assert.equal(out.tags[2], 'baz');
  });

  test('non-string title falls back to Untitled', () => {
    assert.equal(normalizeMetaEntry({ title: '   ' }).title, 'Untitled');
    assert.equal(normalizeMetaEntry({ title: 42 }).title, 'Untitled');
  });

  test('title capped at 200 chars', () => {
    const long = 'A'.repeat(300);
    const out = normalizeMetaEntry({ title: long });
    assert.equal(out.title.length, 200);
  });

  test('updated falls back to created when missing', () => {
    const out = normalizeMetaEntry({ created: 555 });
    assert.equal(out.updated, 555);
  });
});

describe('normalizeMeta (full map)', () => {
  test('null/non-object → empty', () => {
    assert.deepEqual(normalizeMeta(null), {});
    assert.deepEqual(normalizeMeta('oops'), {});
  });

  test('drops invalid entries', () => {
    const out = normalizeMeta({ '/a.txt': { title: 'A' }, '/b.txt': null, '/c.txt': 42 });
    assert.equal(Object.keys(out).length, 1);
    assert.equal(out['/a.txt'].title, 'A');
  });

  test('assigns deterministic grid positions for missing x/y', () => {
    // Three notes without x/y — sorted alphabetically by path.
    const out = normalizeMeta({
      '/c.txt': { title: 'C' },
      '/a.txt': { title: 'A' },
      '/b.txt': { title: 'B' },
    });
    // Sorted by path → /a, /b, /c → indices 0, 1, 2
    assert.deepEqual(
      { x: out['/a.txt'].x, y: out['/a.txt'].y },
      gridPosition(0)
    );
    assert.deepEqual(
      { x: out['/b.txt'].x, y: out['/b.txt'].y },
      gridPosition(1)
    );
    assert.deepEqual(
      { x: out['/c.txt'].x, y: out['/c.txt'].y },
      gridPosition(2)
    );
  });

  test('preserves explicit positions on entries that have them', () => {
    const out = normalizeMeta({
      '/a.txt': { title: 'A', x: 25, y: 75 },
      '/b.txt': { title: 'B' }, // no position — gets grid index 1
    });
    assert.equal(out['/a.txt'].x, 25);
    assert.equal(out['/a.txt'].y, 75);
    assert.deepEqual(
      { x: out['/b.txt'].x, y: out['/b.txt'].y },
      gridPosition(1)
    );
  });
});

describe('inferStatus', () => {
  test('pinned → anchor', () => {
    assert.equal(inferStatus({ pinned: true }, T0), 'anchor');
  });

  test('tag includes "idea" → idea', () => {
    assert.equal(inferStatus({ tags: ['idea', 'foo'] }, T0), 'idea');
    assert.equal(inferStatus({ tags: ['todo'] }, T0), 'idea');
  });

  test('updated within 7 days → draft', () => {
    assert.equal(inferStatus({ updated: T0 - 3 * DAY }, T0), 'draft');
  });

  test('updated > 30 days ago → done', () => {
    assert.equal(inferStatus({ updated: T0 - 60 * DAY }, T0), 'done');
  });

  test('untouched within 7-30 day window → null', () => {
    assert.equal(inferStatus({ updated: T0 - 14 * DAY }, T0), null);
  });

  test('null entry → null', () => {
    assert.equal(inferStatus(null, T0), null);
  });
});

describe('gridPosition', () => {
  test('first row fills horizontally', () => {
    const ys = [0, 1, 2, 3, 4].map((i) => gridPosition(i).y);
    assert.deepEqual(ys, [22, 22, 22, 22, 22]);
  });

  test('row wraps after STAR_COLS', () => {
    assert.equal(gridPosition(STAR_COLS).x, gridPosition(0).x);
    assert.notEqual(gridPosition(STAR_COLS).y, gridPosition(0).y);
  });

  test('large indices stay within 4..96', () => {
    for (const i of [50, 100, 200]) {
      const p = gridPosition(i);
      assert.ok(p.x >= 4 && p.x <= 96, `x out of range for index ${i}: ${p.x}`);
      assert.ok(p.y >= 4 && p.y <= 96, `y out of range for index ${i}: ${p.y}`);
    }
  });

  test('garbage → fallback', () => {
    assert.deepEqual(gridPosition(NaN), { x: 16, y: 22 });
    assert.deepEqual(gridPosition(-5), { x: 16, y: 22 });
  });

  test('STAR_COLS / STAR_ROWS exports match', () => {
    assert.equal(STAR_COLS, 5);
    assert.equal(STAR_ROWS, 5);
  });
});

describe('fillPositions', () => {
  test('non-array → empty', () => {
    assert.deepEqual(fillPositions(null), []);
    assert.deepEqual(fillPositions('oops'), []);
  });

  test('passes through notes with both coords', () => {
    const out = fillPositions([{ id: 'a', x: 30, y: 70 }]);
    assert.equal(out[0].x, 30);
    assert.equal(out[0].y, 70);
  });

  test('fills missing coords with grid positions', () => {
    const out = fillPositions([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    assert.deepEqual({ x: out[0].x, y: out[0].y }, gridPosition(0));
    assert.deepEqual({ x: out[1].x, y: out[1].y }, gridPosition(1));
    assert.deepEqual({ x: out[2].x, y: out[2].y }, gridPosition(2));
  });

  test('clamps explicit out-of-bounds coords', () => {
    const out = fillPositions([{ id: 'a', x: -10, y: 200 }]);
    assert.equal(out[0].x, 4);
    assert.equal(out[0].y, 96);
  });
});
