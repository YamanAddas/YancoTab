/**
 * pomodoro/view/settingsTab.js — Settings tab content.
 *
 *   1. Active preset card (read-only summary; switch from the side rail)
 *   2. Week start segmented (Mon | Sun) — affects week grid + season heatmap
 *   3. Ambient toggles — 5 toggles. drone + solarWind are inert "soon" stubs.
 *      autoMute, nightShell, endChime are wired through the ambient module.
 *
 * The shell hands `onChange(patch)` which receives a partial settings
 * object to merge + persist. update(state, settings) repaints display.
 */

import { el } from '../../../utils/dom.js';
import { getPreset } from '../engine/presets.js';

const AMB_DEFS = [
  { key: 'drone',      label: 'Deep-space drone',          soon: true },
  { key: 'solarWind',  label: 'Solar wind on break',       soon: true },
  { key: 'autoMute',   label: 'Auto-mute notifications',   wired: true },
  { key: 'nightShell', label: 'Night-mode shell on break', wired: true },
  { key: 'endChime',   label: 'Chime at session end',      wired: true },
];

function ambientRow(def, on, onToggle) {
  const tog = el('button', {
    type: 'button',
    class: `sol-toggle${on ? ' is-on' : ''}${def.soon ? ' is-disabled' : ''}`,
    'aria-pressed': on ? 'true' : 'false',
    'aria-label': def.label,
  });
  if (!def.soon) tog.addEventListener('click', () => onToggle(def.key));
  const row = el('div', { class: 'sol-amb-row' }, [
    el('b', {}, def.label),
    tog,
  ]);
  if (def.soon) row.appendChild(el('span', { class: 'sol-amb-soon' }, 'soon'));
  return row;
}

export function buildSettingsTab({ onChange }) {
  const root = el('div', { class: 'sol-settings' });

  // ── Preset card ──
  const presetSec = el('section', { class: 'sol-stats-section' });
  presetSec.appendChild(el('h4', { class: 'sol-stats-h' }, 'ACTIVE PRESET'));
  const presetCard = el('div', { class: 'sol-settings-card' });
  presetSec.appendChild(presetCard);

  // ── Week start ──
  const weekSec = el('section', { class: 'sol-stats-section' });
  weekSec.appendChild(el('h4', { class: 'sol-stats-h' }, 'WEEK START'));
  const weekRow = el('div', { class: 'sol-seg' });
  const monBtn = el('button', { type: 'button', class: 'sol-seg-btn', 'data-week-start': 'mon' }, 'Monday');
  const sunBtn = el('button', { type: 'button', class: 'sol-seg-btn', 'data-week-start': 'sun' }, 'Sunday');
  monBtn.addEventListener('click', () => onChange({ weekStart: 'mon' }));
  sunBtn.addEventListener('click', () => onChange({ weekStart: 'sun' }));
  weekRow.append(monBtn, sunBtn);
  weekSec.appendChild(weekRow);

  // ── Ambient ──
  const ambSec = el('section', { class: 'sol-stats-section' });
  ambSec.appendChild(el('h4', { class: 'sol-stats-h' }, 'AMBIENT EFFECTS'));
  const ambList = el('div', { class: 'sol-amb-list' });
  ambSec.appendChild(ambList);

  root.append(presetSec, weekSec, ambSec);

  return {
    root,
    update(state, settings) {
      // Preset card
      const preset = getPreset(state.presetId);
      presetCard.innerHTML = '';
      presetCard.append(
        el('div', { class: 'sol-settings-card-row' }, [
          el('span', { class: 'sol-settings-card-name' }, preset.name),
          el('span', { class: 'sol-settings-card-blurb' }, preset.blurb),
        ]),
        el('p', { class: 'sol-settings-card-hint' },
          state.phase === 'idle'
            ? 'Switch presets from the side rail. Custom durations land in the next update.'
            : 'End the current cycle to switch presets.'),
      );

      // Week start
      const ws = settings?.weekStart === 'sun' ? 'sun' : 'mon';
      monBtn.classList.toggle('is-active', ws === 'mon');
      sunBtn.classList.toggle('is-active', ws === 'sun');

      // Ambient toggles — full re-render is cheap (5 rows).
      ambList.innerHTML = '';
      const amb = settings?.ambient || {};
      for (const def of AMB_DEFS) {
        ambList.appendChild(ambientRow(def, !!amb[def.key], (key) => {
          onChange({ ambient: { ...amb, [key]: !amb[key] } });
        }));
      }
    },
  };
}
