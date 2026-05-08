/**
 * pdf/view/readerBar.js — top reader chrome.
 *
 * Layout: prev / title / page-counter / heat strip / search / next.
 * Heat strip = the last 7 days of the user's reading streak rendered
 * as 5×16 hex pips of varying alpha. Click the page counter to
 * type a page number.
 */

import { el } from '../../../utils/dom.js';

export function buildReaderBar({ onPrev, onNext, onJumpToPage, onToggleSearch } = {}) {
  const root = el('div', { class: 'cx-reader-bar' });

  const prevBtn = el('button', { type: 'button', class: 'cx-icbtn', title: 'Previous (←)', 'aria-label': 'Previous page' }, '‹');
  const nextBtn = el('button', { type: 'button', class: 'cx-icbtn', title: 'Next (→)', 'aria-label': 'Next page' }, '›');
  prevBtn.addEventListener('click', () => onPrev?.());
  nextBtn.addEventListener('click', () => onNext?.());

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

  const heat = el('span', { class: 'cx-heat', title: 'Reading streak (last 7 days)' });

  const searchBtn = el('button', {
    type: 'button', class: 'cx-icbtn', title: 'Search inside (⌘K)', 'aria-label': 'Search inside',
  }, '⌘');
  searchBtn.addEventListener('click', () => onToggleSearch?.());

  root.append(prevBtn, title, pageCounter, heat, searchBtn, nextBtn);

  return {
    root,
    update({ docTitle, sectionLabel, page, totalPages, streakStrip = [] }) {
      titleText.textContent = docTitle ? `${docTitle}` : '— No PDF —';
      titleSection.textContent = sectionLabel ? `· ${sectionLabel}` : '';
      pageCounter.dataset.max = String(totalPages || 0);
      pageCounter.dataset.cur = String(page || 1);
      pageCounter.innerHTML = '';
      pageCounter.appendChild(el('b', {}, String(page || '—')));
      pageCounter.appendChild(document.createTextNode(' / '));
      pageCounter.appendChild(document.createTextNode(String(totalPages || '—')));

      // Heat strip — last 7 days from the streak strip (which is 14
      // days oldest-first; we take the rightmost 7).
      heat.innerHTML = '';
      const last7 = streakStrip.slice(-7);
      for (const b of last7) {
        const pip = document.createElement('i');
        pip.style.setProperty('--a', String(Math.max(0.08, b.density || 0.08)));
        heat.appendChild(pip);
      }

      // Disable nav buttons at boundaries.
      prevBtn.disabled = !page || page <= 1;
      nextBtn.disabled = !page || !totalPages || page >= totalPages;
    },
  };
}
