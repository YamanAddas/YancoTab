/**
 * Tests for files/engine/state.js — decorateItem, decorateItems,
 * basename, dirname, formatBytes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  decorateItem, decorateItems, basename, dirname, formatBytes,
} from '../os/apps/files/engine/state.js';

const T = (y, m, d) => new Date(y, m, d, 12, 0).getTime();

function rawFile(over = {}) {
  return {
    type: 'file',
    path: over.path || '/home/Photos/sunset.png',
    content: over.content,
    meta: { size: 4096, created: T(2026, 4, 1), modified: T(2026, 4, 5), ...over.meta },
  };
}

function rawDir(path) {
  return { type: 'directory', path, meta: { created: T(2026, 4, 1), modified: T(2026, 4, 5) } };
}

describe('basename / dirname', () => {
  test('basename pulls last segment', () => {
    assert.equal(basename('/home/Photos/sunset.png'), 'sunset.png');
    assert.equal(basename('/single'), 'single');
    assert.equal(basename(''), '');
  });
  test('dirname returns parent path', () => {
    assert.equal(dirname('/home/Photos/sunset.png'), '/home/Photos');
    assert.equal(dirname('/sunset.png'), '/');
  });
});

describe('decorateItem', () => {
  test('rejects bad input', () => {
    assert.equal(decorateItem(null), null);
    assert.equal(decorateItem({ type: 'file' }), null); // no path
    assert.equal(decorateItem('hi'), null);
  });

  test('decorates a file with name/displayName/ext/category', () => {
    const d = decorateItem(rawFile());
    assert.equal(d.name, 'sunset.png');
    assert.equal(d.displayName, 'sunset');
    assert.equal(d.ext, 'png');
    assert.equal(d.category, 'img');
    assert.equal(d.size, 4096);
    assert.equal(d.isDir, false);
  });

  test('decorates a directory with category=directory', () => {
    const d = decorateItem(rawDir('/home/Photos'));
    assert.equal(d.name, 'Photos');
    assert.equal(d.displayName, 'Photos');
    assert.equal(d.ext, '');
    assert.equal(d.category, 'directory');
    assert.equal(d.isDir, true);
  });

  test('honors pinned Set', () => {
    const pinned = new Set(['/home/a.txt', '/home/b.txt']);
    assert.equal(decorateItem(rawFile({ path: '/home/a.txt' }), { pinned }).pinned, true);
    assert.equal(decorateItem(rawFile({ path: '/home/c.txt' }), { pinned }).pinned, false);
  });

  test('falls back to content length when meta.size missing', () => {
    const raw = {
      type: 'file',
      path: '/x/hello.txt',
      content: 'hello',
      meta: { created: 0, modified: 0 },
    };
    const d = decorateItem(raw);
    assert.equal(d.size, 5);
  });

  test('modified falls back to created when missing', () => {
    const d = decorateItem(rawFile({ meta: { size: 0, created: 1234, modified: undefined } }));
    assert.equal(d.modified, 1234);
  });

  test('multi-dot name strips only the last extension', () => {
    const d = decorateItem(rawFile({ path: '/x/archive.tar.gz' }));
    assert.equal(d.name, 'archive.tar.gz');
    assert.equal(d.displayName, 'archive.tar');
    assert.equal(d.ext, 'gz');
  });

  test('hidden file with leading dot stays in name with no ext', () => {
    const d = decorateItem(rawFile({ path: '/home/.gitignore' }));
    assert.equal(d.name, '.gitignore');
    assert.equal(d.ext, '');
    assert.equal(d.displayName, '.gitignore');
  });
});

describe('decorateItems', () => {
  test('drops malformed entries', () => {
    const arr = [rawFile(), null, { type: 'file' }, rawDir('/home/Photos')];
    const out = decorateItems(arr);
    assert.equal(out.length, 2);
  });
  test('returns [] for non-array', () => {
    assert.deepEqual(decorateItems(null), []);
  });
});

describe('formatBytes', () => {
  test('formats by magnitude', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(500), '500 B');
    assert.equal(formatBytes(2048), '2 KB');
    assert.equal(formatBytes(4_300_000), '4.1 MB');
    assert.equal(formatBytes(2_500_000_000), '2.33 GB');
  });
  test('non-finite is 0 B', () => {
    assert.equal(formatBytes(NaN), '0 B');
    assert.equal(formatBytes(-50), '0 B');
  });
});
