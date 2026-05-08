/**
 * Tests for files/engine/fileType.js — extOf, categoryOf, fuelBucketOf, iconOf.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { extOf, categoryOf, fuelBucketOf, iconOf, CATEGORIES } from '../os/apps/files/engine/fileType.js';

describe('extOf', () => {
  test('returns lowercase extension', () => {
    assert.equal(extOf('foo.PNG'), 'png');
    assert.equal(extOf('Bar.HEIC'), 'heic');
  });
  test('returns "" when no dot or weird placement', () => {
    assert.equal(extOf('readme'), '');
    assert.equal(extOf('.gitignore'), ''); // dot at index 0
    assert.equal(extOf('trailing.'), ''); // dot at last position
    assert.equal(extOf(''), '');
    assert.equal(extOf(null), '');
  });
  test('handles multi-dot names', () => {
    assert.equal(extOf('archive.tar.gz'), 'gz');
  });
});

describe('categoryOf', () => {
  test('docs', () => {
    for (const e of ['txt', 'md', 'pdf', 'docx', 'csv', 'epub']) {
      assert.equal(categoryOf(`x.${e}`), 'docs', e);
    }
  });
  test('img', () => {
    for (const e of ['png', 'jpg', 'jpeg', 'webp', 'svg', 'heic']) {
      assert.equal(categoryOf(`x.${e}`), 'img', e);
    }
  });
  test('video', () => {
    for (const e of ['mp4', 'mov', 'webm', 'mkv']) {
      assert.equal(categoryOf(`x.${e}`), 'video', e);
    }
  });
  test('audio', () => {
    for (const e of ['mp3', 'wav', 'flac', 'm4a']) {
      assert.equal(categoryOf(`x.${e}`), 'audio', e);
    }
  });
  test('code', () => {
    for (const e of ['js', 'ts', 'py', 'rs', 'go', 'json', 'yaml', 'sh', 'css']) {
      assert.equal(categoryOf(`x.${e}`), 'code', e);
    }
  });
  test('archive', () => {
    for (const e of ['zip', 'tar', 'gz', '7z', 'rar']) {
      assert.equal(categoryOf(`x.${e}`), 'archive', e);
    }
  });
  test('other for unknown extensions', () => {
    assert.equal(categoryOf('x.xyz'), 'other');
    assert.equal(categoryOf('readme'), 'other');
    assert.equal(categoryOf(''), 'other');
  });
});

describe('fuelBucketOf', () => {
  test('docs/img/video pass through', () => {
    assert.equal(fuelBucketOf('docs'), 'docs');
    assert.equal(fuelBucketOf('img'), 'img');
    assert.equal(fuelBucketOf('video'), 'video');
  });
  test('audio/code/archive collapse to other', () => {
    assert.equal(fuelBucketOf('audio'), 'other');
    assert.equal(fuelBucketOf('code'), 'other');
    assert.equal(fuelBucketOf('archive'), 'other');
    assert.equal(fuelBucketOf('other'), 'other');
    assert.equal(fuelBucketOf('directory'), 'other');
  });
});

describe('iconOf', () => {
  test('returns a non-empty emoji per category', () => {
    const seen = new Set();
    for (const ext of ['x.txt', 'x.png', 'x.mp4', 'x.mp3', 'x.js', 'x.zip', 'x.xyz']) {
      const icon = iconOf(ext);
      assert.ok(typeof icon === 'string' && icon.length > 0, `icon for ${ext}`);
      seen.add(icon);
    }
    // At least 5 distinct icons across the 7 categories tested
    assert.ok(seen.size >= 5);
  });
});

describe('CATEGORIES', () => {
  test('has the expected slugs', () => {
    assert.deepEqual([...CATEGORIES].sort(),
      ['archive', 'audio', 'code', 'docs', 'img', 'other', 'video']);
  });
});
