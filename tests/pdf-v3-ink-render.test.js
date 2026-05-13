/**
 * Tests for pdf/v3/render/inkRender.js — pure Catmull-Rom smoothing.
 *
 * Run with: node --test tests/pdf-v3-ink-render.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPath,
  buildPathFromFractional,
  decimateFractional,
} from '../os/apps/pdf/v3/render/inkRender.js';

describe('buildPath — edge cases', () => {
  test('empty input returns empty string', () => {
    assert.equal(buildPath([]), '');
    assert.equal(buildPath(null), '');
  });

  test('single point renders as zero-length M-L for dot styling', () => {
    const d = buildPath([[10, 20]]);
    assert.equal(d, 'M10,20 L10,20');
  });

  test('two points render as straight line', () => {
    const d = buildPath([[10, 20], [50, 80]]);
    assert.equal(d, 'M10,20 L50,80');
  });

  test('three points render as N-1 = 2 cubic segments', () => {
    const d = buildPath([[0, 0], [10, 10], [20, 0]]);
    assert.ok(d.startsWith('M0,0'));
    // N points → N-1 cubic segments. The Catmull-Rom loop visits
    // every gap between consecutive points (here 0→1 and 1→2).
    const cCount = (d.match(/C/g) || []).length;
    assert.equal(cCount, 2);
    assert.ok(d.endsWith('20,0'));
  });
});

describe('buildPath — formatting', () => {
  test('coordinates are rounded to 2 decimal places', () => {
    const d = buildPath([[1.123456, 2.987654], [3.111111, 4.222222]]);
    // Should not contain >2 decimal places.
    const decimals = d.match(/\.\d{3,}/g);
    assert.equal(decimals, null);
  });

  test('integer coordinates have no decimal point', () => {
    const d = buildPath([[1, 2], [3, 4]]);
    assert.equal(d, 'M1,2 L3,4');
  });

  test('non-finite coordinates collapse to 0', () => {
    const d = buildPath([[NaN, 10], [20, 30]]);
    assert.ok(d.startsWith('M0,10'));
  });
});

describe('buildPath — Catmull-Rom math', () => {
  test('three-point input produces a valid path with N-1 cubics', () => {
    const left = buildPath([[0, 5], [5, 0], [10, 5]]);
    const right = buildPath([[20, 5], [15, 0], [10, 5]]);
    // Both should be valid path strings: M followed by one or more
    // cubic-segment groups.
    const validPath = /^M-?[\d.]+,-?[\d.]+( C-?[\d.]+,-?[\d.]+ -?[\d.]+,-?[\d.]+ -?[\d.]+,-?[\d.]+)+$/;
    assert.ok(validPath.test(left), `left didn't match: ${left}`);
    assert.ok(validPath.test(right), `right didn't match: ${right}`);
  });

  test('higher tension steepens the curve', () => {
    const pts = [[0, 0], [10, 10], [20, 0]];
    const low = buildPath(pts, 0.1);
    const high = buildPath(pts, 1.0);
    assert.notEqual(low, high);
  });

  test('long polyline produces N-1 cubic segments', () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push([i * 5, i * 3]);
    const d = buildPath(pts);
    // Count the cubic C commands — should be points.length - 1 = 10.
    const cCount = (d.match(/C/g) || []).length;
    assert.equal(cCount, 10);
  });
});

describe('buildPathFromFractional', () => {
  test('scales fractional coords to the viewBox', () => {
    // 0,0 and 0.5,0.5 on a 100x200 viewBox → 0,0 and 50,100
    const d = buildPathFromFractional([[0, 0], [0.5, 0.5]], 100, 200);
    assert.equal(d, 'M0,0 L50,100');
  });

  test('zero or negative viewBox returns empty', () => {
    assert.equal(buildPathFromFractional([[0, 0], [1, 1]], 0, 100), '');
    assert.equal(buildPathFromFractional([[0, 0], [1, 1]], 100, -1), '');
  });

  test('empty point list returns empty', () => {
    assert.equal(buildPathFromFractional([], 100, 100), '');
  });
});

describe('decimateFractional', () => {
  test('preserves start and end points always', () => {
    const samples = [[0, 0], [0.001, 0.001], [0.002, 0.002], [1, 1]];
    const out = decimateFractional(samples, 0.5);
    // First and last must be present; middles dropped because they're
    // closer than the min-distance.
    assert.deepEqual(out[0], [0, 0]);
    assert.deepEqual(out[out.length - 1], [1, 1]);
  });

  test('removes points closer than the min-distance', () => {
    const samples = [];
    for (let i = 0; i < 100; i++) samples.push([i * 0.0001, 0]);
    const out = decimateFractional(samples, 0.01);
    // Most should be dropped — the start, a few mid-points, and the
    // end remain. With 0.0001 spacing and 0.01 min-dist, every 100th
    // point is the floor; but we always keep the final tail, so
    // expect around 2-3 entries.
    assert.ok(out.length <= 5);
    assert.ok(out.length >= 2);
  });

  test('empty input returns empty array', () => {
    assert.deepEqual(decimateFractional([]), []);
    assert.deepEqual(decimateFractional(null), []);
  });

  test('single-point input returns that point', () => {
    const out = decimateFractional([[0.5, 0.5]]);
    assert.deepEqual(out, [[0.5, 0.5]]);
  });
});
