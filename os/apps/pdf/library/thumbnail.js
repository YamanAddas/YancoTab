/**
 * pdf/library/thumbnail.js — render a small page-1 thumbnail to a data
 * URL using pdf.js.
 *
 * Cached on the doc record (`thumbnailDataUrl`). The Library renders
 * the cached value if present; otherwise this module is invoked
 * lazily for visible cards. Failure is silent — the card just keeps
 * showing the empty-state icon.
 */

const PDFJS_URL = 'vendor/pdfjs/pdf.min.mjs';
const PDFJS_WORKER_URL = 'vendor/pdfjs/pdf.worker.min.mjs';

let pdfjsModulePromise = null;

async function loadPdfJs() {
    if (!pdfjsModulePromise) {
        pdfjsModulePromise = (async () => {
            const mod = await import(`/${PDFJS_URL}`);
            mod.GlobalWorkerOptions.workerSrc = `/${PDFJS_WORKER_URL}`;
            return mod;
        })();
    }
    return pdfjsModulePromise;
}

const THUMB_WIDTH_CSS = 200;

/**
 * Render a page-1 thumbnail of `blob` as a data URL.
 * Returns null on any failure.
 *
 * @param {Blob} blob
 * @returns {Promise<string|null>}
 */
export async function renderThumbnail(blob) {
    if (!blob || typeof blob.arrayBuffer !== 'function') return null;
    let pdfDoc = null;
    try {
        const pdfjs = await loadPdfJs();
        const buf = await blob.arrayBuffer();
        pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
        const page = await pdfDoc.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = THUMB_WIDTH_CSS / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        const ctx = canvas.getContext('2d');
        const transform = dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0];
        await page.render({
            canvasContext: ctx,
            viewport,
            ...(transform ? { transform } : {}),
        }).promise;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        // Best-effort cleanup so pdf.js worker frees the page.
        try { page.cleanup?.(); } catch { /* ignore */ }
        return dataUrl;
    } catch {
        return null;
    } finally {
        if (pdfDoc) {
            try { await pdfDoc.destroy(); } catch { /* ignore */ }
        }
    }
}
