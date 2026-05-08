/**
 * pdf/view/selectionMenu.js — floating menu over a text selection.
 *
 * The Codex stage owns the menu. We position it via fixed coords
 * (in viewport space) just above the selection bounding rect and
 * arrow it toward the selection center. The menu commits actions
 * via callbacks; the orchestrator is responsible for wiring them.
 */

import { el } from '../../../utils/dom.js';

const MARGIN_TOP_PX = 6;

export function buildSelectionMenu({ onCopy, onSendToNotes, onCalc, onCite, onBookmark } = {}) {
  const root = el('div', { class: 'cx-sel-menu', role: 'toolbar' });
  root.style.display = 'none';

  function btn(label, title, handler) {
    const b = el('button', { type: 'button', class: 'cx-sel-btn', title }, label);
    b.addEventListener('mousedown', (e) => {
      // Prevent the click from collapsing the selection before our handler runs.
      e.preventDefault();
    });
    b.addEventListener('click', () => handler?.());
    return b;
  }

  const copyBtn  = btn('Copy', 'Copy quoted text + citation', () => onCopy?.());
  const noteBtn  = btn('→ Notes', 'Copy as Notes-ready quote', () => onSendToNotes?.());
  noteBtn.classList.add('is-primary');
  const calcBtn  = btn('Calc', 'Evaluate as expression', () => onCalc?.());
  const citeBtn  = btn('Cite', 'Copy citation only', () => onCite?.());
  const bmBtn    = btn('★ Bookmark', 'Bookmark this page with the selection as label', () => onBookmark?.());

  const div = () => el('span', { class: 'cx-sel-div' });
  root.append(noteBtn, div(), copyBtn, citeBtn, div(), calcBtn, div(), bmBtn);

  return {
    root,
    show(rect) {
      if (!rect || rect.width === 0) { root.style.display = 'none'; return; }
      // Position centered above the rect.
      root.style.display = 'flex';
      const menuRect = root.getBoundingClientRect();
      let left = rect.left + (rect.width / 2) - (menuRect.width / 2);
      let top = rect.top - menuRect.height - MARGIN_TOP_PX;
      // If the selection is near the top of the viewport, flip below.
      if (top < 8) top = rect.bottom + MARGIN_TOP_PX;
      // Clamp horizontally.
      const maxLeft = window.innerWidth - menuRect.width - 8;
      if (left < 8) left = 8;
      if (left > maxLeft) left = maxLeft;
      root.style.left = `${Math.round(left)}px`;
      root.style.top = `${Math.round(top)}px`;
    },
    hide() { root.style.display = 'none'; },
    /** Toggle the calc button visibility based on whether the
     *  selection looks numeric. */
    setCalcAvailable(available) {
      calcBtn.style.display = available ? '' : 'none';
    },
  };
}
