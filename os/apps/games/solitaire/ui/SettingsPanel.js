// SettingsPanel.js — Solitaire settings modal.
// Pure view: receives current settings + onSave callback. The app decides what
// to do with the new settings (apply live vs prompt for new deal).

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

export function showSettingsPanel(root, settings, onSave) {
  // Dismiss any existing settings overlay first.
  root.querySelector('.cosmic-settings-overlay')?.remove();

  const radio = (name, value, label, checked) => {
    const id = `sol-${name}-${value}`;
    const input = el('input', { type: 'radio', name, id, value });
    if (checked) input.checked = true;
    return el('label', { class: 'cosmic-radio', for: id }, [input, el('span', {}, label)]);
  };
  const check = (id, label, checked) => {
    const input = el('input', { type: 'checkbox', id });
    if (checked) input.checked = true;
    return el('label', { class: 'cosmic-check', for: id }, [input, el('span', {}, label)]);
  };
  const section = (title, ...children) => el('div', { class: 'cosmic-settings-section' }, [
    el('div', { class: 'cosmic-settings-label' }, title),
    el('div', { class: 'cosmic-settings-group' }, children),
  ]);
  // Card-back swatch: radio whose visual is a 44×60 preview using the same
  // back-* classes that style real cards. The <input> stays hidden but focusable.
  const backSwatch = (value, label, checked) => {
    const id = `sol-back-${value}`;
    const input = el('input', { type: 'radio', name: 'cardBack', id, value });
    if (checked) input.checked = true;
    const swatch = el('div', { class: `cosmic-back-swatch back-${value}` }, [
      el('div', { class: 'cosmic-card-back' }),
    ]);
    return el('label', { class: 'cosmic-back-choice', for: id, title: label },
      [input, swatch, el('span', { class: 'cosmic-back-label' }, label)]);
  };

  const card = el('div', { class: 'cosmic-win-card cosmic-settings-card' }, [
    el('div', { class: 'cosmic-win-title' }, 'Settings'),
    section('Draw',
      radio('draw', '1', 'Draw 1', settings.drawCount !== 3),
      radio('draw', '3', 'Draw 3', settings.drawCount === 3),
    ),
    section('Scoring',
      radio('scoring', 'standard', 'Standard', settings.scoring === 'standard'),
      radio('scoring', 'vegas', 'Vegas', settings.scoring === 'vegas'),
      radio('scoring', 'cumulative', 'Cumulative Vegas', settings.scoring === 'cumulative'),
    ),
    section('Display',
      check('sol-fourcolor', '4-color suits', !!settings.fourColor),
      check('sol-lefty', 'Left-handed layout', !!settings.leftHanded),
    ),
    section('Card back',
      backSwatch('nebula', 'Nebula', (settings.cardBack || 'nebula') === 'nebula'),
      backSwatch('hex',    'Hex',    settings.cardBack === 'hex'),
      backSwatch('warp',   'Warp',   settings.cardBack === 'warp'),
      backSwatch('aurora', 'Aurora', settings.cardBack === 'aurora'),
    ),
    el('div', { class: 'cosmic-settings-hint' },
      'Draw and scoring apply on the next deal.'),
    el('div', { class: 'cosmic-settings-actions' }, [
      el('button', { class: 'cosmic-btn', type: 'button', 'data-act': 'cancel' }, 'Cancel'),
      el('button', { class: 'cosmic-btn', type: 'button', 'data-act': 'save' }, 'Save'),
    ]),
  ]);
  const { overlay, close } = mountOverlay(root, card, { extraClass: 'cosmic-settings-overlay' });

  overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
  overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
    const next = {
      drawCount: overlay.querySelector('input[name="draw"]:checked')?.value === '3' ? 3 : 1,
      scoring: overlay.querySelector('input[name="scoring"]:checked')?.value || 'standard',
      fourColor: overlay.querySelector('#sol-fourcolor').checked,
      leftHanded: overlay.querySelector('#sol-lefty').checked,
      cardBack: overlay.querySelector('input[name="cardBack"]:checked')?.value || 'nebula',
    };
    close();
    onSave(next);
  });
}
