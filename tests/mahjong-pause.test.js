/**
 * Tests for MahjongGame's pause/resume clock accounting.
 * Run with: node --test tests/mahjong-pause.test.js
 *
 * The clock is three fields on the pure engine — startTime, pausedAt,
 * and the derived elapsedSecs(now). All three methods take an injectable
 * `now` so no wall-clock patching is needed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MahjongGame } from '../os/apps/games/mahjong/mahjongGame.js';

/** A game whose deal happened at a known instant. */
function gameAt(t0) {
  const g = new MahjongGame();
  g.startTime = t0;
  g.pausedAt = null;
  return g;
}

describe('MahjongGame pause/resume clock', () => {
  test('elapsedSecs runs off the wall clock while unpaused', () => {
    const g = gameAt(10_000);
    assert.equal(g.elapsedSecs(10_000), 0);
    assert.equal(g.elapsedSecs(73_500), 63);
  });

  test('pause freezes elapsedSecs at the pause instant', () => {
    const g = gameAt(10_000);
    g.pause(40_000);
    assert.equal(g.elapsedSecs(40_000), 30);
    // A minute minimized changes nothing
    assert.equal(g.elapsedSecs(100_000), 30);
  });

  test('pause is idempotent — the first stamp wins', () => {
    const g = gameAt(10_000);
    g.pause(40_000);
    g.pause(90_000);
    assert.equal(g.pausedAt, 40_000);
    assert.equal(g.elapsedSecs(200_000), 30);
  });

  test('resume shifts startTime so minimized time never counts', () => {
    const g = gameAt(10_000);
    g.pause(40_000);          // 30s played
    g.resume(100_000);        // 60s minimized
    assert.equal(g.pausedAt, null);
    assert.equal(g.startTime, 70_000);
    assert.equal(g.elapsedSecs(100_000), 30); // still 30s at restore
    assert.equal(g.elapsedSecs(130_000), 60); // +30s of real play
  });

  test('resume without a pause is a no-op', () => {
    const g = gameAt(10_000);
    g.resume(50_000);
    assert.equal(g.startTime, 10_000);
    assert.equal(g.elapsedSecs(50_000), 40);
  });

  test('repeated cycles accumulate only played time', () => {
    const g = gameAt(0);
    g.pause(10_000); g.resume(25_000);   // 10s played, 15s hidden
    g.pause(35_000); g.resume(100_000);  // +10s played, 65s hidden
    assert.equal(g.elapsedSecs(120_000), 40); // 10+10+20s live after last resume
  });

  test('reset (new deal) clears any pause stamp', () => {
    const g = gameAt(0);
    g.pause(5_000);
    g.reset();
    assert.equal(g.pausedAt, null);
    assert.equal(g.gameOver, false);
  });
});
