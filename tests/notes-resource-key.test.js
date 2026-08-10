/**
 * Tests for the Notes ownership key — which spawn configs may only
 * ever have one window.
 * Run with: node --test tests/notes-resource-key.test.js
 *
 * The decision is deliberately narrow: editor + non-empty string path,
 * compared verbatim. Anything looser would either merge two genuinely
 * different notes into one window or let two editors autosave over each
 * other, and both failures are silent.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { notesResourceKey } from '../os/apps/notes/engine/resourceKey.js';

describe('editor configs own their path', () => {
  test('an editor config yields a stable, path-scoped key', () => {
    const key = notesResourceKey({ mode: 'editor', path: '/home/documents/a.txt' });
    assert.equal(key, 'notes:editor:/home/documents/a.txt');
    // Stable across calls — the whole dedupe rests on this.
    assert.equal(key, notesResourceKey({ mode: 'editor', path: '/home/documents/a.txt' }));
  });

  test('different paths yield different keys (concurrent editors stay legal)', () => {
    const a = notesResourceKey({ mode: 'editor', path: '/a.txt' });
    const b = notesResourceKey({ mode: 'editor', path: '/b.txt' });
    assert.notEqual(a, b);
  });

  test('extra config fields do not affect the key', () => {
    // _createNote adds autofocus:'title'; it must still dedupe against a
    // plain open of the same note.
    assert.equal(
      notesResourceKey({ mode: 'editor', path: '/a.txt', autofocus: 'title' }),
      notesResourceKey({ mode: 'editor', path: '/a.txt' }),
    );
  });
});

describe('library configs own nothing', () => {
  test('library mode is unkeyed even when a path is present', () => {
    // FilesApp spawns notes with a bare {path} — that opens the LIBRARY
    // with the note selected. Library windows hold no buffer and sync
    // via notes:changed, so several may coexist.
    assert.equal(notesResourceKey({ path: '/a.txt' }), null);
    assert.equal(notesResourceKey({ mode: 'library', path: '/a.txt' }), null);
  });

  test('an empty config is unkeyed', () => {
    assert.equal(notesResourceKey({}), null);
  });
});

describe('hostile and malformed configs', () => {
  test('missing, empty, or non-string paths are unkeyed', () => {
    // A key built from a non-path would collide every editor onto one
    // window, so these must refuse rather than coerce.
    for (const path of [undefined, null, '', 0, 42, {}, [], true]) {
      assert.equal(
        notesResourceKey({ mode: 'editor', path }),
        null,
        `path ${JSON.stringify(path)} must not produce a key`,
      );
    }
  });

  test('non-object configs are unkeyed', () => {
    for (const cfg of [undefined, null, 'editor', 42, [], true]) {
      assert.equal(notesResourceKey(cfg), null, `config ${JSON.stringify(cfg)}`);
    }
  });

  test('a near-miss mode does not count as editor', () => {
    assert.equal(notesResourceKey({ mode: 'Editor', path: '/a.txt' }), null);
    assert.equal(notesResourceKey({ mode: 'edit', path: '/a.txt' }), null);
  });

  test('paths are compared verbatim — no trim, no case fold', () => {
    // FileSystemService normalizes nothing, so these ARE different
    // files to it; merging them would focus a window editing a
    // different document.
    assert.notEqual(
      notesResourceKey({ mode: 'editor', path: '/a.txt' }),
      notesResourceKey({ mode: 'editor', path: ' /a.txt' }),
    );
    assert.notEqual(
      notesResourceKey({ mode: 'editor', path: '/A.txt' }),
      notesResourceKey({ mode: 'editor', path: '/a.txt' }),
    );
  });

  test('the key is namespaced so it cannot collide with another app', () => {
    assert.match(notesResourceKey({ mode: 'editor', path: '/a.txt' }), /^notes:editor:/);
  });
});
