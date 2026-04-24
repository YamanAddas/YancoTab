// pause.js — Just the pause overlay DOM. All timer/state juggling lives in
// SolitaireApp so the caller can keep `startTs` etc. as private fields.

import { el } from '../../../../utils/dom.js';

export function mountPauseOverlay(host, onDismiss) {
  if (!host || host.querySelector('.cosmic-pause-overlay')) return null;
  const overlay = el('div', {
    class: 'cosmic-pause-overlay',
    style: 'position:absolute;inset:0;background:rgba(6,11,20,0.72);' +
           'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
           'display:grid;place-items:center;z-index:1000;cursor:pointer;',
  }, el('div', {
    style: 'font:600 20px var(--font-sans);letter-spacing:0.12em;' +
           'text-transform:uppercase;color:var(--accent-bright);' +
           'text-shadow:0 0 16px var(--accent-glow);',
  }, 'Paused — tap to resume'));
  overlay.addEventListener('click', onDismiss);
  host.appendChild(overlay);
  return overlay;
}
