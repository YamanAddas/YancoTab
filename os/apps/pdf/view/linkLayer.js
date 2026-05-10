/**
 * pdf/view/linkLayer.js — overlay clickable rects for pdf.js link
 * annotations.
 *
 * pdf.js exposes per-page annotations via `page.getAnnotations()`.
 * Two annotation kinds matter for navigation:
 *   - 'Link' with `dest`        → internal goto (chapter / footnote)
 *   - 'Link' with `url`         → external URL (route through Browser app)
 *
 * The overlay sits on top of the canvas, in the same coord system as
 * the text-layer. Clicks dispatch the right action; nothing else.
 */

import { el } from '../../../utils/dom.js';

/**
 * Build links for one page.
 *
 * @param {object} args
 * @param {HTMLElement} args.pageEl     the .cx-page container
 * @param {object}      args.viewport   pdfjs viewport at current scale
 * @param {Array}       args.annotations  page.getAnnotations() result
 * @param {(target: object) => void}  args.onInternal  fires with { dest } or { pageRef }
 * @param {(url: string) => void}     args.onExternal
 */
export function applyLinkLayer({ pageEl, viewport, annotations, onInternal, onExternal } = {}) {
    if (!pageEl || !Array.isArray(annotations)) return;
    // Strip any previous link layer for this page.
    pageEl.querySelectorAll('.cx-link-layer').forEach((n) => n.remove());

    const layer = el('div', { class: 'cx-link-layer' });
    layer.style.position = 'absolute';
    layer.style.top = '0';
    layer.style.left = '0';
    layer.style.width = `${viewport.width}px`;
    layer.style.height = `${viewport.height}px`;
    layer.style.pointerEvents = 'none';

    let count = 0;
    for (const ann of annotations) {
        if (!ann || ann.subtype !== 'Link') continue;
        const rect = mapRect(ann.rect, viewport);
        if (!rect) continue;
        const a = el('a', {
            class: 'cx-link-rect',
            href: ann.url || '#',
            title: ann.url || (ann.dest ? 'Internal link' : ''),
        });
        a.style.position = 'absolute';
        a.style.left = `${rect.left}px`;
        a.style.top = `${rect.top}px`;
        a.style.width = `${rect.width}px`;
        a.style.height = `${rect.height}px`;
        a.style.pointerEvents = 'auto';

        a.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (ann.url) onExternal?.(ann.url);
            else if (ann.dest) onInternal?.({ dest: ann.dest });
            else if (ann.action === 'GoBack' && ann.pageNumber) onInternal?.({ pageRef: ann.pageNumber });
        });

        layer.appendChild(a);
        count++;
    }

    pageEl.appendChild(layer);
    return count;
}

/**
 * pdf.js annotation `rect` is [x1, y1, x2, y2] in PDF user space
 * (origin bottom-left). Map to viewport CSS coords (origin top-left).
 */
function mapRect(rect, viewport) {
    if (!Array.isArray(rect) || rect.length < 4 || !viewport) return null;
    try {
        // pdf.js Util.normalizeRect: [x1,y1,x2,y2]
        // Use viewport.convertToViewportRectangle if available
        let r;
        if (typeof viewport.convertToViewportRectangle === 'function') {
            r = viewport.convertToViewportRectangle(rect);
        } else {
            // Fallback: pretend identity transform.
            r = rect;
        }
        const left = Math.min(r[0], r[2]);
        const top = Math.min(r[1], r[3]);
        const width = Math.abs(r[2] - r[0]);
        const height = Math.abs(r[3] - r[1]);
        if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) return null;
        return { left, top, width, height };
    } catch {
        return null;
    }
}
