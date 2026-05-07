/**
 * notes/view/searchBeam.js — bottom-anchored search input.
 */

import { el } from '../../../utils/dom.js';

export function buildSearchBeam({ onSearch }) {
  const root = el('div', { class: 'nc-search-beam' });

  // Magnifier icon (inline SVG so we don't need an asset).
  const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  iconSvg.setAttribute('class', 'nc-search-icon');
  iconSvg.setAttribute('viewBox', '0 0 24 24');
  iconSvg.setAttribute('fill', 'none');
  iconSvg.setAttribute('stroke', 'currentColor');
  iconSvg.setAttribute('stroke-width', '2');
  iconSvg.innerHTML = '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>';

  const input = el('input', {
    type: 'search',
    class: 'nc-search-input',
    placeholder: 'Search notes — focus a beam through matches…',
    spellcheck: 'false',
  });
  let debounce = null;
  input.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => onSearch?.(input.value), 120);
  });

  const kbd = el('span', { class: 'nc-search-kbd' }, '⌘ /');

  root.append(iconSvg, input, kbd);

  return {
    root,
    setValue(v) { if (input.value !== v) input.value = v || ''; },
    focus() { input.focus(); input.select(); },
  };
}
