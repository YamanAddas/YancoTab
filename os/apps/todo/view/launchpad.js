/**
 * todo/view/launchpad.js — 4 status pads (Hangar / Queue / Today / Launching).
 *
 * Pure builder. Each pad accepts dragged tasks and reports a "drop"
 * intent to the shell. The shell decides the patch:
 *   • dropped on Hangar    → priority='normal', dueAt=null
 *   • dropped on Queue     → dueAt=tomorrow @ 17:00 if currently null
 *   • dropped on Today     → dueAt=today @ 17:00
 *   • dropped on Launching → priority='high'
 */

import { el } from '../../../utils/dom.js';
import { splitMission, BUCKETS } from '../engine/buckets.js';
import { buildRocket } from './rocket.js';

const PAD_DEFS = [
  { id: 'hangar',    title: 'Hangar',    badgeColor: 'var(--text-dim)',         hint: 'No due date · idle' },
  { id: 'queue',     title: 'Queue',     badgeColor: 'var(--cool, #5aa8ff)',     hint: 'Due in the future' },
  { id: 'today',     title: 'Today',     badgeColor: 'var(--warm, #ffb84a)',     hint: 'Due today' },
  { id: 'launching', title: 'Launching', badgeColor: 'var(--accent, #00e5c1)',   hint: 'Active or overdue' },
];

export function buildLaunchpad({ onAddTask, onDropTask, onToggle, onDelete, onOpenEditor }) {
  const root = el('div', { class: 'mc-pads' });

  const pads = {};
  for (const def of PAD_DEFS) {
    const pad = el('section', { class: 'mc-pad', 'data-pad': def.id });

    const head = el('div', { class: 'mc-pad-h' }, [
      el('i', { class: 'mc-pad-badge', style: { background: def.badgeColor } }),
      el('h3', {}, def.title),
      el('span', { class: 'mc-pad-ct' }, '0'),
    ]);

    const list = el('div', { class: 'mc-pad-list' });

    // Quick add input (in the pad, lands as the right intent for that pad).
    const addInput = el('input', {
      class: 'mc-pad-add',
      type: 'text',
      placeholder: '+ Drop or type a task',
      'aria-label': `Add task to ${def.title}`,
    });
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        onAddTask(def.id, e.target.value.trim());
        e.target.value = '';
      }
    });

    pad.append(head, list, addInput);

    // Drag-and-drop targets
    pad.addEventListener('dragover', (e) => {
      const taskId = e.dataTransfer?.types?.includes('text/yancotab-task');
      if (!taskId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      pad.classList.add('is-drop-target');
    });
    pad.addEventListener('dragleave', (e) => {
      // Only clear when leaving the pad entirely, not its children.
      if (!pad.contains(e.relatedTarget)) pad.classList.remove('is-drop-target');
    });
    pad.addEventListener('drop', (e) => {
      pad.classList.remove('is-drop-target');
      const taskId = e.dataTransfer?.getData('text/yancotab-task');
      if (!taskId) return;
      e.preventDefault();
      onDropTask(taskId, def.id);
    });

    pads[def.id] = { pad, list, head, addInput };
    root.appendChild(pad);
  }

  return {
    root,
    update(mission, now = Date.now()) {
      if (!mission) {
        for (const def of PAD_DEFS) {
          pads[def.id].list.innerHTML = '';
          pads[def.id].head.querySelector('.mc-pad-ct').textContent = '0';
        }
        return;
      }
      const split = splitMission(mission, now);
      for (const id of BUCKETS) {
        const list = pads[id].list;
        const tasks = split[id] || [];
        list.innerHTML = '';
        for (const t of tasks) {
          list.appendChild(buildRocket(t, mission, {
            onToggle: (taskId) => onToggle(taskId),
            onDelete: (taskId) => onDelete(taskId),
            onOpenEditor: (taskId) => onOpenEditor(taskId),
          }, now));
        }
        pads[id].head.querySelector('.mc-pad-ct').textContent = String(tasks.length);
      }
    },
  };
}
