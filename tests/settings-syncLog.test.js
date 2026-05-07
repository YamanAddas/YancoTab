/**
 * Tests for settings/engine/syncLog.js — pure buffer for sync events.
 *
 * Red-team rule: the buffer must NEVER capture event values, only
 * metadata. Test that explicitly.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { makeBuffer, record, formatEntry, shortKey, MAX_ENTRIES } from '../os/apps/settings/engine/syncLog.js';

const T0 = new Date(2026, 4, 7, 14, 32, 0).getTime();

describe('makeBuffer', () => {
  test('starts empty', () => {
    const b = makeBuffer();
    assert.deepEqual(b, { entries: [] });
  });
});

describe('record', () => {
  test('captures key, source, chunks, ok — never the values', () => {
    const b = record(makeBuffer(), {
      key: 'yancotab_notes_meta_v2',
      source: 'local',
      chunks: 2,
      // The shell may pass these through but record() ignores them:
      oldValue: { secret: 'note title shoulder-surfed' },
      newValue: { still: 'secret' },
    }, T0);
    assert.equal(b.entries.length, 1);
    const e = b.entries[0];
    assert.equal(e.key, 'notes-meta');
    assert.equal(e.source, 'local');
    assert.equal(e.chunks, 2);
    assert.equal(e.ok, true);
    // CRITICAL: no oldValue/newValue/secret on the entry.
    assert.equal('oldValue' in e, false);
    assert.equal('newValue' in e, false);
    assert.equal(JSON.stringify(e).includes('shoulder-surfed'), false);
  });

  test('latest-first ordering', () => {
    let b = makeBuffer();
    b = record(b, { key: 'a' }, T0);
    b = record(b, { key: 'b' }, T0 + 1000);
    b = record(b, { key: 'c' }, T0 + 2000);
    assert.deepEqual(b.entries.map((e) => e.key), ['c', 'b', 'a']);
  });

  test('caps at MAX_ENTRIES, drops oldest', () => {
    let b = makeBuffer();
    for (let i = 0; i < MAX_ENTRIES + 4; i++) {
      b = record(b, { key: `k${i}` }, T0 + i * 1000);
    }
    assert.equal(b.entries.length, MAX_ENTRIES);
    // Newest first, oldest dropped.
    assert.equal(b.entries[0].key, `k${MAX_ENTRIES + 3}`);
    assert.equal(b.entries[MAX_ENTRIES - 1].key, `k${4}`);
  });

  test('source defaults to local for unknown values', () => {
    const b = record(makeBuffer(), { key: 'a', source: 'martian' }, T0);
    assert.equal(b.entries[0].source, 'local');
  });

  test('remote source preserved', () => {
    const b = record(makeBuffer(), { key: 'a', source: 'remote' }, T0);
    assert.equal(b.entries[0].source, 'remote');
  });

  test('error event flags ok=false', () => {
    const b = record(makeBuffer(), { key: 'a', err: 'quota exceeded' }, T0);
    assert.equal(b.entries[0].ok, false);
    assert.equal(b.entries[0].err, 'quota exceeded');
  });

  test('drops events with missing/empty key', () => {
    const start = makeBuffer();
    assert.equal(record(start, null, T0), start);
    assert.equal(record(start, { key: '' }, T0), start);
    assert.equal(record(start, {}, T0), start);
  });

  test('chunks defaults to 1 when missing', () => {
    const b = record(makeBuffer(), { key: 'a' }, T0);
    assert.equal(b.entries[0].chunks, 1);
  });

  test('chunks normalizes to non-negative integer', () => {
    const b1 = record(makeBuffer(), { key: 'a', chunks: 2.7 }, T0);
    assert.equal(b1.entries[0].chunks, 2);
    const b2 = record(makeBuffer(), { key: 'a', chunks: -5 }, T0);
    assert.equal(b2.entries[0].chunks, 0);
  });

  test('error message capped at 80 chars', () => {
    const long = 'x'.repeat(200);
    const b = record(makeBuffer(), { key: 'a', err: long }, T0);
    assert.equal(b.entries[0].err.length, 80);
  });
});

describe('shortKey', () => {
  test('strips yancotab prefix and version suffix', () => {
    assert.equal(shortKey('yancotab_notes_meta_v2'), 'notes-meta');
    assert.equal(shortKey('yancotab_pomodoro_settings_v1'), 'pomodoro-settings');
    assert.equal(shortKey('yancotab_browser_v2'), 'browser');
  });

  test('keys without prefix pass through with underscores normalized', () => {
    assert.equal(shortKey('yancotabSearchEngine'), 'searchengine');
  });

  test('handles non-string input', () => {
    assert.equal(shortKey(null), '');
    assert.equal(shortKey(undefined), '');
    assert.equal(shortKey(42), '');
  });

  test('long keys truncated at 40 chars', () => {
    const long = 'yancotab_' + 'a'.repeat(60);
    const out = shortKey(long);
    assert.ok(out.length <= 40);
  });
});

describe('formatEntry', () => {
  test('renders push line with check', () => {
    const out = formatEntry({ ts: T0, key: 'notes-meta', source: 'local', chunks: 2, ok: true });
    assert.match(out, /^14:32:00\s+push\s+notes-meta\s+2 chunks\s+✓$/);
  });

  test('renders pull line with single chunk', () => {
    const out = formatEntry({ ts: T0, key: 'todo', source: 'remote', chunks: 1, ok: true });
    assert.match(out, /pull\s+todo\s+1 chunk\s+✓/);
  });

  test('renders error with cross', () => {
    const out = formatEntry({ ts: T0, key: 'a', source: 'local', chunks: 1, ok: false });
    assert.match(out, /✗$/);
  });

  test('null entry → empty string', () => {
    assert.equal(formatEntry(null), '');
  });
});
