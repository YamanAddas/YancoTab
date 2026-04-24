// StuckPrompt.js — "No moves left" modal. Pure view.

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

export function showStuckPrompt(root, { onUndo, onNew, onClose }) {
  const card = el('div', { class: 'cosmic-win-card' }, [
    el('div', { class: 'cosmic-win-title' }, 'No moves left'),
    el('div', { class: 'cosmic-win-sub' }, 'The board is stuck. Undo the last move or start a new deal.'),
    el('div', {
      class: 'cosmic-stuck-actions',
      style: 'display:flex; gap:10px; justify-content:center; margin-top:16px;',
    }, [
      el('button', { class: 'cosmic-btn', type: 'button', 'data-act': 'undo' }, 'Undo'),
      el('button', { class: 'cosmic-btn', type: 'button', 'data-act': 'new' }, 'New Deal'),
    ]),
  ]);
  const { overlay, close } = mountOverlay(root, card);
  const closeAll = () => { close(); onClose?.(); };
  overlay.querySelector('[data-act="undo"]').addEventListener('click', () => { closeAll(); onUndo(); });
  overlay.querySelector('[data-act="new"]').addEventListener('click', () => { closeAll(); onNew(); });
}
