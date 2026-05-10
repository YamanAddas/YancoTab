/**
 * pdf/codexLoad.js — load-helpers extracted from codex.js to keep the
 * orchestrator under the 500-line cap.
 *
 * Pure-ish: takes the pdf.js doc + injected outline helpers and
 * resolves the flattened outline with destination → page mappings.
 * No DOM.
 */

import { flattenOutline, annotateWithPages, destToKey } from './engine/outline.js';
import { resolveViewState, isResumable } from './engine/reading.js';
import { pickDefaultMode } from './engine/viewport.js';

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
 * Restore saved view state into the orchestrator-mutated state object.
 * Returns the resumed-page number (or null if not resumable).
 *
 * @param {object} args
 * @param {object} args.memory      — reading-memory controller
 * @param {string} args.docId
 * @param {object} args.state       — { viewMode, userZoom, rotation, currentPage } (mutated)
 * @param {(n:number) => number} args.clampPage
 * @returns {Promise<number|null>}
 */
export async function restoreViewState({ memory, docId, state, clampPage }) {
    if (!memory || !docId) return null;
    const saved = await memory.load(docId);
    const v = resolveViewState(saved);
    if (!v) return null;
    if (v.mode) state.viewMode = v.mode;
    if (v.zoom) state.userZoom = v.zoom;
    if (v.rotation) state.rotation = v.rotation;
    if (Number.isFinite(v.page)) state.currentPage = clampPage(v.page);
    return isResumable(saved) && state.currentPage > 1 ? state.currentPage : null;
}

/**
 * Pick a stage-aware default view mode if state.viewMode is empty.
 */
export async function ensureDefaultMode({ pdfDoc, stage, state }) {
    if (state.viewMode) return;
    try {
        const baseViewport = (await pdfDoc.getPage(1)).getViewport({ scale: 1 });
        state.viewMode = pickDefaultMode({
            stage: { width: stage.clientWidth || 800, height: stage.clientHeight || 600 },
            pageBaseViewport: baseViewport,
        });
    } catch { /* leave default */ }
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
