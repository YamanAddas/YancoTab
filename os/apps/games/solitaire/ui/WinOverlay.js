// WinOverlay.js — Victory modal. Pure view.

import { el } from '../../../../utils/dom.js';
import { mountOverlay } from './overlay.js';

export function showWinOverlay(root, { score, moves, time }, onNewGame) {
  const card = el('div', { class: 'cosmic-win-card' }, [
    el('div', { class: 'cosmic-win-title' }, 'Victory'),
    el('div', { class: 'cosmic-win-sub' }, `Score ${score} · Moves ${moves} · Time ${time}`),
    el('button', { class: 'cosmic-btn', type: 'button', style: 'margin-top: 16px;' }, 'New Game'),
  ]);
  const { overlay, close } = mountOverlay(root, card);
  overlay.querySelector('button').addEventListener('click', () => { close(); onNewGame(); });
}
