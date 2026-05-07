/**
 * todo/view/todayTab.js — Today tab content.
 *
 *   Single-column actionable list aggregated across all missions
 *   (today's-due + overdue + high priority). The intraday timeline
 *   strip lives below as a glanceable today-at-a-glance.
 *
 * Pure DOM builder. The shell calls update(state, now) on every
 * tick + state change.
 */

import { el } from '../../../utils/dom.js';
import { formatDue, dueSeverity } from '../engine/buckets.js';
import { todaysActionable } from '../engine/aggregate.js';
import { buildTimeline } from './timeline.js';

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

export function buildTodayTab({ onToggle, onOpenEditor, onDelete }) {
  const root = el('div', { class: 'mc-today' });

  const head = el('div', { class: 'mc-today-head' }, [
    el('h2', { class: 'mc-today-title' }, 'Today'),
    el('span', { class: 'mc-today-meta' }, ''),
  ]);

  const list = el('div', { class: 'mc-today-list' });
  const empty = el('div', { class: 'mc-today-empty' },
    'No actionable tasks for today. Drop one in Hangar or set a due time on a Queue task.');
  const timeline = buildTimeline();

  root.append(head, list, empty, timeline.root);

  return {
    root,
    update(state, now = Date.now()) {
      const items = todaysActionable(state, now);
      const open = items.filter((e) => !e.task.done);
      const done = items.filter((e) => e.task.done);

      head.querySelector('.mc-today-meta').textContent =
        `${open.length} open · ${done.length} done · ${formatDateLabel(now)}`;

      list.innerHTML = '';
      if (items.length === 0) {
        empty.style.display = 'block';
      } else {
        empty.style.display = 'none';
        for (const { task, mission } of items) {
          list.appendChild(buildRow(task, mission, { onToggle, onOpenEditor, onDelete }, now));
        }
      }

      timeline.update(state, now);
    },
  };
}

function buildRow(task, mission, handlers, now) {
  const sev = dueSeverity(task, now);
  const cls = ['mc-trow', task.done && 'is-done', sev === 'over' && !task.done && 'is-overdue', task.priority === 'high' && !task.done && 'is-high']
    .filter(Boolean).join(' ');
  const root = el('div', { class: cls });

  const chk = el('button', {
    type: 'button',
    class: 'mc-chk',
    'aria-pressed': task.done ? 'true' : 'false',
    'aria-label': task.done ? 'Mark not done' : 'Mark done',
  });
  chk.addEventListener('click', () => handlers.onToggle(mission.id, task.id));

  const dotColor = colorVar(mission.color);
  const dot = el('i', { class: 'mc-trow-dot', style: { background: dotColor }, title: mission.name });

  const titleEl = el('div', { class: 'mc-trow-ttl', tabindex: '0' }, task.text);
  titleEl.addEventListener('click', () => handlers.onOpenEditor(mission.id, task.id));
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlers.onOpenEditor(mission.id, task.id);
    }
  });

  const meta = el('div', { class: 'mc-trow-meta' }, [
    el('span', { class: 'mc-trow-mname' }, mission.name),
    el('span', { class: `mc-trow-due${sev === 'over' ? ' is-over' : sev === 'soon' ? ' is-soon' : ''}` }, formatDue(task, now)),
    task.priority === 'high' && !task.done ? el('span', { class: 'mc-pill is-high' }, 'high') : null,
    task.priority === 'low' && !task.done ? el('span', { class: 'mc-pill' }, 'low') : null,
  ].filter(Boolean));

  const body = el('div', { class: 'mc-trow-body' }, [titleEl, meta]);

  const xBtn = el('button', { type: 'button', class: 'mc-x', title: 'Delete' }, '×');
  xBtn.addEventListener('click', () => handlers.onDelete(mission.id, task.id));

  root.append(chk, dot, body, xBtn);
  return root;
}

function formatDateLabel(now) {
  const d = new Date(now);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
