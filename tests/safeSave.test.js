/**
 * Regression test for os/utils/safeSave.js — surfaces storage save
 * failures via console.warn + a single toast per session, instead of
 * the previous `try { kernel?.storage?.save(...) } catch {}` pattern
 * that silently dropped data when localStorage filled up.
 *
 * Why this matters: a user playing Solitaire whose localStorage fills
 * up was losing their saved game between every move with no UI signal.
 * The bug was load-bearing across solitaire/spider/mines/tarneeb/trix
 * — same pattern in 6 files.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { safeSave, _resetSafeSaveToastDedup } = await import('../os/utils/safeSave.js');

function makeKernel({ saveImpl } = {}) {
  const toasts = [];
  const warns = [];
  // Capture console.warn so the test stays quiet.
  const realWarn = console.warn;
  console.warn = (msg) => warns.push(msg);
  return {
    storage: {
      save: saveImpl || ((k, v) => { /* ok */ }),
    },
    emit: (type, data) => { if (type === 'toast') toasts.push(data); },
    _toasts: toasts,
    _warns: warns,
    _restore: () => { console.warn = realWarn; },
  };
}

describe('safeSave — happy path', () => {
  beforeEach(() => _resetSafeSaveToastDedup());

  test('returns true on successful save', () => {
    const k = makeKernel();
    const ok = safeSave(k, 'foo', { v: 1 }, 'foo data');
    k._restore();
    assert.equal(ok, true);
    assert.equal(k._toasts.length, 0);
    assert.equal(k._warns.length, 0);
  });

  test('returns false when kernel is null', () => {
    const ok = safeSave(null, 'foo', {}, 'foo data');
    assert.equal(ok, false);
  });

  test('returns false when kernel.storage is missing', () => {
    const ok = safeSave({}, 'foo', {}, 'foo data');
    assert.equal(ok, false);
  });
});

describe('safeSave — failure path', () => {
  beforeEach(() => _resetSafeSaveToastDedup());

  test('emits toast + warn on QuotaExceededError, returns false', () => {
    const k = makeKernel({
      saveImpl: () => { const e = new Error('Quota exceeded'); e.name = 'QuotaExceededError'; throw e; },
    });
    const ok = safeSave(k, 'foo', {}, 'Solitaire game');
    k._restore();
    assert.equal(ok, false);
    assert.equal(k._toasts.length, 1);
    assert.equal(k._toasts[0].type, 'error');
    assert.match(k._toasts[0].message, /Solitaire game/);
    assert.equal(k._warns.length, 1);
    assert.match(k._warns[0], /save failed for foo/);
  });

  test('dedupes toasts: second failure with same label is silent', () => {
    const k = makeKernel({
      saveImpl: () => { throw new Error('boom'); },
    });
    safeSave(k, 'foo', {}, 'Solitaire game');
    safeSave(k, 'foo', {}, 'Solitaire game');
    safeSave(k, 'foo', {}, 'Solitaire game');
    k._restore();
    // Only ONE toast — autosave loops would queue dozens otherwise.
    assert.equal(k._toasts.length, 1);
    // But each call still warns to console (helpful for debugging).
    assert.equal(k._warns.length, 3);
  });

  test('different labels each get one toast', () => {
    const k = makeKernel({
      saveImpl: () => { throw new Error('boom'); },
    });
    safeSave(k, 'a', {}, 'Solitaire game');
    safeSave(k, 'b', {}, 'Spider game');
    safeSave(k, 'c', {}, 'Mahjong stats');
    k._restore();
    assert.equal(k._toasts.length, 3);
    const messages = k._toasts.map(t => t.message);
    assert.match(messages[0], /Solitaire game/);
    assert.match(messages[1], /Spider game/);
    assert.match(messages[2], /Mahjong stats/);
  });
});
