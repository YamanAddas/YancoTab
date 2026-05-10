/**
 * pdf/engine/notes.js — sticky-note reducer.
 *
 * A note is a comment anchored to a (page, x, y) coordinate with x/y
 * expressed as 0..1 fractions of the page in CSS-pixel space. Resilient
 * to pdf.js text-layer ordering changes that would break a span+offset
 * scheme.
 *
 * Storage shape: a note record lives in the IDB `annotations` store
 * with `kind: 'note'`. This module is pure — no DOM, no IDB. It validates
 * + normalizes records and exposes filter/sort helpers.
 *
 *   {
 *     id, docId, kind: 'note',
 *     page, x, y,        // 0..1
 *     body, color,
 *     rotation,          // 0/90/180/270 — projection at creation time
 *     createdAt, modifiedAt,
 *   }
 */

export const NOTE_COLORS = Object.freeze(['accent', 'warm', 'rose', 'violet', 'cool']);

const MIN_BODY = 1;
const MAX_BODY = 2000;

/** Validate + normalize a partial note record. Returns null if invalid. */
export function normalizeNote(input) {
    if (!input || typeof input !== 'object') return null;
    if (!input.docId) return null;
    if (!Number.isFinite(input.page) || input.page < 1) return null;
    const x = clampFrac(input.x);
    const y = clampFrac(input.y);
    if (x == null || y == null) return null;
    const body = trimBody(input.body);
    if (!body) return null;
    const color = NOTE_COLORS.includes(input.color) ? input.color : 'warm';
    const rotation = [0, 90, 180, 270].includes(input.rotation) ? input.rotation : 0;
    const now = Date.now();
    return {
        ...(input.id ? { id: input.id } : {}),
        docId: String(input.docId),
        kind: 'note',
        page: Math.floor(input.page),
        x, y, body, color, rotation,
        createdAt: Number.isFinite(input.createdAt) ? input.createdAt : now,
        modifiedAt: now,
    };
}

function clampFrac(v) {
    if (!Number.isFinite(v)) return null;
    return Math.max(0, Math.min(1, v));
}

function trimBody(s) {
    const t = typeof s === 'string' ? s.trim() : '';
    if (t.length < MIN_BODY) return '';
    return t.length > MAX_BODY ? t.slice(0, MAX_BODY) : t;
}

/** True if the patch contains a meaningful change. */
export function hasChanged(prev, patch) {
    if (!prev || !patch) return false;
    for (const k of ['body', 'color', 'x', 'y', 'rotation']) {
        if (k in patch && patch[k] !== prev[k]) return true;
    }
    return false;
}

/**
 * Group notes by page. Returns { [pageNum]: Note[] } sorted by createdAt.
 */
export function groupByPage(notes) {
    const out = {};
    if (!Array.isArray(notes)) return out;
    for (const n of notes) {
        if (n.kind !== 'note') continue;
        if (!Number.isFinite(n.page)) continue;
        if (!out[n.page]) out[n.page] = [];
        out[n.page].push(n);
    }
    for (const k of Object.keys(out)) {
        out[k].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }
    return out;
}

/**
 * Translate a (CSS px) drag delta into a (0..1, 0..1) coordinate
 * delta given the page's current size in CSS pixels.
 */
export function dragDelta({ pageW, pageH, dx, dy }) {
    if (!Number.isFinite(pageW) || pageW <= 0) return { dx: 0, dy: 0 };
    if (!Number.isFinite(pageH) || pageH <= 0) return { dx: 0, dy: 0 };
    return {
        dx: clampFrac(0.5 + (dx / pageW) - 0.5) - 0.5 + 0.5,  // pass-through but clamped
        dy: clampFrac(0.5 + (dy / pageH) - 0.5) - 0.5 + 0.5,
    };
}

/** Pretty utilities for the note pip + popover. */
export function clampNotePosition(x, y) {
    return { x: clampFrac(x) ?? 0.5, y: clampFrac(y) ?? 0.5 };
}

export const __TEST__ = Object.freeze({ MIN_BODY, MAX_BODY });
