/**
 * Tests for the Table salon presets registry.
 * Run with: node --test tests/table-presets.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidPreset,
  validatePack,
  applyPreset,
  makePreset,
} from '../os/apps/games/table/presets.js';
import TARNEEB_PRESETS from '../os/apps/games/tarneeb/tarneebPresets.js';

describe('isValidPreset', () => {
  test('rejects non-objects', () => {
    assert.equal(isValidPreset(null), false);
    assert.equal(isValidPreset(undefined), false);
    assert.equal(isValidPreset('string'), false);
    assert.equal(isValidPreset(42), false);
  });

  test('rejects missing fields', () => {
    assert.equal(isValidPreset({}), false);
    assert.equal(isValidPreset({ id: 'a' }), false);
    assert.equal(isValidPreset({ id: 'a', name: 'A' }), false);
    assert.equal(isValidPreset({ id: 'a', name: 'A', gameId: 'g' }), false);
  });

  test('accepts well-formed preset', () => {
    const ok = {
      id: 'a',
      name: 'A',
      gameId: 'tarneeb',
      apply: () => {},
    };
    assert.equal(isValidPreset(ok), true);
  });
});

describe('validatePack', () => {
  test('rejects empty array', () => {
    assert.equal(validatePack([]), false);
  });

  test('rejects non-array', () => {
    assert.equal(validatePack(null), false);
    assert.equal(validatePack({}), false);
  });

  test('rejects pack with duplicate ids', () => {
    const pack = [
      { id: 'a', name: 'A', gameId: 'tarneeb', apply: () => {} },
      { id: 'a', name: 'B', gameId: 'tarneeb', apply: () => {} },
    ];
    assert.equal(validatePack(pack), false);
  });

  test('accepts valid pack', () => {
    assert.equal(validatePack(TARNEEB_PRESETS), true);
  });
});

describe('applyPreset', () => {
  test('returns false for unknown preset id', () => {
    const dispatched = [];
    const dispatch = (a) => dispatched.push(a);
    const result = applyPreset(TARNEEB_PRESETS, 'nonexistent', dispatch);
    assert.equal(result, false);
    assert.equal(dispatched.length, 0);
  });

  test('dispatches the preset action when found', () => {
    const dispatched = [];
    const dispatch = (a) => dispatched.push(a);
    const result = applyPreset(TARNEEB_PRESETS, 'damascus', dispatch);
    assert.equal(result, true);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].type, 'START_MATCH');
    assert.equal(dispatched[0].difficulty, 'hard');
  });

  test('returns false if preset apply throws', () => {
    const broken = [{
      id: 'broken',
      name: 'broken',
      gameId: 'tarneeb',
      apply: () => { throw new Error('oops'); },
    }];
    const dispatch = () => {};
    assert.equal(applyPreset(broken, 'broken', dispatch), false);
  });
});

describe('makePreset', () => {
  test('builds a preset that dispatches the configured action', () => {
    const p = makePreset({
      id: 'test',
      name: 'Test',
      gameId: 'tarneeb',
      action: { type: 'START_MATCH', difficulty: 'easy' },
    });
    const dispatched = [];
    p.apply((a) => dispatched.push(a));
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].type, 'START_MATCH');
    assert.equal(dispatched[0].difficulty, 'easy');
  });

  test('throws if required fields missing', () => {
    assert.throws(() => makePreset({}));
    assert.throws(() => makePreset({ id: 'a' }));
    assert.throws(() => makePreset({ id: 'a', name: 'A', gameId: 'g' }));
  });
});

describe('Tarneeb pack contents', () => {
  test('has 3 presets', () => {
    assert.equal(TARNEEB_PRESETS.length, 3);
  });

  test('all map to gameId tarneeb', () => {
    for (const p of TARNEEB_PRESETS) {
      assert.equal(p.gameId, 'tarneeb');
    }
  });

  test('each preset dispatches START_MATCH with a valid difficulty', () => {
    const validDifficulties = new Set(['easy', 'moderate', 'hard']);
    for (const p of TARNEEB_PRESETS) {
      const dispatched = [];
      p.apply((a) => dispatched.push(a));
      assert.equal(dispatched.length, 1, `${p.id} should dispatch one action`);
      assert.equal(dispatched[0].type, 'START_MATCH');
      assert.ok(validDifficulties.has(dispatched[0].difficulty),
        `${p.id} difficulty=${dispatched[0].difficulty} should be valid`);
    }
  });

  test('preset ids are unique', () => {
    const ids = TARNEEB_PRESETS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
