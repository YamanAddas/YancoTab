/**
 * pdf/view/pageStrip.js — continuous vertical-scroll page list with
 * virtualized canvas rendering.
 *
 * Mounted when view-mode = 'continuous'. Pages are placeholders by
 * default (gray boxes of correct aspect ratio); IntersectionObserver
 * upgrades visible pages to real canvases and downgrades pages that
 * scroll far away.
 *
 * Compatible with the spread.js public surface so codex.js can swap
 * one for the other:
 *   { root, render(args), destroy(), isSpread(stageW) → false,
 *     getCurrentPage() — for nav UI }
 */

import { el } from '../../../utils/dom.js';
import { buildPageView } from './pageView.js';

const OVERSCAN_PAGES = 1;          // render visible ± this many pages
const PAGE_GAP_PX = 14;             // vertical spacing between pages
const PADDING_PX = 24;

export function buildPageStrip({ onCurrentPageChange, onPageRendered, onLinkInternal, onLinkExternal } = {}) {
    const root = el('div', { class: 'cx-strip' });
    const linkOpts = { onLinkInternal, onLinkExternal };

    let pdfDoc = null;
    let pageBoxes = [];         // [{ container, view, page, dims, rendered }]
    let lastDocId = null;
    let lastZoom = null;
    let baseDimsByPage = {};    // pdf.js width/height at scale 1, cached per page
    let observer = null;
    let stageEl = null;
    let scrollRaf = 0;
    let currentPage = 1;

    async function render({ pdfDoc: doc, stage, scrollHost, zoom = 1, docId, gapPx = PAGE_GAP_PX, paddingPx = PADDING_PX }) {
        if (!doc || !scrollHost) return;
        const docChanged = lastDocId !== docId;
        const zoomChanged = lastZoom !== zoom;

        if (docChanged) {
            destroyBoxes();
            pdfDoc = doc;
            lastDocId = docId;
            baseDimsByPage = {};
            await buildBoxes(pdfDoc, gapPx, paddingPx);
            stageEl = scrollHost;
            wireObservers(scrollHost);
            wireScroll(scrollHost);
        }

        if (docChanged || zoomChanged) {
            lastZoom = zoom;
            await sizeBoxes(zoom, paddingPx);
        }

        // Trigger initial visibility scan.
        scheduleVisibilityScan();
    }

    async function buildBoxes(doc, gapPx, paddingPx) {
        root.innerHTML = '';
        root.style.paddingTop = `${paddingPx}px`;
        root.style.paddingBottom = `${paddingPx}px`;
        pageBoxes = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const v = page.getViewport({ scale: 1 });
            baseDimsByPage[i] = { width: v.width, height: v.height };
            const box = el('div', {
                class: 'cx-strip-page is-placeholder',
                'data-page': String(i),
                style: { marginBottom: `${gapPx}px` },
            });
            const view = buildPageView(linkOpts);
            view.root.classList.add('cx-strip-page-inner');
            box.appendChild(view.root);
            root.appendChild(box);
            pageBoxes.push({ container: box, view, pageNum: i, page, rendered: false });
        }
    }

    async function sizeBoxes(zoom, paddingPx) {
        if (!pageBoxes.length || !stageEl) return;
        const stageW = stageEl.clientWidth;
        const innerW = Math.max(0, stageW - paddingPx * 2);
        for (const b of pageBoxes) {
            const dims = baseDimsByPage[b.pageNum];
            if (!dims) continue;
            let cssW;
            if (typeof zoom === 'number' && zoom > 0) {
                cssW = dims.width * zoom;
            } else {
                cssW = innerW;
            }
            const aspect = dims.height / dims.width;
            const cssH = cssW * aspect;
            b.container.style.width = `${cssW}px`;
            b.container.style.height = `${cssH}px`;
            b.cssWidth = cssW;
            b.cssHeight = cssH;
            // Mark previously-rendered canvases as needing re-render.
            if (b.rendered) b.rendered = false;
        }
    }

    function wireObservers(scrollHost) {
        if (observer) observer.disconnect();
        observer = new IntersectionObserver((entries) => {
            for (const ent of entries) {
                const idx = Number(ent.target.dataset.page);
                if (!Number.isFinite(idx)) continue;
                const box = pageBoxes[idx - 1];
                if (!box) continue;
                if (ent.isIntersecting) {
                    queueRender(box);
                }
            }
        }, {
            root: scrollHost,
            rootMargin: `${OVERSCAN_PAGES * 100}% 0px`,
            threshold: 0.01,
        });
        for (const b of pageBoxes) observer.observe(b.container);
    }

    function wireScroll(scrollHost) {
        // Track current page (centermost-visible) for the page counter.
        scrollHost.addEventListener('scroll', () => {
            if (scrollRaf) return;
            scrollRaf = requestAnimationFrame(() => {
                scrollRaf = 0;
                const target = scrollHost.scrollTop + scrollHost.clientHeight / 2;
                const idx = pageBoxes.findIndex((b) => {
                    const top = b.container.offsetTop;
                    const bottom = top + b.container.offsetHeight;
                    return target >= top && target <= bottom;
                });
                const next = idx >= 0 ? idx + 1 : currentPage;
                if (next !== currentPage) {
                    currentPage = next;
                    onCurrentPageChange?.(currentPage);
                }
            });
        }, { passive: true });
    }

    async function queueRender(box) {
        if (!box || box.rendered) return;
        try {
            box.container.classList.remove('is-placeholder');
            await box.view.render(box.page, { cssWidth: box.cssWidth, label: `— ${box.pageNum} —`, pageNum: box.pageNum });
            box.rendered = true;
            onPageRendered?.(box.pageNum);
        } catch { /* ignore */ }
    }

    function scheduleVisibilityScan() {
        // Force IO to re-evaluate after a sizing pass — observe again.
        if (!observer) return;
        for (const b of pageBoxes) observer.unobserve(b.container);
        for (const b of pageBoxes) observer.observe(b.container);
    }

    /** Scroll the host so page N is at top (with a 24px padding). */
    function scrollToPage(n, scrollHost) {
        const idx = Math.max(1, Math.min(n, pageBoxes.length));
        const box = pageBoxes[idx - 1];
        if (!box || !scrollHost) return;
        scrollHost.scrollTo({ top: box.container.offsetTop - 24, behavior: 'smooth' });
        currentPage = idx;
    }

    function destroy() {
        destroyBoxes();
        observer?.disconnect();
        observer = null;
        if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = 0; }
        pdfDoc = null;
        lastDocId = null;
        lastZoom = null;
        baseDimsByPage = {};
        currentPage = 1;
    }

    function destroyBoxes() {
        for (const b of pageBoxes) {
            try { b.view.destroy(); } catch { /* ignore */ }
            b.container.remove();
        }
        pageBoxes = [];
    }

    return {
        root,
        render,
        destroy,
        scrollToPage,
        getCurrentPage: () => currentPage,
        isSpread: () => false,
    };
}
