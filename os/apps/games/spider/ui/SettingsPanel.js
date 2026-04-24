// SettingsPanel.js — Spider settings modal. Pure view.
// Difficulty (1/2/4 suits), display toggles, and card-back picker. Engine
// difficulty applies on the next deal — the app prompts for a new game when
// the user changes it from the in-game Settings button.

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

export function showSettingsPanel(root, settings, onSave) {
  root.querySelector('.cosmic-settings-overlay')?.remove();

  const radio = (name, value, label, checked) => {
    const id = `spi-${name}-${value}`;
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
  const backSwatch = (value, label, checked) => {
    const id = `spi-back-${value}`;
    const input = el('input', { type: 'radio', name: 'cardBack', id, value });
    if (checked) input.checked = true;
    const swatch = el('div', { class: `cosmic-back-swatch back-${value}` }, [
      el('div', { class: 'cosmic-card-back' }),
    ]);
    return el('label', { class: 'cosmic-back-choice', for: id, title: label },
      [input, swatch, el('span', { class: 'cosmic-back-label' }, label)]);
  };

  const diff = settings.difficulty === 4 ? '4' : settings.difficulty === 2 ? '2' : '1';
  const card = el('div', { class: 'cosmic-win-card cosmic-settings-card' }, [
    el('div', { class: 'cosmic-win-title' }, 'Settings'),
    section('Difficulty',
      radio('diff', '1', '1 Suit',  diff === '1'),
      radio('diff', '2', '2 Suits', diff === '2'),
      radio('diff', '4', '4 Suits', diff === '4'),
    ),
    section('Display',
      check('spi-fourcolor', '4-color suits', !!settings.fourColor),
      check('spi-lefty', 'Left-handed layout', !!settings.leftHanded),
      check('spi-timed', 'Show timer', settings.timed !== false),
    ),
    section('Card back',
      backSwatch('nebula', 'Nebula', (settings.cardBack || 'nebula') === 'nebula'),
      backSwatch('hex',    'Hex',    settings.cardBack === 'hex'),
      backSwatch('warp',   'Warp',   settings.cardBack === 'warp'),
      backSwatch('aurora', 'Aurora', settings.cardBack === 'aurora'),
    ),
    el('div', { class: 'cosmic-settings-hint' },
      'Difficulty applies on the next deal.'),
    el('div', { class: 'cosmic-settings-actions' }, [
      el('button', { class: 'cosmic-btn', type: 'button', 'data-act': 'cancel' }, 'Cancel'),
      el('button', { class: 'cosmic-btn', type: 'button', 'data-act': 'save' }, 'Save'),
    ]),
  ]);
  const { overlay, close } = mountOverlay(root, card, { extraClass: 'cosmic-settings-overlay' });

  overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
  overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
    const diffVal = overlay.querySelector('input[name="diff"]:checked')?.value;
    const next = {
      difficulty: diffVal === '4' ? 4 : diffVal === '2' ? 2 : 1,
      fourColor: overlay.querySelector('#spi-fourcolor').checked,
      leftHanded: overlay.querySelector('#spi-lefty').checked,
      timed: overlay.querySelector('#spi-timed').checked,
      cardBack: overlay.querySelector('input[name="cardBack"]:checked')?.value || 'nebula',
    };
    close();
    onSave(next);
  });
}
