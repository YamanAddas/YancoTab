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

const AMB_DEFS = [
  { key: 'drone',      label: 'Deep-space drone',          soon: true },
  { key: 'solarWind',  label: 'Solar wind on break',       soon: true },
  { key: 'autoMute',   label: 'Auto-mute notifications' },
  { key: 'nightShell', label: 'Night-mode shell on break' },
  { key: 'endChime',   label: 'Chime at session end' },
];

export function buildPresetsRail({ onPickPreset, onAmbientToggle }) {
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

  // ── Ambient (interactive — shares state with Settings tab) ──
  const ambSec = el('section', { class: 'sol-side-section sol-ambient-section' });
  ambSec.appendChild(el('h4', { class: 'sol-side-h' }, 'AMBIENT'));
  const ambList = el('div', { class: 'sol-amb-list' });
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

      // Repaint ambient toggles from settings.
      ambList.innerHTML = '';
      const amb = settings.ambient || {};
      for (const def of AMB_DEFS) {
        const on = !!amb[def.key];
        const tog = el('button', {
          type: 'button',
          class: `sol-toggle${on ? ' is-on' : ''}${def.soon ? ' is-disabled' : ''}`,
          'aria-pressed': on ? 'true' : 'false',
          'aria-label': def.label,
        });
        if (!def.soon && typeof onAmbientToggle === 'function') {
          tog.addEventListener('click', () => onAmbientToggle(def.key));
        }
        const row = el('div', { class: 'sol-amb-row' }, [el('b', {}, def.label), tog]);
        if (def.soon) row.appendChild(el('span', { class: 'sol-amb-soon' }, 'soon'));
        ambList.appendChild(row);
      }
    },
  };
}
