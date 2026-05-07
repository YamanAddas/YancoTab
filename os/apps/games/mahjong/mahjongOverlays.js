/**
 * mahjongOverlays.js — Win + stuck overlay builders.
 *
 * Pure DOM, no app-state mutation. Handlers passed in by the host so
 * we don't reach back into the App instance.
 */
import { el } from '../../../utils/dom.js';

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export function buildWinOverlay({ moves, elapsed, hintsUsed, shufflesUsed, bestTime, comboStreak, onNew }) {
  const bestStr = bestTime != null ? `Best: ${fmtTime(bestTime)}` : '';
  const lines = [
    `Moves: ${moves}  •  Time: ${fmtTime(elapsed)}`,
    `Hints: ${hintsUsed}  •  Shuffles: ${shufflesUsed}`,
    comboStreak > 0 ? `Best combo this game: ×${comboStreak}` : '',
    bestStr,
  ].filter(Boolean).join('\n');
  return el('div', { class: 'mj-overlay' }, [
    el('div', { class: 'mj-overlay-title win' }, '🎉 You Win!'),
    el('div', { class: 'mj-overlay-sub' }, lines),
    el('button', { class: 'mj-overlay-btn', onclick: onNew }, '▶ Play Again'),
  ]);
}

export function buildStuckOverlay({ tilesLeft, onShuffle, onNew }) {
  return el('div', { class: 'mj-overlay' }, [
    el('div', { class: 'mj-overlay-title stuck' }, 'No Moves'),
    el('div', { class: 'mj-overlay-sub' }, `${tilesLeft} tiles remaining.\nShuffle or start a new game.`),
    el('div', { class: 'mj-overlay-actions' }, [
      el('button', { class: 'mj-overlay-btn', onclick: onShuffle }, '🔀 Shuffle'),
      el('button', { class: 'mj-overlay-btn', onclick: onNew }, '⟳ New'),
    ]),
  ]);
}
