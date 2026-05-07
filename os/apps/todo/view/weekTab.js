/**
 * todo/view/weekTab.js — 7-day grid showing tasks-due-that-day
 * across all missions.
 */

import { el } from '../../../utils/dom.js';
import { weekBuckets } from '../engine/aggregate.js';
import { formatDue, dueSeverity } from '../engine/buckets.js';

function colorVar(color) {
  switch (color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildWeekTab({ onToggle, onOpenEditor }) {
  const root = el('div', { class: 'mc-week' });

  return {
    root,
    update(state, settings = {}, now = Date.now()) {
      const { days } = weekBuckets(state, now, settings.weekStart || 'mon');
      root.innerHTML = '';

      const grid = el('div', { class: 'mc-week-grid' });
      for (const d of days) {
        const col = el('section', {
          class: `mc-week-col${d.isToday ? ' is-today' : ''}${d.isFuture ? ' is-future' : ''}`,
        });
        const head = el('div', { class: 'mc-week-col-head' }, [
          el('span', { class: 'mc-week-col-label' }, d.label),
          el('span', { class: 'mc-week-col-date' }, dayNumber(d.dayStart)),
          el('span', { class: 'mc-week-col-count' }, d.tasks.length > 0 ? String(d.tasks.length) : ''),
        ]);
        const body = el('div', { class: 'mc-week-col-body' });
        if (d.tasks.length === 0) {
          body.appendChild(el('div', { class: 'mc-week-empty' }, '—'));
        } else {
          for (const { task, mission } of d.tasks) {
            body.appendChild(buildWeekChip(task, mission, { onToggle, onOpenEditor }, now));
          }
        }
        col.append(head, body);
        grid.appendChild(col);
      }
      root.appendChild(grid);
    },
  };
}

function dayNumber(ms) {
  const d = new Date(ms);
  return String(d.getDate());
}

function buildWeekChip(task, mission, handlers, now) {
  const sev = dueSeverity(task, now);
  const cls = ['mc-week-chip', task.done && 'is-done', sev === 'over' && !task.done && 'is-overdue', task.priority === 'high' && !task.done && 'is-high']
    .filter(Boolean).join(' ');
  const root = el('div', { class: cls });
  const chk = el('button', {
    type: 'button',
    class: 'mc-chk',
    'aria-label': task.done ? 'Mark not done' : 'Mark done',
  });
  chk.addEventListener('click', () => handlers.onToggle(mission.id, task.id));
  const dot = el('i', { class: 'mc-week-chip-dot', style: { background: colorVar(mission.color) } });
  const text = el('div', { class: 'mc-week-chip-ttl', tabindex: '0' }, task.text);
  text.addEventListener('click', () => handlers.onOpenEditor(mission.id, task.id));
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handlers.onOpenEditor(mission.id, task.id); }
  });
  const time = el('span', { class: 'mc-week-chip-time' }, formatDue(task, now));
  root.append(chk, dot, text, time);
  return root;
}
