/**
 * pdf/codexLoad.js — load-helpers extracted from codex.js to keep the
 * orchestrator under the 500-line cap.
 *
 * Pure-ish: takes the pdf.js doc + injected outline helpers and
 * resolves the flattened outline with destination → page mappings.
 * No DOM.
 */

import { flattenOutline, annotateWithPages, destToKey } from './engine/outline.js';

/**
 * Pull the doc's outline and resolve every entry to a 1-based page
 * index. Returns the flattened outline, with `page` field set where
 * resolvable.
 *
 * @param {object} pdfDoc
 * @returns {Promise<Array<{title:string, depth:number, page?:number}>>}
 */
export async function resolveOutline(pdfDoc) {
    if (!pdfDoc) return [];
    let raw = [];
    try { raw = await pdfDoc.getOutline(); } catch { /* no outline */ }
    const flat = flattenOutline(raw || []);
    const pageByDestKey = new Map();
    for (const entry of flat) {
        const key = destToKey(entry.dest);
        if (!key) continue;
        try {
            let dest = entry.dest;
            if (typeof dest === 'string') {
                dest = await pdfDoc.getDestination(dest);
                if (!dest) continue;
            }
            const ref = Array.isArray(dest) ? dest[0] : null;
            if (!ref) continue;
            const idx = await pdfDoc.getPageIndex(ref);
            if (Number.isFinite(idx)) pageByDestKey.set(key, idx + 1);
        } catch { /* ignore */ }
    }
    return annotateWithPages(flat, pageByDestKey);
}

/**
 * Open a link target in a new browser tab. Routes through window.open
 * with rel-equivalent flags. CSP-safe — no inline JS.
 */
export function openExternalUrl(url) {
    if (typeof url !== 'string') return;
    try { window.open(url, '_blank', 'noopener,noreferrer'); }
    catch { /* ignore */ }
}

/**
 * Resolve a pdf.js Link annotation `dest` (string name | array) to a
 * 1-based page number. Returns null if it can't resolve.
 */
export async function resolveLinkDestination(pdfDoc, dest) {
    if (!pdfDoc || !dest) return null;
    try {
        let resolved = dest;
        if (typeof dest === 'string') {
            resolved = await pdfDoc.getDestination(dest);
        }
        const ref = Array.isArray(resolved) ? resolved[0] : null;
        if (!ref) return null;
        const idx = await pdfDoc.getPageIndex(ref);
        if (Number.isFinite(idx)) return idx + 1;
    } catch { /* ignore */ }
    return null;
}
