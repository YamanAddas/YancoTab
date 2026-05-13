/**
 * pdf/v3/chrome/tabThumbnails.js — Thumbnails tab.
 *
 * Lazy-renders one canvas thumbnail per page. Visible-page-first
 * priority: when the user scrolls the strip, the corresponding
 * thumbnail scrolls into view and is highlighted. Click a thumb to
 * jump.
 *
 * Each thumbnail renders at a fixed 140px width. Pre-allocate
 * slot heights so the scroll geometry is correct from the start.
 *
 * Target size: ≤ 350 lines.
 */

import { el } from '../../../../utils/dom.js';

const THUMB_WIDTH = 140;
const THUMB_DPR = 1;   // thumbs don't need retina; saves memory

export function buildThumbnailsTab({ getPdfDoc, onJumpToPage } = {}) {
  let host = null;
  let slots = new Map();    // pageNum → { el, canvas, rendered, observer? }
  let observer = null;
  let currentPage = 1;
  let totalPages = 0;
  let rendering = false;

  function mount(hostEl) {
    host = hostEl;
    host.classList.add('pdf-thumbs');
    return { update, destroy };
  }

  async function update({ totalPages: total, currentPage: cur } = {}) {
    if (Number.isFinite(total) && total !== totalPages) {
      totalPages = total;
      await rebuild();
    }
    if (Number.isFinite(cur) && cur !== currentPage) {
      const prev = currentPage;
      currentPage = cur;
      highlightActive(prev, currentPage);
      scrollIntoView(currentPage);
    }
  }

  async function rebuild() {
    if (rendering) return;
    rendering = true;
    cleanup();
    if (!host || totalPages <= 0) { rendering = false; return; }
    // Build placeholders first; thumbnails render lazily via IntersectionObserver.
    const pdfDoc = await getPdfDoc?.();
    if (!pdfDoc) { rendering = false; return; }
    let aspectRatio = 1.4;
    try {
      const p1 = await pdfDoc.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      aspectRatio = vp.height / vp.width;
    } catch { /* best-effort */ }
    const thumbH = Math.round(THUMB_WIDTH * aspectRatio);

    for (let p = 1; p <= totalPages; p++) {
      const item = el('button', {
        type: 'button',
        class: 'pdf-thumb',
        'data-page': String(p),
        title: `Page ${p}`,
        onclick: () => onJumpToPage?.(p),
      });
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-thumb-canvas';
      canvas.width = THUMB_WIDTH * THUMB_DPR;
      canvas.height = thumbH * THUMB_DPR;
      canvas.style.width = `${THUMB_WIDTH}px`;
      canvas.style.height = `${thumbH}px`;
      const label = el('span', { class: 'pdf-thumb-label' }, String(p));
      item.append(canvas, label);
      host.appendChild(item);
      slots.set(p, { el: item, canvas, rendered: false });
    }

    observer = new IntersectionObserver(onIntersect, {
      root: host,
      rootMargin: '120px 0px 120px 0px',
      threshold: 0,
    });
    for (const slot of slots.values()) observer.observe(slot.el);

    // Highlight whatever's current.
    highlightActive(null, currentPage);
    rendering = false;
  }

  function onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const p = Number(entry.target.dataset.page);
      if (Number.isFinite(p)) mountThumb(p);
    }
  }

  async function mountThumb(pageNum) {
    const slot = slots.get(pageNum);
    if (!slot || slot.rendered) return;
    slot.rendered = true;
    try {
      const pdfDoc = await getPdfDoc?.();
      if (!pdfDoc) { slot.rendered = false; return; }
      const page = await pdfDoc.getPage(pageNum);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = THUMB_WIDTH / vp1.width;
      const vp = page.getViewport({ scale });
      const ctx = slot.canvas.getContext('2d');
      slot.canvas.width = Math.floor(vp.width * THUMB_DPR);
      slot.canvas.height = Math.floor(vp.height * THUMB_DPR);
      const transform = THUMB_DPR === 1 ? null : [THUMB_DPR, 0, 0, THUMB_DPR, 0, 0];
      await page.render({
        canvasContext: ctx,
        viewport: vp,
        ...(transform ? { transform } : {}),
      }).promise;
    } catch (e) {
      slot.rendered = false;
      // Best-effort: leave the slot blank if rendering fails.
    }
  }

  function highlightActive(prev, next) {
    if (Number.isFinite(prev)) {
      const s = slots.get(prev);
      s?.el.classList.remove('is-current');
    }
    if (Number.isFinite(next)) {
      const s = slots.get(next);
      s?.el.classList.add('is-current');
    }
  }

  function scrollIntoView(pageNum) {
    const s = slots.get(pageNum);
    if (!s || !host) return;
    const tr = s.el.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    if (tr.top < hr.top || tr.bottom > hr.bottom) {
      s.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function cleanup() {
    if (observer) { observer.disconnect(); observer = null; }
    slots.clear();
    if (host) host.innerHTML = '';
  }

  function destroy() {
    cleanup();
    host = null;
    totalPages = 0;
    currentPage = 1;
  }

  return { mount };
}
