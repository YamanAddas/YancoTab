/**
 * Tests for files/engine/storageBreakdown.js — breakdown.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { breakdown } from '../os/apps/files/engine/storageBreakdown.js';

function f(category, size) {
  return { isDir: false, category, size, path: '/' + category + '_' + size };
}

describe('breakdown', () => {
  test('empty / non-array returns empty buckets', () => {
    const out = breakdown(null);
    assert.equal(out.totalBytes, 0);
    assert.equal(out.buckets.docs.bytes, 0);
    assert.equal(out.buckets.docs.percent, 0);
  });

  test('aggregates by fuel bucket', () => {
    const items = [
      f('docs', 100),
      f('img', 200),
      f('video', 300),
      f('audio', 50),    // → other
      f('code', 25),     // → other
      f('archive', 25),  // → other
    ];
    const out = breakdown(items);
    assert.equal(out.totalBytes, 700);
    assert.equal(out.buckets.docs.bytes, 100);
    assert.equal(out.buckets.img.bytes, 200);
    assert.equal(out.buckets.video.bytes, 300);
    assert.equal(out.buckets.other.bytes, 100);
    // percents add to 1
    const sum = ['docs', 'img', 'video', 'other']
      .reduce((s, k) => s + out.buckets[k].percent, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  test('drops directories from totals', () => {
    const items = [
      { isDir: true, category: 'directory', size: 999, path: '/d' },
      f('docs', 100),
    ];
    const out = breakdown(items);
    assert.equal(out.totalBytes, 100);
  });

  test('drops 0 / negative / non-finite sizes', () => {
    const items = [
      f('docs', 100),
      f('img', 0),
      f('video', -50),
      f('docs', NaN),
    ];
    const out = breakdown(items);
    assert.equal(out.totalBytes, 100);
    assert.equal(out.buckets.img.bytes, 0);
  });

  test('items missing category default to other bucket', () => {
    const items = [{ isDir: false, size: 100, path: '/x' }];
    const out = breakdown(items);
    assert.equal(out.buckets.other.bytes, 100);
  });
});
