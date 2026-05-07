/**
 * settings/components.js — shared row builders.
 *
 * Extracted from the old SettingsApp.js so the renderXxx() modules
 * can call them as plain functions instead of `app._toggleRow(...)`.
 * All builders are pure DOM factories with their own click handlers.
 */

import { el } from '../../utils/dom.js';

export function group(title, children) {
  return el('section', { class: 'mc-set-group' }, [
    el('div', { class: 'mc-set-group-title' }, title),
    el('div', { class: 'mc-set-card' }, children),
  ]);
}

export function toggleRow(label, desc, isOn, onToggle) {
  const toggle = el('button', {
    type: 'button',
    class: `mc-set-toggle${isOn ? ' is-on' : ''}`,
    'aria-pressed': String(isOn),
  }, [el('span', { class: 'mc-set-toggle-knob' })]);
  toggle.addEventListener('click', () => {
    const next = !toggle.classList.contains('is-on');
    toggle.classList.toggle('is-on', next);
    toggle.setAttribute('aria-pressed', String(next));
    onToggle(next);
  });
  return el('div', { class: 'mc-set-row' }, [
    el('div', { class: 'mc-set-info' }, [
      el('div', { class: 'mc-set-label' }, label),
      ...(desc ? [el('div', { class: 'mc-set-desc' }, desc)] : []),
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
