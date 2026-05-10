/**
 * Tests for os/apps/pdf/engine/notes.js — sticky-note reducer.
 * Pure logic — no DOM, no IDB.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    NOTE_COLORS,
    normalizeNote,
    hasChanged,
    groupByPage,
    clampNotePosition,
    __TEST__,
} from '../os/apps/pdf/engine/notes.js';

describe('normalizeNote', () => {
    test('returns null for missing docId', () => {
        assert.equal(normalizeNote({ page: 1, x: 0.5, y: 0.5, body: 'hi' }), null);
    });
    test('returns null for invalid page', () => {
        assert.equal(normalizeNote({ docId: 'd', page: 0, x: 0.5, y: 0.5, body: 'hi' }), null);
        assert.equal(normalizeNote({ docId: 'd', page: -1, x: 0.5, y: 0.5, body: 'hi' }), null);
    });
    test('returns null for missing coords', () => {
        assert.equal(normalizeNote({ docId: 'd', page: 1, body: 'hi' }), null);
    });
    test('returns null for empty body', () => {
        assert.equal(normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: '' }), null);
        assert.equal(normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: '   ' }), null);
    });
    test('clamps coords to [0, 1]', () => {
        const n = normalizeNote({ docId: 'd', page: 1, x: 1.5, y: -0.2, body: 'hi' });
        assert.equal(n.x, 1);
        assert.equal(n.y, 0);
    });
    test('floors fractional page', () => {
        const n = normalizeNote({ docId: 'd', page: 4.7, x: 0.5, y: 0.5, body: 'hi' });
        assert.equal(n.page, 4);
    });
    test('truncates oversized body', () => {
        const long = 'x'.repeat(5000);
        const n = normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: long });
        assert.equal(n.body.length, __TEST__.MAX_BODY);
    });
    test('falls back to "warm" color on bad input', () => {
        const n = normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: 'hi', color: 'lime' });
        assert.equal(n.color, 'warm');
    });
    test('keeps a valid color', () => {
        const n = normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: 'hi', color: 'rose' });
        assert.equal(n.color, 'rose');
    });
    test('falls back to 0 rotation on bad input', () => {
        const n = normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: 'hi', rotation: 45 });
        assert.equal(n.rotation, 0);
    });
    test('keeps valid rotation', () => {
        const n = normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: 'hi', rotation: 270 });
        assert.equal(n.rotation, 270);
    });
    test('preserves id when supplied', () => {
        const n = normalizeNote({ id: 42, docId: 'd', page: 1, x: 0.5, y: 0.5, body: 'hi' });
        assert.equal(n.id, 42);
    });
    test('omits id when not supplied (autoIncrement-friendly)', () => {
        const n = normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: 'hi' });
        assert.equal('id' in n, false);
    });
    test('always sets kind="note"', () => {
        const n = normalizeNote({ docId: 'd', page: 1, x: 0.5, y: 0.5, body: 'hi' });
        assert.equal(n.kind, 'note');
    });
});

describe('hasChanged', () => {
    const base = { body: 'a', color: 'warm', x: 0.5, y: 0.5, rotation: 0 };
    test('false on no patch', () => assert.equal(hasChanged(base, {}), false));
    test('true on body change', () => assert.equal(hasChanged(base, { body: 'b' }), true));
    test('true on color change', () => assert.equal(hasChanged(base, { color: 'rose' }), true));
    test('true on coordinate change', () => assert.equal(hasChanged(base, { x: 0.9 }), true));
    test('false on patch with same values', () => {
        assert.equal(hasChanged(base, { body: 'a', color: 'warm' }), false);
    });
});

describe('groupByPage', () => {
    test('empty input returns {}', () => assert.deepEqual(groupByPage([]), {}));
    test('returns {} for null', () => assert.deepEqual(groupByPage(null), {}));
    test('groups by page and sorts by createdAt', () => {
        const notes = [
            { kind: 'note', page: 2, body: 'b', createdAt: 200 },
            { kind: 'note', page: 1, body: 'a', createdAt: 100 },
            { kind: 'note', page: 1, body: 'c', createdAt: 50 },
        ];
        const out = groupByPage(notes);
        assert.equal(out[1].length, 2);
        assert.equal(out[2].length, 1);
        assert.equal(out[1][0].body, 'c');
        assert.equal(out[1][1].body, 'a');
    });
    test('skips non-note records', () => {
        const notes = [
            { kind: 'highlight', page: 1, text: 'x' },
            { kind: 'note', page: 1, body: 'a', createdAt: 1 },
        ];
        const out = groupByPage(notes);
        assert.equal(out[1].length, 1);
    });
});

describe('clampNotePosition', () => {
    test('clamps high', () => assert.deepEqual(clampNotePosition(1.5, 0.7), { x: 1, y: 0.7 }));
    test('clamps low', () => assert.deepEqual(clampNotePosition(-0.2, 0.5), { x: 0, y: 0.5 }));
    test('falls back to 0.5 on NaN', () => assert.deepEqual(clampNotePosition(NaN, NaN), { x: 0.5, y: 0.5 }));
});

describe('NOTE_COLORS', () => {
    test('matches the highlight palette', () => {
        assert.deepEqual([...NOTE_COLORS], ['accent', 'warm', 'rose', 'violet', 'cool']);
    });
});
