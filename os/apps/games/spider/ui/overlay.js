// overlay.js — shared overlay helper for Spider modals. Mirrors the
// Solitaire version so the two games can evolve independently; kept
// duplicated (not imported) so spider/ has no cross-game imports.

import { el } from '../../../../utils/dom.js';

export function mountOverlay(root, card, { extraClass = '' } = {}) {
  const overlay = el('div', { class: `cosmic-win-overlay ${extraClass}`.trim() }, [card]);
  root.append(overlay);
  setTimeout(() => overlay.classList.add('visible'), 20);
  const close = () => overlay.remove();
  return { overlay, close };
}
