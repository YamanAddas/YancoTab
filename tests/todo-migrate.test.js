/**
 * Tests for todo/engine/migrate.js + state.js normalizers + persistence shape.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isV1Shape, isV2Shape, migrateV1ToV2 } from '../os/apps/todo/engine/migrate.js';
import { normalizeState, normalizeTask, normalizeMission, makeInitialState, COLORS } from '../os/apps/todo/engine/state.js';

describe('shape detection', () => {
  test('isV1Shape', () => {
    assert.equal(isV1Shape({ lists: [] }), true);
    assert.equal(isV1Shape({ lists: [], missions: [] }), false); // both → not pure v1
    assert.equal(isV1Shape({ missions: [] }), false);
    assert.equal(isV1Shape(null), false);
    assert.equal(isV1Shape({}), false);
  });

  test('isV2Shape', () => {
    assert.equal(isV2Shape({ missions: [] }), true);
    assert.equal(isV2Shape({ lists: [] }), false);
    assert.equal(isV2Shape(null), false);
  });
});

describe('migrateV1ToV2', () => {
  test('empty v1 still produces a default mission', () => {
    const v1 = { lists: [] };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.missions.length, 1);
    assert.equal(v2.missions[0].name, 'My Tasks');
    assert.equal(v2.activeMissionId, v2.missions[0].id);
    assert.equal(v2.version, 2);
  });

  test('preserves list ids and task ids', () => {
    const v1 = {
      lists: [
        { id: 'list_abc', name: 'Work', tasks: [
          { id: 'task_1', text: 'Ship it', done: false, dueDate: '2026-05-08', position: 1000 },
        ] },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.missions[0].id, 'list_abc');
    assert.equal(v2.missions[0].name, 'Work');
    assert.equal(v2.missions[0].tasks[0].id, 'task_1');
    assert.equal(v2.missions[0].tasks[0].text, 'Ship it');
  });

  test('assigns colors in declared order', () => {
    const v1 = {
      lists: [
        { id: 'a', name: 'A', tasks: [] },
        { id: 'b', name: 'B', tasks: [] },
        { id: 'c', name: 'C', tasks: [] },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.missions[0].color, COLORS[0]);
    assert.equal(v2.missions[1].color, COLORS[1]);
    assert.equal(v2.missions[2].color, COLORS[2]);
  });

  test('color cycles after exhausting palette', () => {
    const lists = [];
    for (let i = 0; i < COLORS.length + 2; i++) {
      lists.push({ id: `m${i}`, name: `M${i}`, tasks: [] });
    }
    const v2 = migrateV1ToV2({ lists });
    assert.equal(v2.missions[COLORS.length].color, COLORS[0]); // wraps
    assert.equal(v2.missions[COLORS.length + 1].color, COLORS[1]);
  });

  test('tasks with dueDate gain dueAt at 17:00 local', () => {
    const v1 = { lists: [{ id: 'a', name: 'A', tasks: [
      { id: 't', text: 'X', done: false, dueDate: '2026-05-08' },
    ] }] };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.missions[0].tasks[0].dueAt, '2026-05-08T17:00');
  });

  test('tasks without dueDate get dueAt: null', () => {
    const v1 = { lists: [{ id: 'a', name: 'A', tasks: [
      { id: 't', text: 'X', done: false, dueDate: null },
    ] }] };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.missions[0].tasks[0].dueAt, null);
  });

  test('malformed dueDate → null (not crash)', () => {
    const v1 = { lists: [{ id: 'a', name: 'A', tasks: [
      { id: 't', text: 'X', dueDate: 'not-a-date' },
    ] }] };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.missions[0].tasks[0].dueAt, null);
  });

  test('all tasks gain priority="normal", recurring=false', () => {
    const v1 = { lists: [{ id: 'a', name: 'A', tasks: [
      { id: 't', text: 'X' },
    ] }] };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.missions[0].tasks[0].priority, 'normal');
    assert.equal(v2.missions[0].tasks[0].recurring, false);
    assert.equal(v2.missions[0].tasks[0].completedAt, null);
  });

  test('drops empty-text tasks (silent garbage filter)', () => {
    const v1 = { lists: [{ id: 'a', name: 'A', tasks: [
      { id: 't1', text: 'Real' },
      { id: 't2', text: '   ' },
      { id: 't3', text: '' },
      null,
    ] }] };
    const v2 = migrateV1ToV2(v1);
    assert.equal(v2.missions[0].tasks.length, 1);
    assert.equal(v2.missions[0].tasks[0].text, 'Real');
  });

  test('non-v1 input returns null', () => {
    assert.equal(migrateV1ToV2(null), null);
    assert.equal(migrateV1ToV2({ missions: [] }), null);
    assert.equal(migrateV1ToV2({}), null);
  });

  test('streakLog starts empty', () => {
    const v2 = migrateV1ToV2({ lists: [{ id: 'a', name: 'A', tasks: [] }] });
    assert.deepEqual(v2.streakLog, {});
  });
});

describe('normalizeState', () => {
  test('null/garbage → makeInitialState', () => {
    const init = makeInitialState();
    const norm = normalizeState(null);
    assert.equal(norm.missions.length, init.missions.length);
    assert.equal(norm.version, 2);
  });

  test('keeps valid missions, drops invalid', () => {
    const norm = normalizeState({
      missions: [
        { id: 'a', name: 'Real', color: 'cool', position: 1, tasks: [{ text: 'OK' }] },
        null,
        { /* missing id */ name: 'Also real', tasks: [] },
      ],
      activeMissionId: 'a',
    });
    assert.equal(norm.missions.length, 2);
    assert.equal(norm.missions[0].name, 'Real');
    assert.equal(norm.missions[0].tasks[0].text, 'OK');
    assert.equal(norm.activeMissionId, 'a');
  });

  test('activeMissionId falls back to first when missing', () => {
    const norm = normalizeState({
      missions: [{ id: 'x', name: 'X', tasks: [] }],
      activeMissionId: 'no-such-id',
    });
    assert.equal(norm.activeMissionId, 'x');
  });

  test('empty missions array → init state (refuse to leave empty)', () => {
    const norm = normalizeState({ missions: [] });
    assert.ok(norm.missions.length >= 1);
  });

  test('streakLog: only keeps valid YYYY-MM-DD keys with non-negative numbers', () => {
    const norm = normalizeState({
      missions: [{ id: 'a', name: 'A', tasks: [] }],
      activeMissionId: 'a',
      streakLog: {
        '2026-05-07': 4,
        '2026-05-08': 'oops',
        'not-a-date': 5,
        '2026-05-09': -1,
        '2026-05-10': 0,
      },
    });
    assert.deepEqual(Object.keys(norm.streakLog).sort(), ['2026-05-07', '2026-05-10']);
    assert.equal(norm.streakLog['2026-05-07'], 4);
  });

  test('rejects unknown priority/color values', () => {
    const norm = normalizeState({
      missions: [{
        id: 'a', name: 'A', color: 'rainbow',
        tasks: [{ text: 'X', priority: 'critical' }],
      }],
    });
    assert.equal(norm.missions[0].color, 'accent');
    assert.equal(norm.missions[0].tasks[0].priority, 'normal');
  });
});

describe('normalizeTask', () => {
  test('drops tasks without text', () => {
    assert.equal(normalizeTask({ text: '' }), null);
    assert.equal(normalizeTask({}), null);
    assert.equal(normalizeTask(null), null);
  });

  test('caps text at 500 chars', () => {
    const long = 'x'.repeat(800);
    const t = normalizeTask({ text: long });
    assert.equal(t.text.length, 500);
  });

  test('garbage position → fallback', () => {
    const t = normalizeTask({ text: 'X', position: 'oops' }, 4242);
    assert.equal(t.position, 4242);
  });
});

describe('normalizeMission', () => {
  test('null → null', () => {
    assert.equal(normalizeMission(null), null);
  });

  test('empty name defaults to Untitled', () => {
    const m = normalizeMission({ id: 'x', name: '   ' });
    assert.equal(m.name, 'Untitled');
  });

  test('name capped at 60 chars', () => {
    const long = 'M'.repeat(80);
    const m = normalizeMission({ id: 'x', name: long });
    assert.equal(m.name.length, 60);
  });
});
