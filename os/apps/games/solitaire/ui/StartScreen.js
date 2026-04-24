// StartScreen.js — first-open menu for Solitaire.
//
// Shown on app init (and via the New Game ▾ menu → "Main Menu" / Pause) so
// the user always has a clear entry point — especially useful when a saved
// game exists and they want "Continue" instead of auto-deal.
//
// Pure view: buttons dispatch through the handlers bag passed in. The title
// is styled as an arabesque italic serif with a decorative flourish above
// and below — see .cosmic-start-title / .cosmic-start-ornament in the CSS.

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

// Inline arabesque flourish: dashed side-rules, two small dots, and a
// centered diamond-in-diamond. All strokes use currentColor so the CSS
// picks the accent; the SVG itself has no external refs or scripts.
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

export function showStartScreen(root, { hasSave = false } = {}, handlers = {}) {
  // Dismiss any stray menu first.
  root.querySelector('.cosmic-start-overlay')?.remove();

  // btn(label, onClick, { variant, keepOpen }) — keepOpen=true leaves the
  // start screen mounted so Stats/Settings can stack on top and the user
  // returns to the menu on dismiss.
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

  const buttons = [];
  if (hasSave) {
    buttons.push(btn('Continue',      handlers.onContinue, { variant: 'primary' }));
    buttons.push(btn('New Game',      handlers.onNewGame));
  } else {
    buttons.push(btn('New Game',      handlers.onNewGame, { variant: 'primary' }));
  }
  buttons.push(btn('Daily Deal',      handlers.onDaily));
  buttons.push(btn('Winnable Random', handlers.onWinnable));
  buttons.push(btn('Custom Seed…',    handlers.onCustomSeed));
  buttons.push(el('div', { class: 'cosmic-start-divider' }));
  buttons.push(btn('Statistics',      handlers.onStats,    { keepOpen: true }));
  buttons.push(btn('Settings',        handlers.onSettings, { keepOpen: true }));

  // Inline SVG (trusted, no scripts/externals) — safe to set via innerHTML.
  const ornamentTop = el('div', { class: 'cosmic-start-ornament' });
  ornamentTop.innerHTML = ORNAMENT_SVG;
  const ornamentBot = el('div', { class: 'cosmic-start-ornament' });
  ornamentBot.innerHTML = ORNAMENT_SVG;

  const card = el('div', { class: 'cosmic-win-card cosmic-start-card' }, [
    ornamentTop,
    el('div', { class: 'cosmic-start-title' }, 'Solitaire'),
    ornamentBot,
    el('div', { class: 'cosmic-start-sub' },
      hasSave ? 'Pick up where you left off, or start something fresh.'
              : 'Pick a deal to begin.'),
    el('div', { class: 'cosmic-start-actions' }, buttons),
  ]);

  const { overlay, close } = mountOverlay(root, card, { extraClass: 'cosmic-start-overlay' });
  return { overlay, close };
}
