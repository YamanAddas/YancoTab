/**
 * pdf/v3/chrome/tabOutline.js — Outline (table of contents) tab.
 *
 * Reuses pure helpers from engine/outline.js to flatten pdf.js's
 * nested outline tree, then renders an indented list where each entry
 * carries a page number (resolved by the orchestrator via
 * pdfDoc.getPageIndex).
 *
 * Click an entry → jump to its page.
 *
 * Target size: ≤ 200 lines.
 */

import { el } from '../../../../utils/dom.js';
import { flattenOutline, annotateWithPages, destToKey } from '../../engine/outline.js';

const INDENT_PX = 12;

export function buildOutlineTab({ getPdfDoc, onJumpToPage } = {}) {
  let host = null;
  let outline = [];
  let resolved = false;

  function mount(hostEl) {
    host = hostEl;
    host.classList.add('pdf-outline');
    return { update, destroy };
  }

  async function update({ totalPages } = {}) {
    if (resolved || !Number.isFinite(totalPages) || totalPages <= 0) return;
    const pdfDoc = await getPdfDoc?.();
    if (!pdfDoc) return;
    resolved = true;
    try {
      const raw = await pdfDoc.getOutline();
      outline = flattenOutline(raw);
      // Resolve destinations to page numbers.
      const pageByKey = new Map();
      for (const entry of outline) {
        const k = destToKey(entry.dest);
        if (!k) continue;
        try {
          let target = entry.dest;
          // String dest = named; resolve via getDestination.
          if (typeof target === 'string') {
            target = await pdfDoc.getDestination(target);
          }
          if (Array.isArray(target) && target[0]) {
            const pageIdx = await pdfDoc.getPageIndex(target[0]);
            if (Number.isFinite(pageIdx)) pageByKey.set(k, pageIdx + 1);
          }
        } catch { /* skip */ }
      }
      outline = annotateWithPages(outline, pageByKey);
    } catch (e) {
      outline = [];
    }
    render();
  }

  function render() {
    if (!host) return;
    host.innerHTML = '';
    if (outline.length === 0) {
      host.appendChild(el('div', { class: 'pdf-tab-empty' }, 'No outline'));
      return;
    }
    for (const entry of outline) {
      const item = el('button', {
        type: 'button',
        class: 'pdf-outline-item',
        style: { paddingLeft: `${12 + entry.depth * INDENT_PX}px` },
        title: entry.title,
        onclick: () => {
          if (Number.isFinite(entry.page)) onJumpToPage?.(entry.page);
        },
        disabled: !Number.isFinite(entry.page),
      });
      item.appendChild(el('span', { class: 'pdf-outline-title' }, entry.title));
      if (Number.isFinite(entry.page)) {
        item.appendChild(el('span', { class: 'pdf-outline-page' }, String(entry.page)));
      }
      host.appendChild(item);
    }
  }

  function destroy() {
    if (host) host.innerHTML = '';
    host = null;
    outline = [];
    resolved = false;
  }

  return { mount };
}
