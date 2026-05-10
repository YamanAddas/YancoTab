/**
 * pdf/library/libraryReducer.js — pure filter/sort/search for the Library.
 *
 * The Library shell holds a list of doc-metadata records (no blobs)
 * plus a viewState lookup keyed by docId. This module computes which
 * docs to show given the user's current filter / sort / query, without
 * touching the DOM or kernel.storage. Easy to unit-test.
 */

const RECENT_DAYS = 30;
const READING_NOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const FILTERS = Object.freeze(['all', 'recent', 'reading']);
export const SORTS = Object.freeze(['lastOpened', 'dateAdded', 'name', 'size']);
export const VIEW_MODES = Object.freeze(['grid', 'list']);

/**
 * @param {Array<object>} docs — pdfStore document metadata records
 * @param {object} viewStates — { [docId]: { lastOpenedAt, page } }
 * @param {object} state — { filter, sort, viewMode, query, now? }
 * @returns {Array<object>} filtered + sorted docs (with derived fields)
 */
export function selectVisibleDocs(docs, viewStates, state) {
    if (!Array.isArray(docs)) return [];
    const filter = FILTERS.includes(state?.filter) ? state.filter : 'all';
    const sort = SORTS.includes(state?.sort) ? state.sort : 'lastOpened';
    const query = (state?.query || '').trim().toLowerCase();
    const now = Number.isFinite(state?.now) ? state.now : Date.now();
    const vs = viewStates || {};

    const enriched = docs.map((d) => {
        const v = vs[d.id] || null;
        return {
            ...d,
            lastOpenedAt: v?.lastOpenedAt || d.importedAt || 0,
            currentPage: v?.page || 1,
            progress: progressFraction(v?.page, d.pageCount),
        };
    });

    const filtered = enriched.filter((d) => {
        if (filter === 'recent') {
            return (now - d.lastOpenedAt) < RECENT_DAYS * DAY_MS;
        }
        if (filter === 'reading') {
            const recent = (now - d.lastOpenedAt) < READING_NOW_DAYS * DAY_MS;
            return recent && d.currentPage > 1
                && (!d.pageCount || d.currentPage < d.pageCount);
        }
        return true;
    });

    const queried = query
        ? filtered.filter((d) => matchesQuery(d, query))
        : filtered;

    return queried.sort((a, b) => sortCmp(a, b, sort));
}

/** True if doc name (or any tag) contains the lowercased query. */
export function matchesQuery(doc, q) {
    if (!q) return true;
    if (doc?.name && doc.name.toLowerCase().includes(q)) return true;
    if (Array.isArray(doc?.tags)) {
        for (const t of doc.tags) {
            if (typeof t === 'string' && t.toLowerCase().includes(q)) return true;
        }
    }
    return false;
}

function sortCmp(a, b, sort) {
    if (sort === 'name') {
        return String(a.name || '').localeCompare(String(b.name || ''));
    }
    if (sort === 'size') {
        return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    }
    if (sort === 'dateAdded') {
        return (b.importedAt || 0) - (a.importedAt || 0);
    }
    // lastOpened
    return (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0);
}

/**
 * Fraction read, clamped 0..1. Returns 0 when page or total is unknown.
 */
export function progressFraction(currentPage, pageCount) {
    if (!Number.isFinite(currentPage) || currentPage < 1) return 0;
    if (!Number.isFinite(pageCount) || pageCount < 1) return 0;
    if (currentPage >= pageCount) return 1;
    return Math.max(0, Math.min(1, currentPage / pageCount));
}

/**
 * Best-effort human-readable size (e.g. "2.4 MB"). Pure formatter.
 */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Relative time formatter: "Today", "Yesterday", "3d ago", or date. */
export function formatRelativeTime(ts, now = Date.now()) {
    if (!Number.isFinite(ts) || ts <= 0) return '—';
    const diffMs = now - ts;
    if (diffMs < 60_000) return 'Just now';
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < DAY_MS) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    const diffDays = Math.floor(diffMs / DAY_MS);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(ts).toLocaleDateString();
}
