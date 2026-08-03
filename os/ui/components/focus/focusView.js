/**
 * focus/focusView.js — DOM scaffold for Focus Mode.
 *
 * Builds the tree once and hands back the element handles the controller
 * repaints. It owns no state and reads no storage: every interactive
 * element takes its behaviour from the `handlers` bag passed in, so the
 * controller stays the only place that knows what a click means.
 *
 * Mirrors the view-extraction pattern already used by Tarneeb, Trix and
 * Todo — the controller keeps lifecycle and rules, the view keeps markup.
 */

import { el, setLiteralHtml } from '../../../utils/dom.js';

export const RING_RADIUS = 78;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The SVG progress ring. Static markup — no user data is interpolated. */
function buildRingSvg() {
  const wrap = el('div', { class: 'fm-ring-svg' });
  setLiteralHtml(wrap, `
    <svg viewBox="0 0 180 180" aria-hidden="true">
      <circle class="fm-ring-track" cx="90" cy="90" r="${RING_RADIUS}" fill="none" stroke-width="4"/>
      <circle class="fm-ring-fill" cx="90" cy="90" r="${RING_RADIUS}" fill="none" stroke-width="4"
              stroke-linecap="round"
              stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}"
              stroke-dashoffset="${RING_CIRCUMFERENCE.toFixed(2)}"
              transform="rotate(-90 90 90)"/>
    </svg>
  `);
  return wrap;
}

/**
 * buildFocusView(handlers) → { root, els }
 *
 * handlers: { onToggleTimer, onCompleteTask, onCycleTask(dir),
 *             onAddTask(text), onExit }
 *
 * The caller is responsible for mounting `root`.
 */
export function buildFocusView(handlers = {}) {
  const els = {};

  els.clock = el('div', { class: 'fm-clock' });
  els.date = el('div', { class: 'fm-date' });

  els.ringTime = el('div', { class: 'fm-ring-time' });
  els.ringWrap = el('button', {
    class: 'fm-ring',
    type: 'button',
    'aria-label': 'Start or pause the focus timer',
    onclick: () => handlers.onToggleTimer?.(),
  }, [buildRingSvg(), els.ringTime]);
  els.phase = el('div', { class: 'fm-phase' });

  els.taskText = el('span', { class: 'fm-task-text' });
  els.taskCheck = el('button', {
    class: 'fm-task-check',
    type: 'button',
    'aria-label': 'Mark this task done',
    // stopPropagation so the card itself can gain a click action later
    // without the checkbox double-firing it.
    onclick: (e) => { e.stopPropagation(); handlers.onCompleteTask?.(); },
  });
  els.taskNext = el('button', {
    class: 'fm-task-next',
    type: 'button',
    'aria-label': 'Show the next task',
    onclick: (e) => { e.stopPropagation(); handlers.onCycleTask?.(1); },
  }, '›');
  els.taskCard = el('div', { class: 'fm-task' }, [els.taskCheck, els.taskText, els.taskNext]);

  els.taskInput = el('input', {
    class: 'fm-task-input',
    type: 'text',
    placeholder: 'What are you focusing on?',
    'aria-label': 'Name the task you are focusing on',
    onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handlers.onAddTask?.(e.target.value); }
    },
  });
  els.taskEmpty = el('div', { class: 'fm-task fm-task-empty' }, [els.taskInput]);

  els.elapsed = el('div', { class: 'fm-elapsed' });
  els.exit = el('button', {
    class: 'fm-exit',
    type: 'button',
    onclick: () => handlers.onExit?.(),
  }, 'Exit focus');

  const root = el('div', {
    class: 'focus-mode',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Focus mode',
  }, [
    el('div', { class: 'fm-inner' }, [
      el('div', { class: 'fm-head' }, [els.clock, els.date]),
      el('div', { class: 'fm-timer' }, [els.ringWrap, els.phase]),
      el('div', { class: 'fm-task-slot' }, [els.taskCard, els.taskEmpty]),
      el('div', { class: 'fm-foot' }, [els.exit, els.elapsed]),
    ]),
  ]);

  return { root, els };
}
