/**
 * pomodoro/view/sky.js — sky band day↔night.
 *
 * Pure DOM builder. The shell flips `.is-night` based on engine state.
 * The arc marker shows progress along the focus session (0% left → 100% right).
 *
 * Tapping the sky calls `onTap()` (handled by the shell — toggles manual
 * sky override in the engine).
 */

import { el } from '../../../utils/dom.js';

export function buildSky({ onTap }) {
  const root = el('div', { class: 'sol-sky', role: 'button', tabindex: '0',
    'aria-label': 'Toggle sky preview' });

  // Use innerHTML for the layered cosmetic markup — pure presentation, no user input.
  root.innerHTML = `
    <div class="sol-sky-stars" aria-hidden="true"></div>
    <div class="sol-sky-moon" aria-hidden="true"></div>
    <div class="sol-sky-sun" aria-hidden="true"></div>
    <div class="sol-sky-ground" aria-hidden="true"></div>
    <div class="sol-sky-horizon" aria-hidden="true"></div>
    <div class="sol-sky-arc" aria-hidden="true" style="left: 0%"></div>
  `;

  const handleTap = (e) => {
    if (typeof onTap === 'function') onTap(e);
  };
  root.addEventListener('click', handleTap);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTap(e);
    }
  });

  return {
    root,
    /** Flip day/night class. `effective` is 'day' or 'night'. */
    setMode(effective) {
      root.classList.toggle('is-night', effective === 'night');
    },
    /** Move the arc marker. `progress` is 0..1. */
    setProgress(progress) {
      const arc = root.querySelector('.sol-sky-arc');
      if (arc) arc.style.left = `${Math.max(4, Math.min(96, progress * 100))}%`;
    },
  };
}
