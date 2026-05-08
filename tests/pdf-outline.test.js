/**
 * Tests for pdf/engine/outline.js — flattenOutline, annotateWithPages,
 * destToKey.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  flattenOutline, annotateWithPages, destToKey,
} from '../os/apps/pdf/engine/outline.js';

describe('flattenOutline', () => {
  test('returns [] for non-array input', () => {
    assert.deepEqual(flattenOutline(null), []);
    assert.deepEqual(flattenOutline(undefined), []);
    assert.deepEqual(flattenOutline('hi'), []);
  });

  test('flattens a one-level tree', () => {
    const tree = [
      { title: 'Preface', dest: 'pref' },
      { title: 'Chapter 1', dest: 'c1' },
    ];
    const out = flattenOutline(tree);
    assert.equal(out.length, 2);
    assert.equal(out[0].title, 'Preface');
    assert.equal(out[0].depth, 0);
    assert.equal(out[1].title, 'Chapter 1');
  });

  test('recursively walks children with increasing depth', () => {
    const tree = [
      {
        title: 'Ch 2', dest: 'c2', items: [
          { title: '2.1 A', dest: 'a' },
          { title: '2.2 B', dest: 'b', items: [{ title: '2.2.1', dest: 'b1' }] },
        ],
      },
    ];
    const out = flattenOutline(tree);
    assert.deepEqual(out.map((x) => [x.title, x.depth]), [
      ['Ch 2', 0],
      ['2.1 A', 1],
      ['2.2 B', 1],
      ['2.2.1', 2],
    ]);
  });

  test('skips entries with empty/non-string title but descends', () => {
    const tree = [
      { title: '', items: [{ title: 'Real child', dest: 'x' }] },
      { title: 12, dest: 'wrong' },
    ];
    const out = flattenOutline(tree);
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'Real child');
    assert.equal(out[0].depth, 0);
  });

  test('hasChildren reflects items presence', () => {
    const tree = [
      { title: 'Leaf', dest: 'a' },
      { title: 'Parent', dest: 'p', items: [{ title: 'Child', dest: 'c' }] },
    ];
    const out = flattenOutline(tree);
    const leaf = out.find((x) => x.title === 'Leaf');
    const parent = out.find((x) => x.title === 'Parent');
    assert.equal(leaf.hasChildren, false);
    assert.equal(parent.hasChildren, true);
  });

  test('truncates ridiculously long titles', () => {
    const long = 'X'.repeat(500);
    const out = flattenOutline([{ title: long, dest: 'x' }]);
    assert.ok(out[0].title.length <= 240);
  });

  test('caps recursion depth so a malicious nested tree cannot blow the stack', () => {
    // Build 50-deep nesting; flattener should bail at MAX_DEPTH=6.
    let node = { title: 'leaf', dest: 'x' };
    for (let i = 0; i < 50; i++) node = { title: 'wrap ' + i, items: [node] };
    const out = flattenOutline([node]);
    assert.ok(out.every((x) => x.depth <= 6));
  });
});

describe('destToKey', () => {
  test('named destination → name:<dest>', () => {
    assert.equal(destToKey('intro'), 'name:intro');
  });

  test('ref-array destination uses num.gen', () => {
    assert.equal(destToKey([{ num: 12, gen: 0 }, { name: 'XYZ' }, 0, 700, 0]), 'ref:12.0');
    assert.equal(destToKey([{ num: 7, gen: 2 }]), 'ref:7.2');
  });

  test('returns null for unsupported shapes', () => {
    assert.equal(destToKey(null), null);
    assert.equal(destToKey(''), null);
    assert.equal(destToKey([]), null);
    assert.equal(destToKey([{ foo: 'bar' }]), null);
    assert.equal(destToKey(42), null);
  });
});

describe('annotateWithPages', () => {
  test('attaches page numbers from a Map', () => {
    const flat = flattenOutline([
      { title: 'A', dest: 'a' },
      { title: 'B', dest: [{ num: 3, gen: 0 }] },
    ]);
    const map = new Map([['name:a', 1], ['ref:3.0', 42]]);
    const out = annotateWithPages(flat, map);
    assert.equal(out[0].page, 1);
    assert.equal(out[1].page, 42);
  });

  test('accepts a plain object too', () => {
    const flat = flattenOutline([{ title: 'A', dest: 'a' }]);
    const out = annotateWithPages(flat, { 'name:a': 5 });
    assert.equal(out[0].page, 5);
  });

  test('null page when destKey not found or page invalid', () => {
    const flat = flattenOutline([{ title: 'A', dest: 'missing' }]);
    const out = annotateWithPages(flat, new Map());
    assert.equal(out[0].page, null);
  });
});
