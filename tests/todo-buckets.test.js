/**
 * Tests for todo/engine/buckets.js — pure bucket classifier.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { classify, splitMission, formatDue, dueSeverity, BUCKETS } from '../os/apps/todo/engine/buckets.js';
import { makeTask, makeMission } from '../os/apps/todo/engine/state.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

// Anchor "now" to 2026-05-07 14:00 local — same Thursday as the rest of the suite.
const T0 = new Date(2026, 4, 7, 14, 0, 0, 0).getTime();

function task(over = {}) {
  return { ...makeTask({ text: 'sample' }), ...over };
}

describe('classify — open tasks', () => {
  test('no due, normal priority → hangar', () => {
    assert.equal(classify(task({ dueAt: null, priority: 'normal' }), T0), 'hangar');
  });

  test('no due, high priority → launching', () => {
    assert.equal(classify(task({ dueAt: null, priority: 'high' }), T0), 'launching');
  });

  test('overdue → launching', () => {
    const due = new Date(T0 - 2 * HOUR).toISOString();
    assert.equal(classify(task({ dueAt: due }), T0), 'launching');
  });

  test('due in 1 hour → launching (within 3h window)', () => {
    const due = new Date(T0 + HOUR).toISOString();
    assert.equal(classify(task({ dueAt: due }), T0), 'launching');
  });

  test('due in 6 hours today → today', () => {
    // T0 = 14:00; +6h = 20:00 same day, well outside 3h launch window
    const due = new Date(T0 + 6 * HOUR).toISOString();
    assert.equal(classify(task({ dueAt: due }), T0), 'today');
  });

  test('due tomorrow → queue', () => {
    const due = new Date(T0 + DAY).toISOString();
    assert.equal(classify(task({ dueAt: due }), T0), 'queue');
  });

  test('due next week → queue', () => {
    const due = new Date(T0 + 7 * DAY).toISOString();
    assert.equal(classify(task({ dueAt: due }), T0), 'queue');
  });

  test('high priority always → launching even if due is far', () => {
    const due = new Date(T0 + 7 * DAY).toISOString();
    assert.equal(classify(task({ dueAt: due, priority: 'high' }), T0), 'launching');
  });

  test('garbage dueAt → hangar', () => {
    assert.equal(classify(task({ dueAt: 'not-a-date' }), T0), 'hangar');
  });

  test('null/undefined task → hangar', () => {
    assert.equal(classify(null, T0), 'hangar');
    assert.equal(classify(undefined, T0), 'hangar');
  });
});

describe('classify — done tasks', () => {
  test('done today → launching (with completedAt)', () => {
    const t = task({ done: true, completedAt: new Date(T0 - HOUR).toISOString() });
    assert.equal(classify(t, T0), 'launching');
  });

  test('done yesterday → archive', () => {
    const t = task({ done: true, completedAt: new Date(T0 - DAY).toISOString() });
    assert.equal(classify(t, T0), 'archive');
  });

  test('done without completedAt → archive', () => {
    const t = task({ done: true });
    assert.equal(classify(t, T0), 'archive');
  });
});

describe('splitMission', () => {
  test('empty mission → all empty buckets', () => {
    const out = splitMission(makeMission(), T0);
    for (const k of [...BUCKETS, 'archive']) {
      assert.deepEqual(out[k], []);
    }
  });

  test('mixed mission distributes correctly', () => {
    const m = makeMission({ name: 'Test' });
    m.tasks = [
      task({ text: 'A', dueAt: null }),                                                  // hangar
      task({ text: 'B', dueAt: new Date(T0 + DAY).toISOString() }),                       // queue
      task({ text: 'C', dueAt: new Date(T0 + 6 * HOUR).toISOString() }),                  // today
      task({ text: 'D', dueAt: new Date(T0 + HOUR).toISOString() }),                      // launching (≤3h)
      task({ text: 'E', dueAt: new Date(T0 - HOUR).toISOString() }),                      // launching (overdue)
      task({ text: 'F', priority: 'high' }),                                              // launching (high)
      task({ text: 'G', done: true, completedAt: new Date(T0 - HOUR).toISOString() }),    // launching (done today)
      task({ text: 'H', done: true, completedAt: new Date(T0 - DAY).toISOString() }),     // archive
    ];
    const out = splitMission(m, T0);
    assert.equal(out.hangar.length, 1);
    assert.equal(out.queue.length, 1);
    assert.equal(out.today.length, 1);
    assert.equal(out.launching.length, 4);
    assert.equal(out.archive.length, 1);
    assert.equal(out.hangar[0].text, 'A');
    assert.equal(out.queue[0].text, 'B');
    assert.equal(out.today[0].text, 'C');
  });

  test('launching: open tasks float above done tasks', () => {
    const m = makeMission();
    m.tasks = [
      task({ text: 'open-overdue', dueAt: new Date(T0 - HOUR).toISOString() }),
      task({ text: 'done-today',   done: true, completedAt: new Date(T0 - 2 * HOUR).toISOString() }),
      task({ text: 'open-soon',    dueAt: new Date(T0 + HOUR).toISOString() }),
    ];
    const launching = splitMission(m, T0).launching;
    assert.equal(launching.length, 3);
    assert.equal(launching[0].done, false);
    assert.equal(launching[1].done, false);
    assert.equal(launching[2].done, true);
  });

  test('queue sorts by due ascending', () => {
    const m = makeMission();
    m.tasks = [
      task({ text: 'next-week', dueAt: new Date(T0 + 7 * DAY).toISOString() }),
      task({ text: 'tomorrow',  dueAt: new Date(T0 + 1.5 * DAY).toISOString() }),
      task({ text: 'in-3-days', dueAt: new Date(T0 + 3 * DAY).toISOString() }),
    ];
    const queue = splitMission(m, T0).queue;
    assert.equal(queue[0].text, 'tomorrow');
    assert.equal(queue[1].text, 'in-3-days');
    assert.equal(queue[2].text, 'next-week');
  });
});

describe('formatDue', () => {
  test('done task → HH:MM ✓', () => {
    const t = task({ done: true, completedAt: new Date(2026, 4, 7, 14, 18, 0).toISOString() });
    assert.match(formatDue(t, T0), /^14:18 ✓$/);
  });

  test('no due → "no due"', () => {
    assert.equal(formatDue(task({ dueAt: null }), T0), 'no due');
  });

  test('overdue by 2 days → "2d overdue"', () => {
    const t = task({ dueAt: new Date(T0 - 2 * DAY).toISOString() });
    assert.equal(formatDue(t, T0), '2d overdue');
  });

  test('overdue by 4 hours → "4h overdue"', () => {
    const t = task({ dueAt: new Date(T0 - 4 * HOUR).toISOString() });
    assert.equal(formatDue(t, T0), '4h overdue');
  });

  test('due in 14 minutes → "in 14m"', () => {
    const t = task({ dueAt: new Date(T0 + 14 * 60_000).toISOString() });
    assert.equal(formatDue(t, T0), 'in 14m');
  });

  test('due in 2 hours → "in 2h"', () => {
    const t = task({ dueAt: new Date(T0 + 2 * HOUR).toISOString() });
    assert.equal(formatDue(t, T0), 'in 2h');
  });

  test('due 8h later same day → "today"', () => {
    const t = task({ dueAt: new Date(T0 + 8 * HOUR).toISOString() });
    assert.equal(formatDue(t, T0), 'today');
  });

  test('due tomorrow → "tomorrow"', () => {
    const t = task({ dueAt: new Date(T0 + DAY + 5 * HOUR).toISOString() });
    assert.equal(formatDue(t, T0), 'tomorrow');
  });

  test('due in 3 days → weekday name', () => {
    const t = task({ dueAt: new Date(T0 + 3 * DAY).toISOString() });
    const result = formatDue(t, T0);
    // Should be 3-letter weekday
    assert.ok(/^[A-Z][a-z]{2,}$/.test(result), `expected weekday, got "${result}"`);
  });

  test('due far in future → month/day', () => {
    const t = task({ dueAt: new Date(T0 + 60 * DAY).toISOString() });
    const result = formatDue(t, T0);
    // Locale-specific but should contain digits and a letter
    assert.ok(/\d/.test(result));
  });
});

describe('dueSeverity', () => {
  test('done → normal', () => {
    assert.equal(dueSeverity(task({ done: true }), T0), 'normal');
  });

  test('no due → normal', () => {
    assert.equal(dueSeverity(task({ dueAt: null }), T0), 'normal');
  });

  test('overdue → over', () => {
    const t = task({ dueAt: new Date(T0 - HOUR).toISOString() });
    assert.equal(dueSeverity(t, T0), 'over');
  });

  test('due in 2h → soon', () => {
    const t = task({ dueAt: new Date(T0 + 2 * HOUR).toISOString() });
    assert.equal(dueSeverity(t, T0), 'soon');
  });

  test('due later today → soon', () => {
    const t = task({ dueAt: new Date(T0 + 8 * HOUR).toISOString() });
    assert.equal(dueSeverity(t, T0), 'soon');
  });

  test('due tomorrow → normal', () => {
    const t = task({ dueAt: new Date(T0 + DAY + HOUR).toISOString() });
    assert.equal(dueSeverity(t, T0), 'normal');
  });
});
