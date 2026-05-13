/**
 * pdf/engine/reading.js — per-doc reading-position memory.
 *
 * Wraps pdfStore.viewState with a debounced save and a synchronous
 * cache so the reader can save on every page/zoom/scroll change
 * without IDB-thrashing. Pure-ish: IO is injected so we can unit-test
 * the debounce + buffer behavior without a real IDB.
 *
 * Shape:
 *   { docId, page, scrollY, zoom, mode, rotation, lastOpenedAt }
 */

const SAVE_DEBOUNCE_MS = 500;

/**
 * @param {object} args
 * @param {(docId: string) => Promise<object|null>} args.loadViewState
 * @param {(docId: string, patch: object) => Promise<void>} args.saveViewState
 * @param {(fn: Function, ms: number) => any} [args.scheduleSave]  injectable for tests
 * @param {(handle: any) => void} [args.cancelSave]
 */
export function createReadingMemory({
    loadViewState, saveViewState,
    scheduleSave = (fn, ms) => setTimeout(fn, ms),
    cancelSave = (h) => clearTimeout(h),
} = {}) {
    const cache = new Map();      // docId → patch (in-flight)
    const timers = new Map();     // docId → handle

    /** Load the persisted viewState for a doc; returns null if absent. */
    async function load(docId) {
        if (!docId || typeof loadViewState !== 'function') return null;
        try {
            return await loadViewState(docId);
        } catch { return null; }
    }

    /** Schedule a debounced save; merges with any pending patch for the same doc. */
    function save(docId, patch) {
        if (!docId || !patch) return;
        const cur = cache.get(docId) || {};
        cache.set(docId, { ...cur, ...patch });

        if (timers.has(docId)) cancelSave(timers.get(docId));
        const handle = scheduleSave(() => flush(docId), SAVE_DEBOUNCE_MS);
        timers.set(docId, handle);
    }

    /** Force-flush any pending save for `docId` (e.g. on close/destroy). */
    async function flush(docId) {
        if (!docId) return;
        const handle = timers.get(docId);
        if (handle != null) cancelSave(handle);
        timers.delete(docId);
        const patch = cache.get(docId);
        cache.delete(docId);
        if (!patch) return;
        try { await saveViewState(docId, patch); } catch { /* ignore */ }
    }

    /** Flush every pending doc (e.g. on app destroy). */
    async function flushAll() {
        const ids = [...timers.keys(), ...cache.keys()];
        const seen = new Set();
        for (const id of ids) {
            if (seen.has(id)) continue;
            seen.add(id);
            await flush(id);
        }
    }

    function pendingPatch(docId) { return cache.get(docId) || null; }

    return { load, save, flush, flushAll, pendingPatch };
}

/**
 * Resolve a saved viewState into the reader-applicable args.
 * Returns sensible defaults for missing fields.
 */
export function resolveViewState(saved) {
    if (!saved) return null;
    const v = {
        page: Number.isFinite(saved.page) && saved.page >= 1 ? Math.floor(saved.page) : 1,
        scrollY: Number.isFinite(saved.scrollY) ? saved.scrollY : 0,
        zoom: typeof saved.zoom === 'number' && saved.zoom > 0
            ? saved.zoom
            : (saved.zoom === 'fit-width' || saved.zoom === 'fit-page' ? saved.zoom : 'fit-width'),
        mode: ['single', 'continuous', 'spread', 'book'].includes(saved.mode)
            ? saved.mode
            : null,
        rotation: [0, 90, 180, 270].includes(saved.rotation) ? saved.rotation : 0,
        lastOpenedAt: Number.isFinite(saved.lastOpenedAt) ? saved.lastOpenedAt : 0,
    };
    return v;
}

/** Whether a saved viewState represents a meaningful "resume here" position. */
export function isResumable(saved) {
    if (!saved) return false;
    return Number.isFinite(saved.page) && saved.page > 1;
}

export const __TEST__ = Object.freeze({ SAVE_DEBOUNCE_MS });
