/**
 * pdf/view/readerBar.js — top reader chrome.
 *
 * Layout:
 *   prev | title · section | page-counter | view-mode group | zoom group |
 *   rotate | search | next
 *
 * Heat strip lives on the side rail in v2; the reader bar focuses on
 * navigation + view controls. Click the page counter to type a page number.
 */

import { el } from '../../../utils/dom.js';
import { buildZoomControls } from './zoomControls.js';
import { buildViewModeMenu, VIEW_MODES } from './viewModeMenu.js';

export function buildReaderBar({
  onPrev, onNext, onJumpToPage, onToggleSearch,
  onZoomStep, onZoomPick, onModePick, onRotate,
  getZoom,
} = {}) {
  const root = el('div', { class: 'cx-reader-bar' });

  const prevBtn = el('button', {
    type: 'button', class: 'cx-icbtn',
    title: 'Previous (←)', 'aria-label': 'Previous page',
    onclick: () => onPrev?.(),
  }, '‹');
  const nextBtn = el('button', {
    type: 'button', class: 'cx-icbtn',
    title: 'Next (→)', 'aria-label': 'Next page',
    onclick: () => onNext?.(),
  }, '›');

  const title = el('div', { class: 'cx-bar-title' });
  const titleText = el('span', { class: 'cx-bar-title-text' });
  const titleSection = el('b', { class: 'cx-bar-section' });
  title.append(titleText, titleSection);

  const pageCounter = el('button', {
    type: 'button', class: 'cx-page-counter', title: 'Jump to page…',
  });
  pageCounter.addEventListener('click', () => {
    const max = Number(pageCounter.dataset.max || 0);
    if (max <= 0) return;
    const cur = Number(pageCounter.dataset.cur || 1);
    const v = window.prompt(`Jump to page (1–${max})`, String(cur));
    if (v == null) return;
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) onJumpToPage?.(n);
  });

  const modeMenu = buildViewModeMenu({
    initial: 'continuous',
    onPick: (m) => onModePick?.(m),
  });

  const zoom = buildZoomControls({
    onStep: (d) => onZoomStep?.(d),
    onPick: (level) => onZoomPick?.(level),
    getCurrent: () => getZoom?.(),
  });

  const rotateBtn = el('button', {
    type: 'button', class: 'cx-icbtn',
    title: 'Rotate page right',
    'aria-label': 'Rotate page right',
    onclick: () => onRotate?.(),
  }, '⟳');

  const searchBtn = el('button', {
    type: 'button', class: 'cx-icbtn',
    title: 'Find in document (Ctrl+F)',
    'aria-label': 'Find in document',
    onclick: () => onToggleSearch?.(),
  }, '⌕');

  root.append(
    prevBtn, title,
    pageCounter,
    modeMenu.root,
    zoom.root,
    rotateBtn,
    searchBtn,
    nextBtn,
  );

  return {
    root,
    update({ docTitle, sectionLabel, page, totalPages, zoomLevel, mode }) {
      titleText.textContent = docTitle ? `${docTitle}` : '— No PDF —';
      titleSection.textContent = sectionLabel ? `· ${sectionLabel}` : '';
      pageCounter.dataset.max = String(totalPages || 0);
      pageCounter.dataset.cur = String(page || 1);
      pageCounter.innerHTML = '';
      pageCounter.appendChild(el('b', {}, String(page || '—')));
      pageCounter.appendChild(document.createTextNode(' / '));
      pageCounter.appendChild(document.createTextNode(String(totalPages || '—')));

      if (zoomLevel !== undefined) zoom.update(zoomLevel);
      if (mode && VIEW_MODES.includes(mode)) modeMenu.setMode(mode);

      prevBtn.disabled = !page || page <= 1;
      nextBtn.disabled = !page || !totalPages || page >= totalPages;
    },
    setZoomLevel: (level) => zoom.update(level),
    setMode: (mode) => modeMenu.setMode(mode),
    destroy: () => zoom.destroy(),
  };
}
