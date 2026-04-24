// StartScreen.js — first-open menu for Cosmic Klondike.
//
// Shown on app init (and via the New Game ▾ menu → "Main Menu") so the user
// always has a clear entry point — especially useful when a saved game exists
// and they want "Continue" instead of auto-deal, or when something broke and
// the board would otherwise be blank.
//
// Pure view: buttons dispatch through the handlers bag passed in.

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

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

  const card = el('div', { class: 'cosmic-win-card cosmic-start-card' }, [
    el('div', { class: 'cosmic-start-eyebrow' }, 'Cosmic Klondike'),
    el('div', { class: 'cosmic-win-title cosmic-start-title' }, 'Solitaire'),
    el('div', { class: 'cosmic-start-sub' },
      hasSave ? 'Pick up where you left off, or start something fresh.'
              : 'Pick a deal to begin.'),
    el('div', { class: 'cosmic-start-actions' }, buttons),
  ]);

  const { overlay, close } = mountOverlay(root, card, { extraClass: 'cosmic-start-overlay' });
  return { overlay, close };
}
