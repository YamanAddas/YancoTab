// NewGameMenu.js — dropdown anchored to the New Game button.

import { el } from '../../../../utils/dom.js';

export function showNewGameMenu(root, anchor, items) {
  // Dismiss any existing menu.
  root.querySelector('.cosmic-menu')?.remove();
  const mk = (label, onClick) => {
    const b = el('button', { class: 'cosmic-menu-item', type: 'button' }, label);
    b.addEventListener('click', () => { menu.remove(); onClick(); });
    return b;
  };
  const menu = el('div', { class: 'cosmic-menu' }, items.map(({ label, onClick }) => mk(label, onClick)));

  // Position above the toolbar anchor.
  const rect = anchor.getBoundingClientRect();
  const frameRect = root.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.right = `${Math.max(12, frameRect.right - rect.right)}px`;
  menu.style.bottom = `${frameRect.bottom - rect.top + 8}px`;
  root.append(menu);

  const dismiss = (e) => {
    if (menu.contains(e.target) || anchor.contains(e.target)) return;
    menu.remove();
    document.removeEventListener('pointerdown', dismiss, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);
}
