/**
 * settings/view/rituals.js — 3 ritual cards in a row.
 *
 * Each card shows shortcut · name · blurb. Click to apply.
 */

import { el } from '../../../utils/dom.js';
import { listRituals } from '../engine/rituals.js';

function colorVar(color) {
  switch (color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildRituals({ onApplyRitual }) {
  const root = el('div', { class: 'mc-rituals-section' });
  const header = el('h3', { class: 'mc-section-h' }, 'Quick rituals');
  const grid = el('div', { class: 'mc-rituals' });
  root.append(header, grid);

  for (const r of listRituals()) {
    const card = el('button', {
      type: 'button',
      class: 'mc-ritual',
      'data-ritual-id': r.id,
      style: { '--mc-ritual-color': colorVar(r.color) },
    }, [
      el('span', { class: 'mc-ritual-shortcut' }, r.shortcut),
      el('span', { class: 'mc-ritual-name' }, r.name),
      el('span', { class: 'mc-ritual-blurb' }, r.blurb),
    ]);
    // CSS custom property needs setProperty — Object.assign(el.style, ...) skips them.
    card.style.setProperty('--mc-ritual-color', colorVar(r.color));
    card.addEventListener('click', () => onApplyRitual(r.id));
    grid.appendChild(card);
  }

  return { root };
}
