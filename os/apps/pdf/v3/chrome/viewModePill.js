/**
 * pdf/v3/chrome/viewModePill.js — 4-segment view-mode toggle.
 *
 * Mounts in the toolbar's zoom cluster. Shows Single / Continuous /
 * Spread / Book as a horizontal pill where the active segment fills
 * with the accent color. Clicking a segment fires onSelect(mode).
 *
 * Target size: ≤ 90 lines.
 */

import { el } from '../../../../utils/dom.js';

const MODES = [
  { id: 'single',     label: 'Single',     svg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="4" width="10" height="16" rx="1"/></svg>' },
  { id: 'continuous', label: 'Continuous', svg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="8" rx="1"/><rect x="7" y="12" width="10" height="8" rx="1"/></svg>' },
  { id: 'spread',     label: 'Spread',     svg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="9" height="16" rx="1"/><rect x="13" y="4" width="9" height="16" rx="1"/></svg>' },
  { id: 'book',       label: 'Book',       svg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="4" width="9" height="16" rx="1"/></svg>' },
];

let _parser = null;
function svgParser() {
  if (!_parser) _parser = new DOMParser();
  return _parser;
}

export function buildViewModePill({ onSelect, initial = 'continuous' } = {}) {
  const root = el('div', {
    class: 'pdf-viewmode-pill',
    role: 'tablist',
    'aria-label': 'View mode',
  });

  const segmentsById = new Map();
  let active = initial;

  for (const m of MODES) {
    const btn = el('button', {
      type: 'button',
      class: 'pdf-viewmode-seg',
      role: 'tab',
      'data-mode': m.id,
      title: m.label,
      'aria-label': m.label,
    });
    btn.appendChild(svgParser().parseFromString(m.svg, 'image/svg+xml').documentElement);
    btn.addEventListener('click', () => {
      if (active === m.id) return;
      setActive(m.id);
      onSelect?.(m.id);
    });
    segmentsById.set(m.id, btn);
    root.appendChild(btn);
  }

  function setActive(mode) {
    if (!segmentsById.has(mode)) return;
    active = mode;
    for (const [id, btn] of segmentsById) {
      btn.classList.toggle('is-active', id === mode);
      btn.setAttribute('aria-selected', id === mode ? 'true' : 'false');
    }
  }

  setActive(initial);

  return {
    root,
    setActive,
    getActive: () => active,
  };
}
