/**
 * webSearch — the ONE place YancoTab sends a web search.
 *
 * Chrome Web Store policy (Quality Guidelines → Single Purpose, ref
 * "Red Argon", warning of 2026-11-03): a new-tab extension that offers web
 * search must respect the user's own search settings by using the Chrome
 * Search API. YancoTab therefore never picks a search engine itself:
 *
 *   - Extension: chrome.search.query() sends the text to whatever default
 *     search engine the user chose in Chrome. Needs the "search" permission.
 *   - Standalone web build (local dev / sw.js, no chrome.search): falls back
 *     to a plain web search URL. This path is unreachable inside the
 *     extension, so it is not an engine choice the extension makes.
 *
 * Do not add an engine picker or engine-specific URLs anywhere else.
 * Route every web search through runWebSearch().
 */

const STANDALONE_FALLBACK = 'https://www.google.com/search?q=';

/** Return chrome.search if the Chrome Search API is available, else null. */
function chromeSearchApi(env = globalThis) {
    try {
        const api = env?.chrome?.search;
        return api && typeof api.query === 'function' ? api : null;
    } catch {
        return null;
    }
}

/** True when web search goes to the user's Chrome default search engine. */
export function usesBrowserDefaultSearch(env = globalThis) {
    return chromeSearchApi(env) !== null;
}

/** Label for UI rows, e.g. `Search "cats" on the web`. Never names an engine. */
export function webSearchLabel(query) {
    return `Search the web for "${query}"`;
}

/**
 * Run a web search for `query` in a new tab.
 * @param {string} query
 * @param {object} [opts]
 * @param {(url: string) => void} [opts.openUrl] opener for the standalone
 *   fallback (defaults to window.open with noopener).
 * @param {object} [opts.env] global object, injectable for tests.
 * @returns {Promise<boolean>} true if a search was started.
 */
export async function runWebSearch(query, { openUrl, env = globalThis } = {}) {
    const text = String(query ?? '').trim();
    if (!text) return false;

    const api = chromeSearchApi(env);
    if (api) {
        try {
            await api.query({ text, disposition: 'NEW_TAB' });
            return true;
        } catch (err) {
            // Do not fall back to a hardcoded engine inside the extension:
            // that is exactly what the policy forbids.
            console.warn('[webSearch] chrome.search.query failed:', err);
            return false;
        }
    }

    const url = STANDALONE_FALLBACK + encodeURIComponent(text);
    const open = openUrl || ((u) => env?.open?.(u, '_blank', 'noopener,noreferrer'));
    open(url);
    return true;
}
