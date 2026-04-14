/**
 * YancoTab — Notes App Pure Utilities
 * Extracted for testability (no DOM or browser dependencies).
 */

/**
 * Sanitize a document title: strip illegal filename chars, collapse spaces.
 * @param {*} v
 * @returns {string}
 */
export function sanitizeTitle(v) {
    return String(v || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
}

/**
 * Derive a document title from a file path (strips directory + extension).
 * @param {string} p
 * @returns {string}
 */
export function titleFromPath(p) {
    const f = String(p || '').split('/').pop() || 'Untitled';
    return f.replace(/\.(txt|md|json)$/i, '') || 'Untitled';
}

/**
 * Extract hashtags from note body text.
 * Returns up to 6 unique lowercase tags.
 * @param {string} body
 * @returns {string[]}
 */
export function extractTags(body = '') {
    const found = new Set();
    (String(body).match(/(^|\s)#([a-zA-Z0-9_-]{2,32})(?![a-zA-Z0-9_-])/g) || []).forEach(m => {
        const t = m.trim().replace(/^#/, '').toLowerCase();
        if (t) found.add(t);
    });
    return Array.from(found).slice(0, 6);
}

/**
 * Create a short preview snippet from note body text.
 * @param {string} body
 * @param {number} max  Maximum characters (default 120)
 * @returns {string}
 */
export function snippet(body = '', max = 120) {
    const c = String(body).replace(/\s+/g, ' ').trim();
    if (!c) return 'Empty document';
    return c.length > max ? c.slice(0, max) + '\u2026' : c;
}

/**
 * Format a timestamp as a human-readable relative date.
 * @param {number} ts   Timestamp in ms
 * @param {number} now  Reference "now" for testability (defaults to Date.now())
 * @returns {string}
 */
export function formatDate(ts, now = Date.now()) {
    const v = Number(ts) || now;
    const d = now - v;
    if (d < 60_000)      return 'Just now';
    if (d < 3_600_000)   return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000)  return `${Math.floor(d / 3_600_000)}h ago`;
    return new Date(v).toLocaleDateString();
}

/**
 * Count words in a string.
 * @param {string} text
 * @returns {number}
 */
export function wordCount(text = '') {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
}
