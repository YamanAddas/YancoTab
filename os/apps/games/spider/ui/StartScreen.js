// StartScreen.js — first-open menu for Spider.
//
// Shown on app init and via Pause / Main Menu. When a save exists, "Continue"
// becomes the primary action. Difficulty is chosen here so the user starts
// exactly the game they want — no mid-deal difficulty switch required.

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

// Same arabesque flourish as Solitaire's StartScreen. Inline SVG is trusted
// (no scripts, no external refs) so innerHTML is safe here.
const ORNAMENT_SVG = `
<svg viewBox="0 0 240 20" width="200" height="16" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-linecap="round">
    <line x1="6"   y1="10" x2="94"  y2="10" stroke-width="1" stroke-dasharray="1 4" opacity="0.5"/>
    <line x1="146" y1="10" x2="234" y2="10" stroke-width="1" stroke-dasharray="1 4" opacity="0.5"/>
    <circle cx="100" cy="10" r="1.4" fill="currentColor" stroke="none" opacity="0.65"/>
    <circle cx="140" cy="10" r="1.4" fill="currentColor" stroke="none" opacity="0.65"/>
    <path d="M120 2 L128 10 L120 18 L112 10 Z" stroke-width="1" opacity="0.9"/>
    <path d="M120 6 L124 10 L120 14 L116 10 Z" fill="currentColor" stroke="none" opacity="0.55"/>
  </g>
</svg>`;

export function showStartScreen(root, { hasSave = false, difficulty = 1 } = {}, handlers = {}) {
  root.querySelector('.cosmic-start-overlay')?.remove();

  const btn = (label, onClick, opts = {}) => {
    const variant = opts.variant || 'secondary';
    const b = el('button', {
      class: `cosmic-btn cosmic-start-btn cosmic-start-${variant}`,
      type: 'button',
    }, label);
    b.addEventListener('click', () => {
      if (!opts.keepOpen) close();
      onClick?.();
    });
    return b;
  };

  // Difficulty radio row: primary "Start" button below dispatches with the
  // chosen value, so we don't close the overlay on selection.
  let selected = difficulty;
  const diffRow = el('div', { class: 'cosmic-spider-diff-row' });
  const mkDiff = (val, label) => {
    const b = el('button', {
      class: `cosmic-btn cosmic-spider-diff${val === selected ? ' selected' : ''}`,
      type: 'button',
      'data-val': String(val),
    }, label);
    b.addEventListener('click', () => {
      selected = val;
      diffRow.querySelectorAll('.cosmic-spider-diff').forEach((el) => el.classList.remove('selected'));
      b.classList.add('selected');
    });
    return b;
  };
  diffRow.append(mkDiff(1, '1 Suit'), mkDiff(2, '2 Suits'), mkDiff(4, '4 Suits'));

  const buttons = [];
  if (hasSave) {
    buttons.push(btn('Continue', handlers.onContinue, { variant: 'primary' }));
    buttons.push(btn('New Game', () => handlers.onNewGame?.(selected)));
  } else {
    buttons.push(btn('New Game', () => handlers.onNewGame?.(selected), { variant: 'primary' }));
  }
  buttons.push(el('div', { class: 'cosmic-start-divider' }));
  buttons.push(btn('Statistics', handlers.onStats,    { keepOpen: true }));
  buttons.push(btn('Settings',   handlers.onSettings, { keepOpen: true }));

  const ornamentTop = el('div', { class: 'cosmic-start-ornament' });
  ornamentTop.innerHTML = ORNAMENT_SVG;
  const ornamentBot = el('div', { class: 'cosmic-start-ornament' });
  ornamentBot.innerHTML = ORNAMENT_SVG;

  const card = el('div', { class: 'cosmic-win-card cosmic-start-card' }, [
    ornamentTop,
    el('div', { class: 'cosmic-start-title' }, 'Spider'),
    ornamentBot,
    el('div', { class: 'cosmic-start-sub' },
      hasSave ? 'Pick up where you left off, or start something fresh.'
              : 'Choose a difficulty to begin.'),
    el('div', { class: 'cosmic-spider-diff-label' }, 'Difficulty'),
    diffRow,
    el('div', { class: 'cosmic-start-actions' }, buttons),
  ]);

  const { overlay, close } = mountOverlay(root, card, { extraClass: 'cosmic-start-overlay' });
  return { overlay, close };
}
