/**
 * pdf/v3/chrome/toolbar.js — Adobe-style top toolbar (minimal Phase B).
 *
 * Five clusters per the design doc; Phase B fills only what's needed
 * to use the reader: sidebar toggle (no-op stub), navigation (prev /
 * next / page input / total), zoom (-/level/+), and a more-stub.
 * Full tool cluster + actions cluster land in Phase C.
 *
 * Visual: 48px tall, flat surface, SVG icons via the icons registry.
 *
 * Target size: ≤ 350 lines.
 */

import { el } from '../../../utils/dom.js';
import { ICONS } from './icons.js';

export function buildToolbar({
  onPrev, onNext, onJumpToPage,
  onZoomIn, onZoomOut, onZoomReset,
  onClose,
} = {}) {
  const root = el('div', { class: 'pdf-toolbar' });

  // ── Navigation cluster ──
  const prevBtn = iconBtn(ICONS.prev, 'Previous page', () => onPrev?.());
  const nextBtn = iconBtn(ICONS.next, 'Next page', () => onNext?.());
  const pageInput = el('input', {
    type: 'text',
    inputmode: 'numeric',
    class: 'pdf-tb-page-input',
    'aria-label': 'Page number',
    value: '1',
  });
  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const n = parseInt(pageInput.value, 10);
      if (Number.isFinite(n)) onJumpToPage?.(n);
    }
  });
  const totalSpan = el('span', { class: 'pdf-tb-page-total' }, '/ —');

  const navCluster = el('div', { class: 'pdf-tb-cluster' }, [
    prevBtn, nextBtn,
    el('span', { class: 'pdf-tb-page-counter' }, [pageInput, totalSpan]),
  ]);

  // ── Zoom cluster ──
  const zoomOutBtn = iconBtn(ICONS.zoomOut, 'Zoom out', () => onZoomOut?.());
  const zoomLabel = el('button', {
    type: 'button', class: 'pdf-tb-btn pdf-tb-zoom-label',
    title: 'Reset zoom',
    onclick: () => onZoomReset?.(),
  }, '100%');
  const zoomInBtn = iconBtn(ICONS.zoomIn, 'Zoom in', () => onZoomIn?.());
  const zoomCluster = el('div', { class: 'pdf-tb-cluster' }, [zoomOutBtn, zoomLabel, zoomInBtn]);

  // ── Title (centered) ──
  const titleEl = el('div', { class: 'pdf-tb-title' });

  // ── Actions cluster (Phase B: just close) ──
  const closeBtn = iconBtn(ICONS.close, 'Close PDF', () => onClose?.());
  const actCluster = el('div', { class: 'pdf-tb-cluster' }, [closeBtn]);

  root.append(navCluster, divider(), zoomCluster, titleEl, actCluster);

  function divider() { return el('span', { class: 'pdf-tb-divider' }); }

  function iconBtn(svgHtml, title, handler) {
    const b = el('button', {
      type: 'button', class: 'pdf-tb-btn',
      title, 'aria-label': title,
    });
    b.innerHTML = svgHtml || '';   // trusted-svg: authored in icons.js
    b.addEventListener('click', handler);
    return b;
  }

  return {
    root,
    update({ page, totalPages, zoom, title } = {}) {
      if (Number.isFinite(page)) {
        // Avoid stomping while the user is editing.
        if (document.activeElement !== pageInput) pageInput.value = String(page);
      }
      if (Number.isFinite(totalPages)) totalSpan.textContent = `/ ${totalPages}`;
      if (typeof zoom === 'number') zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      else if (typeof zoom === 'string') zoomLabel.textContent = zoom;
      if (typeof title === 'string') titleEl.textContent = title;
      prevBtn.disabled = !page || page <= 1;
      nextBtn.disabled = !page || !totalPages || page >= totalPages;
    },
    setTitle(t) { titleEl.textContent = t || ''; },
  };
}
