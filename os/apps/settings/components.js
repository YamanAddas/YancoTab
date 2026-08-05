/**
 * settings/components.js — shared row builders.
 *
 * Extracted from the old SettingsApp.js so the renderXxx() modules
 * can call them as plain functions instead of `app._toggleRow(...)`.
 * All builders are pure DOM factories with their own click handlers.
 */

import { el } from '../../utils/dom.js';

// Unique ids for label↔control association. A counter (not a random or
// time-based value) keeps ids stable across a re-render in the same
// session, so an assistive tech that cached one does not go stale.
let rowSeq = 0;
const nextRowId = (prefix) => `${prefix}-${++rowSeq}`;

export function group(title, children) {
  return el('section', { class: 'mc-set-group' }, [
    el('div', { class: 'mc-set-group-title' }, title),
    el('div', { class: 'mc-set-card' }, children),
  ]);
}

export function toggleRow(label, desc, isOn, onToggle) {
  // The switch is an icon-only button: its visible name lives in a sibling
  // div. Without this association every toggle across all six Settings
  // tabs announced as bare "button, pressed" — Tab-reachable but
  // unidentifiable by ear. aria-labelledby points at the label (and the
  // description, when present, via aria-describedby).
  const labelId = nextRowId('mc-set-label');
  const descId = desc ? nextRowId('mc-set-desc') : null;

  const toggle = el('button', {
    type: 'button',
    class: `mc-set-toggle${isOn ? ' is-on' : ''}`,
    'aria-pressed': String(isOn),
    'aria-labelledby': labelId,
    ...(descId ? { 'aria-describedby': descId } : {}),
  }, [el('span', { class: 'mc-set-toggle-knob' })]);
  toggle.addEventListener('click', () => {
    const next = !toggle.classList.contains('is-on');
    toggle.classList.toggle('is-on', next);
    toggle.setAttribute('aria-pressed', String(next));
    onToggle(next);
  });
  return el('div', { class: 'mc-set-row' }, [
    el('div', { class: 'mc-set-info' }, [
      el('div', { class: 'mc-set-label', id: labelId }, label),
      ...(desc ? [el('div', { class: 'mc-set-desc', id: descId }, desc)] : []),
    ]),
    toggle,
  ]);
}

export function choiceRow(label, isSelected, onSelect) {
  const btn = el('button', { type: 'button', class: 'mc-set-choice' }, [
    el('div', { class: 'mc-set-label' }, label),
    el('div', { class: 'mc-set-check', style: isSelected ? '' : 'visibility:hidden;' }, '✓'),
  ]);
  btn.addEventListener('click', onSelect);
  return btn;
}

export function actionRow(label, desc, action, isDanger = false) {
  const btn = el('button', { type: 'button', class: 'mc-set-action' }, [
    el('div', { class: 'mc-set-info' }, [
      el('div', { class: `mc-set-label${isDanger ? ' is-danger' : ''}` }, label),
      ...(desc ? [el('div', { class: 'mc-set-desc' }, desc)] : []),
    ]),
    el('div', { class: 'mc-set-chevron' }, '›'),
  ]);
  btn.addEventListener('click', action);
  return btn;
}

export function dataRow(label, value) {
  return el('div', { class: 'mc-set-row' }, [
    el('div', { class: 'mc-set-label' }, label),
    el('div', { class: 'mc-set-desc', style: 'margin-top:0; text-align:right;' }, value),
  ]);
}

export function infoRow(label, text) {
  return el('div', { class: 'mc-set-row' }, [
    el('div', { class: 'mc-set-info' }, [
      el('div', { class: 'mc-set-label' }, label),
      el('div', { class: 'mc-set-desc' }, text),
    ]),
  ]);
}

export function aboutRow(label, value) {
  return el('div', { class: 'mc-set-about-row' }, [
    el('div', { class: 'mc-set-about-key' }, label),
    el('div', { class: 'mc-set-about-value' }, value),
  ]);
}
