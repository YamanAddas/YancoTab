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
  onClose, onToggleSidebar,
  onSelectTool,
} = {}) {
  const root = el('div', { class: 'pdf-toolbar' });

  // ── Sidebar toggle ──
  const sidebarBtn = iconBtn(ICONS.sidebar, 'Toggle sidebar', () => onToggleSidebar?.());
  const sidebarCluster = el('div', { class: 'pdf-tb-cluster' }, [sidebarBtn]);

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

  // ── Tools cluster ──
  const textToolBtn = toolBtn('text', ICONS.text, 'Text select (T)');
  const inkToolBtn = toolBtn('ink', ICONS.ink, 'Ink / draw');
  const shapeToolBtn = toolBtn('shape', ICONS.shape, 'Shape (rect / ellipse / arrow / line)');
  const signToolBtn = toolBtn('sign', ICONS.signature, 'Sign — drop a saved signature');
  const toolBtns = new Map([
    ['text', textToolBtn],
    ['ink', inkToolBtn],
    ['shape', shapeToolBtn],
    ['sign', signToolBtn],
  ]);
  // Default: text is active.
  textToolBtn.classList.add('is-active');
  const toolsCluster = el('div', { class: 'pdf-tb-cluster' }, [textToolBtn, inkToolBtn, shapeToolBtn, signToolBtn]);

  // ── Actions cluster ──
  const closeBtn = iconBtn(ICONS.close, 'Close PDF', () => onClose?.());
  const actCluster = el('div', { class: 'pdf-tb-cluster' }, [closeBtn]);

  root.append(
    sidebarCluster, divider(),
    navCluster, divider(),
    zoomCluster, divider(),
    toolsCluster, titleEl, actCluster,
  );

  function toolBtn(toolId, svgHtml, title) {
    const b = iconBtn(svgHtml, title, () => onSelectTool?.(toolId));
    b.dataset.tool = toolId;
    return b;
  }

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
    setActiveTool(toolId) {
      for (const [id, btn] of toolBtns) btn.classList.toggle('is-active', id === toolId);
    },
  };
}
