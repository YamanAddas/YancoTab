/**
 * todo/view/rocket.js — single task card (a "rocket").
 *
 * Stateless DOM builder. Returns the root element. Re-built on every
 * render — buckets are cheap to repaint and tasks may move between
 * pads on every state change.
 */

import { el } from '../../../utils/dom.js';
import { formatDue, dueSeverity } from '../engine/buckets.js';

export function buildRocket(task, mission, handlers, now = Date.now()) {
  const sev = dueSeverity(task, now);
  const isStreak = task.recurring;
  const cls = [
    'mc-rocket',
    task.done && 'is-done',
    sev === 'over' && !task.done && 'is-overdue',
    task.priority === 'high' && !task.done && 'is-high',
    isStreak && 'is-streak',
  ].filter(Boolean).join(' ');

  const root = el('div', { class: cls, 'data-task-id': task.id, draggable: 'true' });

  const chk = el('button', {
    type: 'button',
    class: 'mc-chk',
    'aria-pressed': task.done ? 'true' : 'false',
    'aria-label': task.done ? 'Mark not done' : 'Mark done',
  });
  chk.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onToggle(task.id);
  });

  const title = el('div', { class: 'mc-ttl', tabindex: '0' }, task.text);
  title.addEventListener('click', () => handlers.onOpenEditor(task.id));
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlers.onOpenEditor(task.id);
    }
  });

  // Meta row: due badge + priority pill (low/high) + recurring marker
  const metaChildren = [];
  const dueLabel = formatDue(task, now);
  metaChildren.push(el('span', {
    class: `mc-due${sev === 'over' ? ' is-over' : sev === 'soon' ? ' is-soon' : ''}`,
  }, dueLabel));
  if (task.priority === 'high' && !task.done) {
    metaChildren.push(el('span', { class: 'mc-pill is-high' }, 'high'));
  } else if (task.priority === 'low' && !task.done) {
    metaChildren.push(el('span', { class: 'mc-pill' }, 'low'));
  }
  if (task.recurring) {
    metaChildren.push(el('span', { class: 'mc-pill is-streak' }, 'recurring'));
  }
  const meta = el('div', { class: 'mc-meta' }, metaChildren);

  const body = el('div', { class: 'mc-body' }, [title, meta]);

  // Quick-delete on hover (visible in CSS via :hover .mc-x)
  const xBtn = el('button', { type: 'button', class: 'mc-x', title: 'Delete' }, '×');
  xBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onDelete(task.id);
  });

  root.append(chk, body, xBtn);

  // Drag-and-drop wiring (handled by the launchpad layer).
  root.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData('text/yancotab-task', task.id);
    e.dataTransfer && (e.dataTransfer.effectAllowed = 'move');
    root.classList.add('is-dragging');
  });
  root.addEventListener('dragend', () => root.classList.remove('is-dragging'));

  void mission; // currently unused — reserved for color theming if rocket cards opt in
  return root;
}
