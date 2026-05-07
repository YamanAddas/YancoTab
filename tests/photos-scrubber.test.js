/**
 * Tests for photos/engine/scrubber.js — monthBuckets, cappedBuckets.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { monthBuckets, cappedBuckets } from '../os/apps/photos/engine/scrubber.js';

function p(year, month0, count = 1) {
  // returns `count` photos created on the 15th of that month at noon
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ created: new Date(year, month0, 15, 12, 0).getTime() });
  }
  return out;
}

describe('monthBuckets', () => {
  test('empty input returns []', () => {
    assert.deepEqual(monthBuckets(null), []);
    assert.deepEqual(monthBuckets([]), []);
  });

  test('photos with no valid created return []', () => {
    assert.deepEqual(monthBuckets([{ created: 0 }, { created: undefined }]), []);
  });

  test('single month', () => {
    const buckets = monthBuckets(p(2026, 3, 5)); // 5 photos in April 2026
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].key, '2026-04');
    assert.equal(buckets[0].count, 5);
    assert.equal(buckets[0].label, 'April 2026');
    // Only one year present → shortLabel uses bare month name
    assert.equal(buckets[0].shortLabel, 'Apr');
  });

  test('contiguous months', () => {
    const photos = [...p(2026, 0, 2), ...p(2026, 1, 3), ...p(2026, 2, 1)];
    const buckets = monthBuckets(photos);
    assert.deepEqual(buckets.map((b) => b.key), ['2026-01', '2026-02', '2026-03']);
    assert.deepEqual(buckets.map((b) => b.count), [2, 3, 1]);
  });

  test('gap-fills missing months with count 0', () => {
    // Jan 2026 + April 2026 → buckets for Jan, Feb, Mar, Apr
    const photos = [...p(2026, 0, 1), ...p(2026, 3, 4)];
    const buckets = monthBuckets(photos);
    assert.deepEqual(buckets.map((b) => b.key), ['2026-01', '2026-02', '2026-03', '2026-04']);
    assert.deepEqual(buckets.map((b) => b.count), [1, 0, 0, 4]);
  });

  test('crosses year boundary', () => {
    const photos = [...p(2025, 11, 2), ...p(2026, 1, 3)]; // Dec 2025 → Feb 2026
    const buckets = monthBuckets(photos);
    assert.deepEqual(buckets.map((b) => b.key), ['2025-12', '2026-01', '2026-02']);
    assert.deepEqual(buckets.map((b) => b.count), [2, 0, 3]);
  });

  test('shortLabel uses 2-digit-year suffix when year differs from latest', () => {
    const photos = [...p(2025, 4, 1), ...p(2026, 0, 1), ...p(2026, 3, 1)];
    const buckets = monthBuckets(photos);
    const may25 = buckets.find((b) => b.key === '2025-05');
    const apr26 = buckets.find((b) => b.key === '2026-04');
    assert.equal(may25.shortLabel, 'May 25');
    // 2026 == latest year → bare label
    assert.equal(apr26.shortLabel, 'Apr');
  });

  test('drops photos with non-finite created (counts only valid)', () => {
    const photos = [...p(2026, 0, 1), { created: undefined }, ...p(2026, 0, 2)];
    const buckets = monthBuckets(photos);
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].count, 3);
  });
});

describe('cappedBuckets', () => {
  test('empty / non-array returns []', () => {
    assert.deepEqual(cappedBuckets(null), []);
    assert.deepEqual(cappedBuckets([]), []);
  });

  test('clamps count to maxStars', () => {
    const inp = [{ count: 0 }, { count: 3 }, { count: 50 }];
    const out = cappedBuckets(inp, 5);
    assert.deepEqual(out.map((b) => b.stars), [0, 3, 5]);
  });

  test('default maxStars is 5', () => {
    const out = cappedBuckets([{ count: 100 }]);
    assert.equal(out[0].stars, 5);
  });

  test('non-finite count becomes 0', () => {
    const out = cappedBuckets([{ count: undefined }, { count: NaN }]);
    assert.deepEqual(out.map((b) => b.stars), [0, 0]);
  });

  test('preserves the original bucket fields', () => {
    const inp = [{ key: '2026-04', count: 2, label: 'X', extra: 'keepme' }];
    const out = cappedBuckets(inp, 5);
    assert.equal(out[0].key, '2026-04');
    assert.equal(out[0].label, 'X');
    assert.equal(out[0].extra, 'keepme');
  });
});
