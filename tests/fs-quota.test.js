/**
 * fs-quota.test.js — the virtual filesystem must not lose data when
 * localStorage is full.
 * Run with: node --test tests/fs-quota.test.js
 *
 * Before v1.10.7 every FS write funnelled through a _save() that
 * swallowed QuotaExceededError and returned undefined, while write()
 * returned `true` unconditionally — so a note autosave, a file create
 * or a PDF import was reported as saved when nothing had been written.
 * The `yancotab:storage-full` event it dispatched had no listener
 * anywhere in the repo, so nothing surfaced either.
 *
 * rename() was worse than silent: it is copy-then-delete, so a refused
 * copy left the destination missing AND removed the source. A full disk
 * destroyed the file outright. That case is the reason this suite
 * exists; the rest guards the reporting contract around it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── localStorage mock with a quota switch ──────────────────────────
let _store;
let _full = false;               // when true, every setItem is refused
function resetStore() { _store = new Map(); _full = false; }

function quotaError() {
  const e = new Error('QuotaExceededError');
  e.name = 'QuotaExceededError';
  e.code = 22;
  return e;
}

globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => { if (_full) throw quotaError(); _store.set(k, String(v)); },
  removeItem: (k) => _store.delete(k),
  clear: () => _store.clear(),
  get length() { return _store.size; },
  key: (i) => [..._store.keys()][i] ?? null,
};

const dispatched = [];
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
globalThis.window = { dispatchEvent: (e) => { dispatched.push(e); return true; } };

const { FileSystemService } = await import('../os/services/fileSystemService.js');

function makeFs() {
  resetStore();
  dispatched.length = 0;
  const fs = new FileSystemService();
  fs.init();
  return fs;
}

describe('write() reports the truth', () => {
  test('returns true when the write lands', () => {
    const fs = makeFs();
    assert.equal(fs.write('/home/documents/a.txt', 'hello'), true);
    assert.equal(fs.read('/home/documents/a.txt').content, 'hello');
  });

  test('returns FALSE when storage is full', () => {
    const fs = makeFs();
    _full = true;
    assert.equal(fs.write('/home/documents/a.txt', 'hello'), false);
  });

  test('a refused write really did not persist', () => {
    // The old code returned true here, so callers believed a file
    // existed that was never written.
    const fs = makeFs();
    _full = true;
    fs.write('/home/documents/ghost.txt', 'hello');
    _full = false;
    assert.equal(fs.exists('/home/documents/ghost.txt'), false);
    assert.equal(fs.read('/home/documents/ghost.txt'), null);
  });

  test('a refused write dispatches yancotab:storage-full', () => {
    const fs = makeFs();
    _full = true;
    fs.write('/home/documents/a.txt', 'x');
    const evt = dispatched.find((e) => e.type === 'yancotab:storage-full');
    assert.ok(evt, 'storage-full must be dispatched so the shell can toast');
    assert.equal(evt.detail.path, '/home/documents/a.txt');
  });

  test('a successful write dispatches nothing', () => {
    const fs = makeFs();
    fs.write('/home/documents/a.txt', 'x');
    assert.equal(dispatched.filter((e) => e.type === 'yancotab:storage-full').length, 0);
  });
});

describe('rename() must never destroy the source', () => {
  test('a refused copy aborts and leaves the original intact', () => {
    // THE regression. Copy-then-delete + a refused copy = data gone.
    const fs = makeFs();
    fs.write('/home/documents/keep.txt', 'precious');
    _full = true;

    assert.throws(() => fs.rename('/home/documents/keep.txt', '/home/documents/moved.txt'),
      /Storage full/);

    _full = false;
    assert.equal(fs.exists('/home/documents/keep.txt'), true, 'source must survive');
    assert.equal(fs.read('/home/documents/keep.txt').content, 'precious');
    assert.equal(fs.exists('/home/documents/moved.txt'), false);
  });

  test('a directory rename aborts without deleting the child it could not copy', () => {
    const fs = makeFs();
    fs.mkdir('/home/documents/dir');
    fs.write('/home/documents/dir/child.txt', 'data');
    _full = true;

    assert.throws(() => fs.rename('/home/documents/dir', '/home/documents/dir2'), /Storage full/);

    _full = false;
    assert.equal(fs.exists('/home/documents/dir/child.txt'), true,
      'the child whose copy was refused must not be deleted');
    assert.equal(fs.read('/home/documents/dir/child.txt').content, 'data');
  });

  test('a normal rename still moves and removes the source', () => {
    const fs = makeFs();
    fs.write('/home/documents/a.txt', 'body');
    fs.rename('/home/documents/a.txt', '/home/documents/b.txt');
    assert.equal(fs.exists('/home/documents/a.txt'), false);
    assert.equal(fs.read('/home/documents/b.txt').content, 'body');
    assert.equal(fs.read('/home/documents/b.txt').path, '/home/documents/b.txt');
  });

  test('a normal directory rename still moves its children', () => {
    const fs = makeFs();
    fs.mkdir('/home/documents/dir');
    fs.write('/home/documents/dir/child.txt', 'data');
    fs.rename('/home/documents/dir', '/home/documents/dir2');
    assert.equal(fs.exists('/home/documents/dir/child.txt'), false);
    assert.equal(fs.read('/home/documents/dir2/child.txt').content, 'data');
  });
});

describe('mkdir() reports the truth', () => {
  test('true when created, true when already present', () => {
    const fs = makeFs();
    assert.equal(fs.mkdir('/home/documents/new'), true);
    assert.equal(fs.mkdir('/home/documents/new'), true);
  });

  test('false when storage is full', () => {
    const fs = makeFs();
    _full = true;
    assert.equal(fs.mkdir('/home/documents/nope'), false);
  });
});

describe('non-quota failures', () => {
  test('a generic write error also returns false, without a storage-full event', () => {
    // A serialization/security failure is not a full disk; reporting it
    // as one would send the user chasing the wrong problem.
    const fs = makeFs();
    const original = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => { throw new Error('SecurityError'); };
    try {
      assert.equal(fs.write('/home/documents/a.txt', 'x'), false);
      assert.equal(dispatched.filter((e) => e.type === 'yancotab:storage-full').length, 0);
    } finally {
      globalThis.localStorage.setItem = original;
    }
  });
});

describe('the shell listens for the event', () => {
  test('mobileShell bridges yancotab:storage-full to a toast', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../os/ui/mobileShell.js', import.meta.url), 'utf8');
    assert.match(src, /addEventListener\('yancotab:storage-full'/,
      'the storage-full event must have a listener — it had none for its whole life');
    // Must be an alert-severity toast: v1.10.5 exempts those from
    // Pomodoro's auto-mute, and a swallowed data-loss warning is the
    // exact failure this fix exists to prevent.
    const bridge = src.slice(src.indexOf("addEventListener('yancotab:storage-full'"));
    assert.match(bridge.slice(0, 400), /type:\s*'error'/,
      'the storage-full toast must be an error so the Pomodoro mute cannot hide it');
  });
});
