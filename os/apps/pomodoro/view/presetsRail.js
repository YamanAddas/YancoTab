/**
 * pomodoro/view/presetsRail.js — side rail with presets list + (placeholder)
 * week + ambient panels. Week and ambient become real in PR-3.
 *
 * Pure DOM builder. Returns { root, update(state, settings) } so the
 * "active" preset card highlights when the engine's presetId changes.
 */

import { el } from '../../../utils/dom.js';
import { listPresets } from '../engine/presets.js';
import { buildWeekGrid } from './weekGrid.js';

export function buildPresetsRail({ onPickPreset }) {
  const root = el('aside', { class: 'sol-side' });

  // ── This week — orbital loops ──
  const weekSec = el('section', { class: 'sol-side-section' });
  weekSec.appendChild(el('h4', { class: 'sol-side-h' }, 'THIS WEEK'));
  const weekGrid = buildWeekGrid();
  weekSec.appendChild(weekGrid.root);

  // ── Presets section ──
  const presetsSec = el('section', { class: 'sol-side-section' });
  presetsSec.appendChild(el('h4', { class: 'sol-side-h' }, 'PRESETS'));
  const presetList = el('div', { class: 'sol-preset-list' });
  presetsSec.appendChild(presetList);

  const presetCards = new Map();
  for (const p of listPresets()) {
    const card = el('button', {
      class: 'sol-preset', type: 'button', 'data-preset-id': p.id,
    }, [
      el('b', { class: 'sol-preset-name' }, p.name),
      el('span', { class: 'sol-preset-blurb' }, p.blurb),
    ]);
    card.addEventListener('click', () => {
      if (typeof onPickPreset === 'function') onPickPreset(p.id);
    });
    presetCards.set(p.id, card);
    presetList.appendChild(card);
  }

  // ── Ambient placeholder ──
  // PR-3 wires real persistence + behavior. PR-2 just shows the section.
  const ambSec = el('section', { class: 'sol-side-section sol-ambient-section' });
  ambSec.appendChild(el('h4', { class: 'sol-side-h' }, 'AMBIENT'));
  const ambList = el('div', { class: 'sol-amb-list' });
  const ambItems = [
    { name: 'Deep-space drone',         on: false, soon: true },
    { name: 'Solar wind on break',      on: false, soon: true },
    { name: 'Auto-mute notifications',  on: true },
    { name: 'Night-mode shell on break', on: true },
    { name: 'Chime at session end',     on: false },
  ];
  for (const it of ambItems) {
    const row = el('div', { class: 'sol-amb-row' }, [
      el('b', {}, it.name),
      el('div', { class: it.on ? 'sol-toggle is-on is-disabled' : 'sol-toggle is-disabled' }),
    ]);
    if (it.soon) row.appendChild(el('span', { class: 'sol-amb-soon' }, 'soon'));
    ambList.appendChild(row);
  }
  ambSec.appendChild(ambList);

  // ── Hint footer ──
  const hint = el('div', { class: 'sol-side-hint' }, 'Tap the sky to preview night mode');

  root.append(weekSec, presetsSec, ambSec, hint);

  return {
    root,
    update(state, history, settings = {}) {
      for (const [id, card] of presetCards) {
        card.classList.toggle('is-active', id === state.presetId);
        // Disable preset switch while running.
        card.disabled = state.phase !== 'idle';
        card.title = state.phase !== 'idle'
          ? 'End the current cycle to switch presets'
          : `Switch to ${id}`;
      }
      // Repaint the week grid (cheap — 7 cells).
      weekGrid.update(history, 4, settings.weekStart || 'mon');
    },
  };
}
