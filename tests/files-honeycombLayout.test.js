/**
 * Tests for files/engine/honeycombLayout.js — cellLayout, coinRing.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { cellLayout, coinRing, HEX_CELL } from '../os/apps/files/engine/honeycombLayout.js';

describe('cellLayout', () => {
  test('returns [] for invalid input', () => {
    assert.deepEqual(cellLayout({ count: 0, width: 800, height: 600 }), []);
    assert.deepEqual(cellLayout({ count: 5, width: 0, height: 600 }), []);
    assert.deepEqual(cellLayout({ count: 5, width: 800, height: 0 }), []);
    assert.deepEqual(cellLayout({}), []);
  });

  test('places N cells; each has finite x/y', () => {
    const out = cellLayout({ count: 7, width: 900, height: 600 });
    assert.equal(out.length, 7);
    for (const p of out) {
      assert.ok(Number.isFinite(p.x) && p.x >= 0);
      assert.ok(Number.isFinite(p.y) && p.y >= 0);
    }
  });

  test('packs cells row-by-row by horizontal pitch', () => {
    const out = cellLayout({ count: 10, width: 900, height: 600 });
    const ys = out.map((p) => Math.round(p.y));
    // First row should share a y with at least 2 entries
    const firstY = ys[0];
    const sameRow = ys.filter((y) => y === firstY).length;
    assert.ok(sameRow >= 2);
  });

  test('odd rows are offset (brick-pattern)', () => {
    const out = cellLayout({ count: 12, width: 900, height: 600 });
    if (out.length < 8) return; // not enough for 2 rows in narrow width
    // The y of row 0 vs row 1 differ
    const ys = [...new Set(out.map((p) => Math.round(p.y)))].sort((a, b) => a - b);
    if (ys.length < 2) return;
    const row0 = out.filter((p) => Math.round(p.y) === ys[0]);
    const row1 = out.filter((p) => Math.round(p.y) === ys[1]);
    if (row0.length === 0 || row1.length === 0) return;
    // First x of row 1 should differ from first x of row 0 by HEX_W/2
    const dx = Math.round(Math.abs(row1[0].x - row0[0].x));
    assert.ok(dx > 0);
  });

  test('cell width constant matches export', () => {
    assert.equal(HEX_CELL.width, 130);
    assert.equal(HEX_CELL.height, 150);
  });
});

describe('coinRing', () => {
  test('returns [] for zero count', () => {
    assert.deepEqual(coinRing({ count: 0, width: 800, height: 600 }), []);
  });

  test('places coins on perimeter — all within bounds', () => {
    const out = coinRing({ count: 12, width: 800, height: 600, padding: 24, radius: 28 });
    assert.equal(out.length, 12);
    const inset = 52; // padding + radius
    for (const p of out) {
      assert.ok(p.x >= inset - 1 && p.x <= 800 - inset + 1, `x=${p.x}`);
      assert.ok(p.y >= inset - 1 && p.y <= 600 - inset + 1, `y=${p.y}`);
    }
  });

  test('coins are spread (not all stacked)', () => {
    const out = coinRing({ count: 8, width: 600, height: 400 });
    const distinctX = new Set(out.map((p) => Math.round(p.x))).size;
    const distinctY = new Set(out.map((p) => Math.round(p.y))).size;
    assert.ok(distinctX + distinctY >= 4);
  });

  test('returns [] for unusable dimensions', () => {
    assert.deepEqual(coinRing({ count: 5, width: 0, height: 600 }), []);
    assert.deepEqual(coinRing({ count: 5, width: 800, height: 0 }), []);
  });
});
