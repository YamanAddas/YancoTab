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
 * Hover actions (D5a): each thumb wraps in pdf-thumb-wrap so the
 * ⟳ rotate and × delete buttons can layer over the thumb image.
 * Omitted pages render as a single "Restore" tile.
 *
 * Target size: ≤ 350 lines.
 */

import { el } from '../../../../utils/dom.js';

const THUMB_WIDTH = 140;
const THUMB_DPR = 1;   // thumbs don't need retina; saves memory

export function buildThumbnailsTab({
  getPdfDoc,
  onJumpToPage,
  getPageOps,
  onRotatePage,
  onDeletePage,
  onRestorePage,
} = {}) {
  let host = null;
  let slots = new Map();    // pageNum → { wrap, thumbBtn, canvas, rendered, omittedNode? }
  let observer = null;
  let currentPage = 1;
  let totalPages = 0;
  let rendering = false;
  let cachedAspect = 1.4;

  function mount(hostEl) {
    host = hostEl;
    host.classList.add('pdf-thumbs');
    return { update, destroy, refreshOps };
  }

  function ops() {
    try { return getPageOps?.() || null; } catch { return null; }
  }
  function isOmitted(p) {
    const s = ops();
    return !!(s && Array.isArray(s.pageOmits) && s.pageOmits.includes(p));
  }
  function rotationFor(p) {
    const s = ops();
    return (s && s.pageRotations && s.pageRotations[p]) || 0;
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
    try {
      const p1 = await pdfDoc.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      cachedAspect = vp.height / vp.width;
    } catch { /* best-effort */ }
    const thumbH = Math.round(THUMB_WIDTH * cachedAspect);

    for (let p = 1; p <= totalPages; p++) {
      const wrap = el('div', { class: 'pdf-thumb-wrap', 'data-page': String(p) });
      const thumbBtn = el('button', {
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
      thumbBtn.append(canvas, label);
      wrap.appendChild(thumbBtn);

      // Hover action buttons — only present if callbacks were supplied.
      if (typeof onRotatePage === 'function') {
        wrap.appendChild(el('button', {
          type: 'button',
          class: 'pdf-thumb-action pdf-thumb-rotate',
          title: 'Rotate 90°',
          'aria-label': `Rotate page ${p}`,
          onclick: (e) => { e.stopPropagation(); onRotatePage(p); },
        }, '⟳'));
      }
      if (typeof onDeletePage === 'function') {
        wrap.appendChild(el('button', {
          type: 'button',
          class: 'pdf-thumb-action pdf-thumb-delete',
          title: 'Delete page',
          'aria-label': `Delete page ${p}`,
          onclick: (e) => { e.stopPropagation(); onDeletePage(p); },
        }, '×'));
      }

      host.appendChild(wrap);
      slots.set(p, { wrap, thumbBtn, canvas, rendered: false });
      applyOpsToSlot(p);
    }

    observer = new IntersectionObserver(onIntersect, {
      root: host,
      rootMargin: '120px 0px 120px 0px',
      threshold: 0,
    });
    for (const slot of slots.values()) observer.observe(slot.thumbBtn);

    // Highlight whatever's current.
    highlightActive(null, currentPage);
    rendering = false;
  }

  /** Apply omitted + rotated visual treatment to a single slot. */
  function applyOpsToSlot(p) {
    const slot = slots.get(p);
    if (!slot) return;
    const omitted = isOmitted(p);
    const rot = rotationFor(p);
    slot.wrap.classList.toggle('is-omitted', omitted);
    slot.wrap.dataset.rotation = String(rot);
    // Hide the thumb canvas/label visually if omitted; show a Restore overlay.
    if (omitted) {
      if (!slot.omittedNode) {
        const node = el('button', {
          type: 'button',
          class: 'pdf-thumb-restore',
          title: 'Restore page',
          onclick: (e) => { e.stopPropagation(); onRestorePage?.(p); },
        }, 'Restore');
        slot.wrap.appendChild(node);
        slot.omittedNode = node;
      }
    } else if (slot.omittedNode) {
      slot.omittedNode.remove();
      slot.omittedNode = null;
    }
    // Apply rotation transform to the canvas only (label stays upright).
    if (slot.canvas) {
      slot.canvas.style.transform = rot ? `rotate(${rot}deg)` : '';
    }
  }

  /** Public: re-apply pageOps to every existing slot without rebuilding. */
  function refreshOps() {
    for (const p of slots.keys()) applyOpsToSlot(p);
  }

  function onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const p = Number(entry.target.dataset.page);
      if (Number.isFinite(p) && !isOmitted(p)) mountThumb(p);
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
      s?.thumbBtn?.classList.remove('is-current');
      s?.wrap?.classList.remove('is-current');
    }
    if (Number.isFinite(next)) {
      const s = slots.get(next);
      s?.thumbBtn?.classList.add('is-current');
      s?.wrap?.classList.add('is-current');
    }
  }

  function scrollIntoView(pageNum) {
    const s = slots.get(pageNum);
    if (!s || !host) return;
    const target = s.wrap || s.thumbBtn;
    const tr = target.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    if (tr.top < hr.top || tr.bottom > hr.bottom) {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
