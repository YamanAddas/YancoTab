/**
 * Tests for settings/engine/rituals.js — pure ritual definitions +
 * atomic apply with rollback.
 *
 * Red-team-driven: the must-pass test is "partial failure rolls back
 * all prior writes". A ritual that writes to N keys and fails on the
 * Nth must restore the first N-1 from snapshot.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  RITUALS, listRituals, getRitual, apply, computeNextValue,
} from '../os/apps/settings/engine/rituals.js';

function makeFakeStorage(initial = {}, opts = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  return {
    load: (key) => {
      if (opts.failLoadKey === key) throw new Error('load-fail');
      return data.has(key) ? data.get(key) : null;
    },
    save: (key, value) => {
      if (opts.failSaveKey === key) throw new Error('save-fail');
      writes.push({ key, value });
      data.set(key, value);
    },
    snapshot: () => Object.fromEntries(data),
    writes,
  };
}

describe('ritual definitions', () => {
  test('all 3 rituals exist with required fields', () => {
    for (const id of ['night', 'focus', 'weekend']) {
      const r = RITUALS[id];
      assert.ok(r, `missing ${id}`);
      assert.equal(typeof r.name, 'string');
      assert.equal(typeof r.shortcut, 'string');
      assert.ok(Array.isArray(r.writes));
    }
  });

  test('listRituals returns 3 entries in stable order', () => {
    const ids = listRituals().map((r) => r.id);
    assert.deepEqual(ids, ['night', 'focus', 'weekend']);
  });

  test('getRitual returns null for unknown', () => {
    assert.equal(getRitual('lol'), null);
    assert.equal(getRitual(undefined), null);
  });

  test('night ritual targets only registered storage keys', () => {
    const keys = RITUALS.night.writes.map((w) => w.key);
    assert.ok(keys.includes('yancotab_theme_mode'));
    assert.ok(keys.includes('yancotab_pomodoro_settings_v1'));
  });
});

describe('computeNextValue', () => {
  test('value override replaces current', () => {
    assert.equal(computeNextValue({ value: 'dark' }, 'light'), 'dark');
  });

  test('mergeRoot shallow-merges into current object', () => {
    const out = computeNextValue({ mergeRoot: { activePresetId: 'classic' } }, { activePresetId: 'sprint', other: 'keep' });
    assert.equal(out.activePresetId, 'classic');
    assert.equal(out.other, 'keep');
  });

  test('mergeRoot on null current creates new object', () => {
    const out = computeNextValue({ mergeRoot: { x: 1 } }, null);
    assert.deepEqual(out, { x: 1 });
  });

  test('mergeAmbient shallow-merges into current.ambient', () => {
    const out = computeNextValue(
      { mergeAmbient: { autoMute: true } },
      { activePresetId: 'classic', ambient: { drone: true, autoMute: false, nightShell: false } },
    );
    assert.equal(out.activePresetId, 'classic');
    assert.equal(out.ambient.drone, true);     // preserved
    assert.equal(out.ambient.autoMute, true);  // overwritten
    assert.equal(out.ambient.nightShell, false);
  });

  test('mergeAmbient on null current creates ambient object', () => {
    const out = computeNextValue({ mergeAmbient: { autoMute: true } }, null);
    assert.deepEqual(out, { ambient: { autoMute: true } });
  });

  test('write with no value/merge → returns current unchanged', () => {
    assert.equal(computeNextValue({}, 'orig'), 'orig');
    assert.equal(computeNextValue(null, 'orig'), 'orig');
  });
});

describe('apply — happy path', () => {
  test('night ritual writes both keys', () => {
    const storage = makeFakeStorage({
      yancotab_theme_mode: 'light',
      yancotab_pomodoro_settings_v1: { ambient: { autoMute: false, nightShell: false } },
    });
    const result = apply(RITUALS.night, storage);
    assert.equal(result.ok, true);
    assert.deepEqual(result.applied, ['yancotab_theme_mode', 'yancotab_pomodoro_settings_v1']);
    assert.equal(storage.snapshot().yancotab_theme_mode, 'dark');
    assert.equal(storage.snapshot().yancotab_pomodoro_settings_v1.ambient.autoMute, true);
    assert.equal(storage.snapshot().yancotab_pomodoro_settings_v1.ambient.nightShell, true);
  });

  test('focus ritual sets pomodoro preset', () => {
    const storage = makeFakeStorage({
      yancotab_pomodoro_settings_v1: { activePresetId: 'sprint' },
    });
    const result = apply(RITUALS.focus, storage);
    assert.equal(result.ok, true);
    assert.equal(storage.snapshot().yancotab_pomodoro_settings_v1.activePresetId, 'classic');
  });

  test('weekend ritual sets theme to auto', () => {
    const storage = makeFakeStorage({ yancotab_theme_mode: 'dark' });
    const result = apply(RITUALS.weekend, storage);
    assert.equal(result.ok, true);
    assert.equal(storage.snapshot().yancotab_theme_mode, 'auto');
  });
});

describe('apply — atomicity and rollback', () => {
  test('failure on second write rolls back the first', () => {
    const storage = makeFakeStorage(
      { yancotab_theme_mode: 'light', yancotab_pomodoro_settings_v1: null },
      { failSaveKey: 'yancotab_pomodoro_settings_v1' },
    );
    const result = apply(RITUALS.night, storage);
    assert.equal(result.ok, false);
    assert.equal(result.restored, true);
    // Theme should be restored to its snapshot value.
    assert.equal(storage.snapshot().yancotab_theme_mode, 'light');
  });

  test('failure on first write means no writes survive', () => {
    const storage = makeFakeStorage(
      { yancotab_theme_mode: 'light' },
      { failSaveKey: 'yancotab_theme_mode' },
    );
    const result = apply(RITUALS.night, storage);
    assert.equal(result.ok, false);
    // Theme stays at the original snapshot value.
    assert.equal(storage.snapshot().yancotab_theme_mode, 'light');
  });

  test('rollback writes happen even if rollback itself fails on one key', () => {
    // Snapshot succeeds; first apply succeeds; second apply throws;
    // rollback of first is requested. If we contrive rollback to fail,
    // the function still returns ok:false and reports restored:false.
    let savesSeen = 0;
    const storage = {
      load: () => 'snap',
      save: (key) => {
        savesSeen++;
        // First save: write of theme_mode → succeeds
        // Second save: write of pomodoro → throws
        // Third save: rollback of theme_mode → throws too
        if (savesSeen === 2 || savesSeen === 3) throw new Error('boom');
      },
    };
    const result = apply(RITUALS.night, storage);
    assert.equal(result.ok, false);
    assert.equal(result.restored, false);
  });

  test('snapshot failure aborts before any write', () => {
    const storage = makeFakeStorage({}, { failLoadKey: 'yancotab_theme_mode' });
    const result = apply(RITUALS.night, storage);
    assert.equal(result.ok, false);
    assert.match(result.error, /snapshot failed/);
    // No writes at all.
    assert.equal(storage.writes.length, 0);
  });

  test('null/invalid ritual rejected', () => {
    const storage = makeFakeStorage({});
    assert.equal(apply(null, storage).ok, false);
    assert.equal(apply({}, storage).ok, false);
    assert.equal(apply({ writes: 'nope' }, storage).ok, false);
  });

  test('null/invalid storage rejected', () => {
    assert.equal(apply(RITUALS.night, null).ok, false);
    assert.equal(apply(RITUALS.night, {}).ok, false);
    assert.equal(apply(RITUALS.night, { load: () => null }).ok, false); // missing save
  });
});
