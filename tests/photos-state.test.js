/**
 * Tests for photos/engine/state.js — decoratePhoto, monthKey, EXIF.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  decoratePhoto,
  decoratePhotos,
  buildExif,
  toMonthKey,
  toMonthLabel,
  fromMonthKey,
} from '../os/apps/photos/engine/state.js';

function raw(over = {}) {
  return {
    id: over.id || 'p1',
    path: over.path || '/home/photos/a.png',
    name: over.name,
    dataUrl: over.dataUrl || 'data:image/png;base64,xxx',
    thumbnail: over.thumbnail || 'data:image/png;base64,thumb',
    width: over.width ?? 800,
    height: over.height ?? 600,
    size: over.size ?? 12345,
    mime: over.mime || 'image/png',
    created: over.created ?? new Date(2026, 3, 14, 18, 14).getTime(),
    modified: over.modified ?? new Date(2026, 3, 14, 18, 14).getTime(),
    ...over.extra,
  };
}

describe('decoratePhoto', () => {
  test('returns null for non-objects', () => {
    assert.equal(decoratePhoto(null), null);
    assert.equal(decoratePhoto(undefined), null);
    assert.equal(decoratePhoto('hi'), null);
    assert.equal(decoratePhoto(42), null);
  });

  test('returns null when path is missing', () => {
    assert.equal(decoratePhoto({ id: 'x' }), null);
  });

  test('decorates a basic record with derived fields', () => {
    const d = decoratePhoto(raw());
    assert.equal(d.path, '/home/photos/a.png');
    assert.equal(d.name, 'a.png');
    assert.equal(d.displayName, 'a');
    assert.equal(d.monthKey, '2026-04');
    assert.equal(d.monthLabel, 'April 2026');
    assert.equal(d.favorite, false);
  });

  test('uses provided name when present', () => {
    const d = decoratePhoto(raw({ name: 'Sunset.JPG' }));
    assert.equal(d.name, 'Sunset.JPG');
    assert.equal(d.displayName, 'Sunset');
  });

  test('honors favorites Set', () => {
    const favs = new Set(['/home/photos/a.png', '/home/photos/x.png']);
    const d = decoratePhoto(raw(), { favorites: favs });
    assert.equal(d.favorite, true);

    const d2 = decoratePhoto(raw({ path: '/home/photos/b.png' }), { favorites: favs });
    assert.equal(d2.favorite, false);
  });

  test('falls back to raw.favorite when no Set is given', () => {
    const d = decoratePhoto({ ...raw(), favorite: true });
    assert.equal(d.favorite, true);
  });

  test('handles missing or non-finite created', () => {
    const d = decoratePhoto({ ...raw(), created: undefined, modified: undefined });
    assert.equal(d.created, 0);
    assert.equal(d.monthKey, '');
    assert.equal(d.monthLabel, '');
  });

  test('strips multi-letter extensions from displayName', () => {
    assert.equal(decoratePhoto(raw({ name: 'foo.jpeg' })).displayName, 'foo');
    assert.equal(decoratePhoto(raw({ name: 'bar.HEIC' })).displayName, 'bar');
    assert.equal(decoratePhoto(raw({ name: 'baz' })).displayName, 'baz');
  });

  test('basenames a path that lacks a name', () => {
    const d = decoratePhoto(raw({ path: '/home/photos/sub/dir/foo.png', name: undefined }));
    assert.equal(d.name, 'foo.png');
    assert.equal(d.displayName, 'foo');
  });
});

describe('decoratePhotos', () => {
  test('returns [] for non-arrays', () => {
    assert.deepEqual(decoratePhotos(null), []);
    assert.deepEqual(decoratePhotos({}), []);
  });

  test('drops malformed entries silently', () => {
    const arr = [raw({ path: '/a.png' }), null, { id: 'noPath' }, raw({ path: '/b.png' })];
    const out = decoratePhotos(arr);
    assert.equal(out.length, 2);
    assert.equal(out[0].path, '/a.png');
    assert.equal(out[1].path, '/b.png');
  });
});

describe('buildExif', () => {
  test('emits dimensions only when both > 0', () => {
    const e = buildExif(raw());
    assert.ok(e.find((x) => x.k === 'Dimensions' && x.v === '800 × 600'));

    const e2 = buildExif(raw({ width: 0, height: 600 }));
    assert.ok(!e2.find((x) => x.k === 'Dimensions'));
  });

  test('formats size as KB / MB / GB', () => {
    const small = buildExif(raw({ size: 500 }));
    assert.equal(small.find((x) => x.k === 'Size').v, '500 B');

    const kb = buildExif(raw({ size: 12345 }));
    assert.equal(kb.find((x) => x.k === 'Size').v, '12 KB');

    const mb = buildExif(raw({ size: 4_300_000 }));
    assert.equal(mb.find((x) => x.k === 'Size').v, '4.1 MB');

    const gb = buildExif(raw({ size: 2_500_000_000 }));
    assert.equal(gb.find((x) => x.k === 'Size').v, '2.33 GB');
  });

  test('Format chip strips image/ prefix and uppercases', () => {
    assert.equal(buildExif(raw()).find((x) => x.k === 'Format').v, 'PNG');
    assert.equal(buildExif(raw({ mime: 'image/jpeg' })).find((x) => x.k === 'Format').v, 'JPEG');
  });

  test('does NOT synthesize camera/lens/iso when missing', () => {
    const e = buildExif(raw());
    for (const k of ['Camera', 'Lens', 'Iso', 'Shutter', 'Aperture']) {
      assert.equal(e.find((x) => x.k === k), undefined,
        `should not emit ${k} when source has no value`);
    }
  });

  test('emits camera/lens/iso when source provides them', () => {
    const e = buildExif(raw({ extra: { camera: 'iPhone 14', lens: '26mm', iso: '200' } }));
    assert.equal(e.find((x) => x.k === 'Camera').v, 'iPhone 14');
    assert.equal(e.find((x) => x.k === 'Lens').v, '26mm');
    assert.equal(e.find((x) => x.k === 'Iso').v, '200');
  });

  test('returns [] for non-objects', () => {
    assert.deepEqual(buildExif(null), []);
    assert.deepEqual(buildExif(undefined), []);
  });
});

describe('toMonthKey / toMonthLabel / fromMonthKey', () => {
  test('round-trip on a typical date', () => {
    const ts = new Date(2026, 3, 14).getTime();
    assert.equal(toMonthKey(ts), '2026-04');
    assert.equal(toMonthLabel(ts), 'April 2026');
    assert.deepEqual(fromMonthKey('2026-04'), { year: 2026, month: 3, label: 'April 2026' });
  });

  test('pads single-digit months to two digits', () => {
    const jan = new Date(2025, 0, 1).getTime();
    assert.equal(toMonthKey(jan), '2025-01');
  });

  test('fromMonthKey rejects malformed strings', () => {
    assert.equal(fromMonthKey('2026-13'), null);
    assert.equal(fromMonthKey('2026-00'), null);
    assert.equal(fromMonthKey('not-a-date'), null);
    assert.equal(fromMonthKey(''), null);
    assert.equal(fromMonthKey(null), null);
  });
});
