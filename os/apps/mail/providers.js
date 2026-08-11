/**
 * providers.js — lookup + URL construction for the Mail hub.
 *
 * This module is the security boundary. `buildUrl` is the only function in
 * Mail that produces a value handed to `window.open`, and every template it
 * draws from is a literal in providerTable.js.
 *
 * TWO PROPERTIES THIS FILE MUST KEEP
 * ----------------------------------
 * 1. **An unknown kind returns null, never a fallback.** The previous version
 *    did `kind === 'compose' ? compose : inbox`, so any typo'd or unsupported
 *    kind silently opened the inbox. With six kinds that is the same lie
 *    iCloud's compose button used to tell — "Sent" quietly opening the inbox.
 *    Returning null also makes the argument-order change below fail loudly:
 *    a stale positional call passes a number where a kind belongs, which is
 *    not in KINDS, so nothing opens instead of the wrong thing opening.
 *
 * 2. **Origin invariance.** After substitution the result must still start
 *    with the template's own literal prefix — everything up to its first
 *    placeholder. That is strictly stronger than checking for `https://`:
 *    it proves no interpolation can move the scheme, host, or path root,
 *    independently of how good the encoder is.
 *
 * SIGNATURE CHANGE (deliberate)
 * -----------------------------
 *   old: buildUrl(providerId, accountIndex, kind)
 *   new: buildUrl(providerId, kind, { accountIndex, query })
 * Kind is now the primary selector and the index is optional and usually 0.
 */

import { PROVIDERS, KINDS, KIND_LABELS } from './providerTable.js';

export { PROVIDERS, KINDS, KIND_LABELS };

const BY_ID = new Map(PROVIDERS.map(p => [p.id, p]));

/**
 * Gmail itself tops out well below 10 signed-in accounts, and the index rides
 * in a URL path segment, so the ceiling is a real constraint rather than a
 * defensive round number.
 */
export const MAX_ACCOUNT_INDEX = 9;

/** @returns {import('./providerTable.js').Provider|null} — null, never a guess. */
export function getProvider(id) {
    // Map lookup rather than object indexing, so 'constructor' / '__proto__'
    // from an imported blob cannot resolve to something inherited.
    return (typeof id === 'string' && BY_ID.get(id)) || null;
}

/** Providers that support /u/{i} style account addressing. */
export function supportsAccountIndex(id) {
    return !!getProvider(id)?.accountIndex;
}

/**
 * Does this provider declare this destination?
 *
 * Presence in `dest` is the capability. False for an unknown provider and for
 * an unknown kind, so callers never need to pre-validate either.
 */
export function supports(providerId, kind) {
    const provider = getProvider(providerId);
    if (!provider || !KINDS.includes(kind)) return false;
    return typeof provider.dest[kind] === 'string' && provider.dest[kind].length > 0;
}

/**
 * Every kind this provider declares, in KINDS order.
 *
 * Ordering by KINDS rather than by `Object.keys(dest)` keeps chip order
 * identical across providers regardless of how the table was authored.
 */
export function destinations(providerId) {
    const provider = getProvider(providerId);
    if (!provider) return [];
    return KINDS.filter(k => typeof provider.dest[k] === 'string' && provider.dest[k].length > 0);
}

/**
 * Coerce anything to a usable account index.
 *
 * Guards the real failure modes: a hand-edited storage blob, a NaN from
 * parseInt on an empty field, a float, a negative, or an absurd value.
 */
export function normalizeAccountIndex(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(MAX_ACCOUNT_INDEX, Math.max(0, Math.trunc(n)));
}

/** Everything in a template before its first placeholder — see §2 above. */
function literalPrefix(template) {
    const at = template.search(/\{[iq]\}/);
    return at === -1 ? template : template.slice(0, at);
}

/**
 * Resolve a provider + destination to a real URL.
 *
 * @param {string} providerId
 * @param {string} kind  must be in KINDS and declared by the provider
 * @param {{accountIndex?: number, query?: string}} [opts]
 * @returns {string|null} null means DO NOT NAVIGATE. Callers must treat it as
 *   "do nothing" rather than falling back to a guess.
 */
export function buildUrl(providerId, kind, opts = {}) {
    const provider = getProvider(providerId);
    if (!provider) return null;
    if (!KINDS.includes(kind)) return null;

    const template = provider.dest[kind];
    if (typeof template !== 'string' || !template) return null;

    const index = provider.accountIndex ? normalizeAccountIndex(opts.accountIndex) : 0;

    let url = template.split('{i}').join(String(index));

    if (url.includes('{q}')) {
        const raw = typeof opts.query === 'string' ? opts.query.trim() : '';
        // A search URL with an empty query is a worse destination than the
        // inbox — it lands the user in an empty result page. Refuse instead.
        if (!raw) return null;
        // encodeURIComponent turns / # ? & into %2F %23 %3F %26, so a query
        // cannot escape its path segment, open a fragment, or start a query.
        url = url.split('{q}').join(encodeURIComponent(raw));
    }

    // Origin invariance + scheme check. Both, not either: the prefix test is
    // what proves the host cannot move, and the https test is what keeps a
    // future non-https literal in the table from shipping.
    const prefix = literalPrefix(template);
    if (!url.startsWith('https://') || !url.startsWith(prefix)) return null;
    // Nothing may survive unsubstituted — a leftover placeholder would be a
    // literal '{' in a path, which is a silently wrong destination.
    if (url.includes('{i}') || url.includes('{q}')) return null;

    return url;
}

/**
 * Search URL for a provider, or null when it declares no search destination.
 *
 * Split out so the search bar never has to know about `kind` strings, and so
 * "this provider cannot search" is one call rather than a supports() + a
 * buildUrl() that a caller could get out of step.
 */
export function searchUrl(providerId, query, accountIndex = 0) {
    if (!supports(providerId, 'search')) return null;
    return buildUrl(providerId, 'search', { accountIndex, query });
}

/**
 * Providers that can be searched from here.
 *
 * A clipboard fallback for the others was built and then cut: it could not be
 * verified to work in any available environment (the async clipboard write was
 * refused headless, headful, and in the preview pane), and it silently
 * overwrites whatever the user had on their clipboard. An unverifiable feature
 * that clobbers shared system state is not worth a small convenience.
 *
 * Accounts that cannot search simply do not show the bar. See DESTINATIONS.md
 * for what it would take to add a route — it is one line in two files.
 */
export function searchableProviders() {
    return PROVIDERS.filter(p => supports(p.id, 'search')).map(p => p.id);
}
