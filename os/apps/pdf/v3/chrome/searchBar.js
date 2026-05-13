/**
 * pdf/v3/chrome/searchBar.js — floating find-bar overlay.
 *
 * Anchored top-right of the page area (16px inset). 320px wide. Layout:
 *   [input] [N of M] [↑ prev] [↓ next] [× close]
 *
 * Ctrl+F toggles open/close. Escape inside the input closes it.
 *
 * Target size: ≤ 200 lines.
 */

import { el } from '../../../../utils/dom.js';
import { ICONS } from './icons.js';

const _svgParser = new DOMParser();

export function buildSearchBar({ onChange, onPrev, onNext, onClose } = {}) {
  const root = el('div', { class: 'pdf-find-bar' });
  root.style.display = 'none';

  const input = el('input', {
    type: 'text',
    class: 'pdf-find-input',
    placeholder: 'Find in document',
    'aria-label': 'Find in document',
  });
  let inputTimer = 0;
  input.addEventListener('input', () => {
    if (inputTimer) clearTimeout(inputTimer);
    inputTimer = setTimeout(() => { onChange?.(input.value); }, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev?.(); else onNext?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  });

  const counter = el('span', { class: 'pdf-find-counter' }, '');

  const prevBtn = iconBtn(ICONS.prev, 'Previous match', () => onPrev?.());
  const nextBtn = iconBtn(ICONS.next, 'Next match', () => onNext?.());
  const closeBtn = iconBtn(ICONS.close, 'Close find (Esc)', () => onClose?.());

  root.append(input, counter, prevBtn, nextBtn, closeBtn);

  function iconBtn(svgHtml, title, handler) {
    const b = el('button', {
      type: 'button', class: 'pdf-find-btn', title, 'aria-label': title,
    });
    if (svgHtml) b.appendChild(_svgParser.parseFromString(svgHtml, 'image/svg+xml').documentElement);
    b.addEventListener('click', handler);
    return b;
  }

  function show() {
    root.style.display = 'inline-flex';
    setTimeout(() => { input.focus(); input.select(); }, 0);
  }
  function hide() { root.style.display = 'none'; }
  function isOpen() { return root.style.display !== 'none'; }
  function setCounter({ idx, total, done }) {
    if (!total) {
      counter.textContent = done ? 'No matches' : 'Searching…';
      counter.classList.toggle('is-empty', !!done);
      return;
    }
    counter.textContent = `${idx + 1} of ${total}${done ? '' : '…'}`;
    counter.classList.remove('is-empty');
  }
  function getQuery() { return input.value; }
  function setQuery(s) { input.value = s; }
  function clear() {
    input.value = '';
    counter.textContent = '';
  }

  return { root, show, hide, isOpen, setCounter, getQuery, setQuery, clear };
}
