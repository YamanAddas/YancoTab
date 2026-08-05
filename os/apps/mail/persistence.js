/**
 * persistence.js — Mail accounts, stored through kernel.storage.
 *
 * Shape (one key, `yancotab_mail_v1`):
 *   { accounts: Account[], defaultId: string|null }
 *
 *   Account = { id, providerId, accountIndex, label }
 *
 * One key rather than two so that adding an account and promoting it to
 * default is a single atomic write — a split would let a sync race leave
 * defaultId pointing at an account the other device has not seen yet.
 *
 * WHAT IS STORED: a provider id, a small integer, and a nickname the user
 * typed. No addresses are required, no passwords, no tokens — there is nothing
 * to authenticate with, because these are just deep links. `label` is free
 * text and is always rendered via textContent, never interpolated into markup
 * or a URL.
 */

import { getProvider, normalizeAccountIndex } from './providers.js';
import { sanitizeDisplayText } from '../../utils/text.js';

export const MAIL_KEY = 'yancotab_mail_v1';

/** Hard cap. Guards a corrupt import from growing the blob without bound. */
export const MAX_ACCOUNTS = 12;

/** Keep labels short enough to render, and strip control characters. */
export const MAX_LABEL = 40;

export function emptyState() {
    return { accounts: [], defaultId: null };
}

/**
 * Label hygiene lives in utils/text.js — quick links needed the identical
 * rule, and two copies of a sanitizer is how one of them silently falls
 * behind the other. See that module for why each range is stripped.
 */
const sanitizeLabel = (raw) => sanitizeDisplayText(raw, MAX_LABEL);

/**
 * Coerce whatever is in storage into a valid state.
 *
 * Written defensively on purpose: this blob is replicated through
 * chrome.storage.sync and is reachable by the JSON import path, so it can
 * legitimately arrive malformed, from a newer version, or hand-edited.
 * Anything unrecognized is dropped rather than trusted.
 */
export function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.accounts)) return emptyState();

    const seen = new Set();
    const accounts = [];

    for (const entry of raw.accounts) {
        if (!entry || typeof entry !== 'object') continue;
        // Unknown provider → drop. Never fall back to a default provider: that
        // would silently repoint an account at someone else's mail host.
        const provider = getProvider(entry.providerId);
        if (!provider) continue;

        const accountIndex = provider.accountIndex ? normalizeAccountIndex(entry.accountIndex) : 0;
        const id = typeof entry.id === 'string' && entry.id ? entry.id : makeId(entry.providerId, accountIndex);
        if (seen.has(id)) continue;
        seen.add(id);

        accounts.push({
            id,
            providerId: provider.id,
            accountIndex,
            label: sanitizeLabel(entry.label),
        });

        if (accounts.length >= MAX_ACCOUNTS) break;
    }

    // A defaultId that no longer resolves would leave the header with no
    // primary action, so fall back to the first account.
    let defaultId = typeof raw.defaultId === 'string' ? raw.defaultId : null;
    if (!accounts.some(a => a.id === defaultId)) {
        defaultId = accounts.length ? accounts[0].id : null;
    }

    return { accounts, defaultId };
}

/**
 * Stable id derived from provider + index.
 *
 * Deriving rather than randomising means the same account added on two devices
 * collapses to one row after sync instead of duplicating.
 */
export function makeId(providerId, accountIndex = 0) {
    return `${providerId}:${normalizeAccountIndex(accountIndex)}`;
}

export function loadState(kernel) {
    try {
        return normalizeState(kernel?.storage?.load(MAIL_KEY));
    } catch {
        return emptyState();
    }
}

export function saveState(kernel, state) {
    const clean = normalizeState(state);
    try {
        kernel?.storage?.save(MAIL_KEY, clean);
    } catch (e) {
        // Storage full / quota. Surface once rather than failing silently —
        // the user would otherwise think the account was added.
        kernel?.emit?.('toast', { message: 'Could not save mail accounts', type: 'error' });
        console.warn('[mail] save failed', e);
    }
    return clean;
}

/**
 * Add an account. Returns the new state.
 *
 * Adding an account that already exists is a no-op on the list but still
 * refreshes the label, which is what a user re-adding "work" to rename it
 * expects.
 */
export function addAccount(state, { providerId, accountIndex = 0, label = '' }) {
    const provider = getProvider(providerId);
    if (!provider) return normalizeState(state);

    const base = normalizeState(state);
    const index = provider.accountIndex ? normalizeAccountIndex(accountIndex) : 0;
    const id = makeId(provider.id, index);

    const existing = base.accounts.find(a => a.id === id);
    if (existing) {
        const next = base.accounts.map(a =>
            a.id === id ? { ...a, label: sanitizeLabel(label) || a.label } : a);
        return normalizeState({ ...base, accounts: next });
    }

    if (base.accounts.length >= MAX_ACCOUNTS) return base;

    return normalizeState({
        accounts: [...base.accounts, { id, providerId: provider.id, accountIndex: index, label }],
        // First account added becomes the default, so the primary action is
        // never empty after the very first setup.
        defaultId: base.defaultId || id,
    });
}

export function removeAccount(state, id) {
    const base = normalizeState(state);
    return normalizeState({
        accounts: base.accounts.filter(a => a.id !== id),
        // normalizeState re-points defaultId if this was it.
        defaultId: base.defaultId === id ? null : base.defaultId,
    });
}

export function setDefault(state, id) {
    const base = normalizeState(state);
    if (!base.accounts.some(a => a.id === id)) return base;
    return { ...base, defaultId: id };
}

export function getDefaultAccount(state) {
    const base = normalizeState(state);
    return base.accounts.find(a => a.id === base.defaultId) || null;
}
