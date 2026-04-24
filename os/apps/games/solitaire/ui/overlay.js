// overlay.js — shared overlay helper for Solitaire modals.
// Builds a `.cosmic-win-overlay` shell, mounts it, fades it in, and returns the
// element + a close function. Keeps modal code DRY; pure view — no game logic.

import { el } from '../../../../utils/dom.js';

export function mountOverlay(root, card, { extraClass = '' } = {}) {
  const overlay = el('div', { class: `cosmic-win-overlay ${extraClass}`.trim() }, [card]);
  root.append(overlay);
  setTimeout(() => overlay.classList.add('visible'), 20);
  const close = () => overlay.remove();
  return { overlay, close };
}
