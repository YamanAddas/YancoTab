// WinOverlay.js — Spider victory modal. Pure view.

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

const DIFF_LABEL = { 1: '1 Suit', 2: '2 Suits', 4: '4 Suits' };

export function showWinOverlay(root, { score, moves, time, difficulty }, onNewGame) {
  const subParts = [
    `Score ${score}`,
    `Moves ${moves}`,
    time ? `Time ${time}` : null,
    DIFF_LABEL[difficulty] || null,
  ].filter(Boolean);
  const card = el('div', { class: 'cosmic-win-card' }, [
    el('div', { class: 'cosmic-win-title' }, 'Victory'),
    el('div', { class: 'cosmic-win-sub' }, subParts.join(' · ')),
    el('button', { class: 'cosmic-btn', type: 'button', style: 'margin-top: 16px;' }, 'New Game'),
  ]);
  const { overlay, close } = mountOverlay(root, card);
  overlay.querySelector('button').addEventListener('click', () => { close(); onNewGame(); });
}
