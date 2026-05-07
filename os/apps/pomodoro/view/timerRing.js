/**
 * pomodoro/view/timerRing.js — 240px SVG progress ring + face.
 *
 * Pure DOM builder. The shell calls update({remainingMs, totalMs, label, sub}).
 * Stroke runs counter-clockwise (svg rotated -90deg in CSS) so the ring
 * fills as time advances.
 */

import { el } from '../../../utils/dom.js';

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~289

function formatMMSS(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function buildTimerRing() {
  const root = el('div', { class: 'sol-ring' });
  // SVG markup — pure presentation, defs include the gradient.
  root.innerHTML = `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="solRingGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#33ffdd"/>
          <stop offset="100%" stop-color="#00e5c1"/>
        </linearGradient>
      </defs>
      <circle class="sol-ring-track" cx="50" cy="50" r="${RADIUS}"
              fill="none" stroke-width="4"/>
      <circle class="sol-ring-fill" cx="50" cy="50" r="${RADIUS}"
              fill="none" stroke-width="5" stroke-linecap="round"
              stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}"
              stroke-dashoffset="${CIRCUMFERENCE.toFixed(2)}"/>
    </svg>
    <div class="sol-ring-face">
      <span class="sol-ring-label">Focus</span>
      <span class="sol-ring-time" data-time>00:00</span>
      <span class="sol-ring-sub" data-sub>of 25:00</span>
    </div>
  `;

  return {
    root,
    /** Update the ring + face from current engine state. */
    update({ remainingMs, totalMs, label, subLabel, phase }) {
      const fill = root.querySelector('.sol-ring-fill');
      const timeEl = root.querySelector('[data-time]');
      const subEl = root.querySelector('[data-sub]');
      const labelEl = root.querySelector('.sol-ring-label');

      const safeTotal = Number.isFinite(totalMs) && totalMs > 0 ? totalMs : 1;
      const progress = Math.max(0, Math.min(1, 1 - (remainingMs / safeTotal)));
      const offset = CIRCUMFERENCE * (1 - progress);

      if (fill) fill.setAttribute('stroke-dashoffset', offset.toFixed(2));
      if (timeEl) timeEl.textContent = formatMMSS(remainingMs);
      if (subEl) subEl.textContent = subLabel;
      if (labelEl) labelEl.textContent = label;

      // Phase tint via class for CSS variants.
      root.classList.toggle('is-focus', phase === 'focus');
      root.classList.toggle('is-break', phase === 'break');
      root.classList.toggle('is-long-break', phase === 'longBreak');
      root.classList.toggle('is-idle', phase === 'idle');
    },
  };
}

export { formatMMSS };
