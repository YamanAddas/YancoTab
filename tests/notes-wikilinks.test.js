/**
 * Tests for notes/engine/wikilinks.js — extract [[Title]] refs and
 * build the backlink map.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractWikilinks, buildBacklinkMap, forwardLinks, allEdges,
} from '../os/apps/notes/engine/wikilinks.js';

describe('extractWikilinks', () => {
  test('finds single ref', () => {
    assert.deepEqual(extractWikilinks('see [[Hex polish]] notes'), ['hex polish']);
  });

  test('finds multiple refs in one body', () => {
    const out = extractWikilinks('first [[Alpha]] then [[Beta]] and [[Alpha]] again');
    // Dedup case-insensitive, preserves first occurrence.
    assert.deepEqual(out, ['alpha', 'beta']);
  });

  test('case-insensitive dedup', () => {
    const out = extractWikilinks('[[Foo]] and [[FOO]] and [[foo]]');
    assert.deepEqual(out, ['foo']);
  });

  test('non-string body → empty', () => {
    assert.deepEqual(extractWikilinks(null), []);
    assert.deepEqual(extractWikilinks(42), []);
    assert.deepEqual(extractWikilinks(undefined), []);
  });

  test('empty string → empty', () => {
    assert.deepEqual(extractWikilinks(''), []);
  });

  test('refs across multiple lines', () => {
    const body = `Heading
content [[First]] more
text [[Second]]`;
    assert.deepEqual(extractWikilinks(body), ['first', 'second']);
  });

  test('ignores single-bracket "[link]" and unclosed "[[partial"', () => {
    const out = extractWikilinks('text [single] and [[partial nope');
    assert.deepEqual(out, []);
  });

  test('ignores empty refs', () => {
    assert.deepEqual(extractWikilinks('[[]] and [[ ]]'), []);
  });

  test('caps title length to 80 chars per ref', () => {
    const long = 'A'.repeat(120);
    // Regex max is 80; longer refs simply don't match.
    const out = extractWikilinks(`prefix [[${long}]] suffix`);
    assert.deepEqual(out, []);
  });

  test('isolated state across calls (no lastIndex leak)', () => {
    const text = '[[A]] [[B]]';
    // Calling repeatedly should give the same result.
    assert.deepEqual(extractWikilinks(text), ['a', 'b']);
    assert.deepEqual(extractWikilinks(text), ['a', 'b']);
    assert.deepEqual(extractWikilinks(text), ['a', 'b']);
  });
});

describe('buildBacklinkMap', () => {
  test('builds reverse edges', () => {
    const notes = [
      { path: '/a.txt', title: 'Anchor', body: 'links to [[Beta]] and [[Gamma]]' },
      { path: '/b.txt', title: 'Beta',   body: 'mentions [[Anchor]]' },
      { path: '/c.txt', title: 'Gamma',  body: 'lonely note' },
    ];
    const map = buildBacklinkMap(notes);
    // /a.txt links to /b.txt and /c.txt → backlinks: /b.txt has /a.txt, /c.txt has /a.txt
    // /b.txt links to /a.txt → backlinks: /a.txt has /b.txt
    assert.equal(map.get('/a.txt')?.has('/b.txt'), true);
    assert.equal(map.get('/b.txt')?.has('/a.txt'), true);
    assert.equal(map.get('/c.txt')?.has('/a.txt'), true);
  });

  test('drops links to non-existent titles', () => {
    const notes = [
      { path: '/a.txt', title: 'A', body: '[[Ghost]]' },
    ];
    const map = buildBacklinkMap(notes);
    assert.equal(map.size, 0);
  });

  test('drops self-links', () => {
    const notes = [
      { path: '/a.txt', title: 'Echo', body: 'I am [[Echo]]' },
    ];
    const map = buildBacklinkMap(notes);
    assert.equal(map.size, 0);
  });

  test('non-array input → empty map', () => {
    assert.equal(buildBacklinkMap(null).size, 0);
    assert.equal(buildBacklinkMap('oops').size, 0);
  });

  test('multiple sources → set of paths', () => {
    const notes = [
      { path: '/a.txt', title: 'A', body: '[[Target]]' },
      { path: '/b.txt', title: 'B', body: '[[target]]' },
      { path: '/t.txt', title: 'Target', body: '' },
    ];
    const map = buildBacklinkMap(notes);
    const sources = map.get('/t.txt');
    assert.ok(sources);
    assert.ok(sources.has('/a.txt'));
    assert.ok(sources.has('/b.txt'));
    assert.equal(sources.size, 2);
  });
});

describe('forwardLinks', () => {
  test('returns target paths in body order', () => {
    const notes = [
      { path: '/a.txt', title: 'A', body: '[[B]] then [[C]] then [[B]]' },
      { path: '/b.txt', title: 'B', body: '' },
      { path: '/c.txt', title: 'C', body: '' },
    ];
    assert.deepEqual(forwardLinks(notes, '/a.txt'), ['/b.txt', '/c.txt']);
  });

  test('drops self + missing targets', () => {
    const notes = [
      { path: '/a.txt', title: 'A', body: '[[A]] [[B]] [[Ghost]]' },
      { path: '/b.txt', title: 'B', body: '' },
    ];
    assert.deepEqual(forwardLinks(notes, '/a.txt'), ['/b.txt']);
  });

  test('non-array / unknown source → empty', () => {
    assert.deepEqual(forwardLinks(null, '/a.txt'), []);
    assert.deepEqual(forwardLinks([], '/a.txt'), []);
    assert.deepEqual(forwardLinks([{ path: '/x.txt', title: 'X', body: '' }], '/missing.txt'), []);
  });
});

describe('allEdges', () => {
  test('returns directed edges, deduped per pair', () => {
    const notes = [
      { path: '/a.txt', title: 'A', body: '[[B]] [[B]] [[C]]' },
      { path: '/b.txt', title: 'B', body: '[[A]]' },
      { path: '/c.txt', title: 'C', body: '' },
    ];
    const edges = allEdges(notes);
    // a→b (deduped from twice), a→c, b→a
    assert.equal(edges.length, 3);
    const set = new Set(edges.map((e) => `${e.from}|${e.to}`));
    assert.ok(set.has('/a.txt|/b.txt'));
    assert.ok(set.has('/a.txt|/c.txt'));
    assert.ok(set.has('/b.txt|/a.txt'));
  });

  test('non-array → empty', () => {
    assert.deepEqual(allEdges(null), []);
  });

  test('skips notes without path or body', () => {
    const notes = [
      { path: null, title: 'A', body: '[[B]]' },
      { path: '/b.txt', title: 'B', body: null },
    ];
    assert.deepEqual(allEdges(notes), []);
  });
});
