/**
 * view/searchBar.js — search straight into a provider's own search.
 *
 * The differentiator. Every other webmail launcher gets you to an inbox; this
 * gets you to a result. Type "invoice", hit Enter, land on Gmail's results for
 * "invoice" in the right account.
 *
 * PRIVACY — the query is never stored, anywhere
 * ---------------------------------------------
 * This module imports no storage module and holds no history. That is
 * structural, not a promise: tests/mail-privacy.test.js source-scans this file
 * for `storage.save`, `localStorage` and the Mail storage keys, and fails if
 * any appear.
 *
 * The realistic leak is not the URL — it is the activity feed. `yancotab:
 * activity` events are persisted to `yancotab_activity_v1`, which is
 * `user-data` with `syncPolicy: 'conditional'`, i.e. **replicated through
 * chrome.storage.sync**. An emit that interpolated the query would write it to
 * disk and push it to Google. MailApp emits the provider name only, and the
 * same test pins that.
 *
 * NOT AUTOFOCUSED, deliberately
 * -----------------------------
 * Autofocusing this input would make `editable` true on open, which kills the
 * 1–9 account shortcuts every single time the app is opened. The `/` hint in
 * the placeholder is the affordance instead.
 */

import { el } from '../../../utils/dom.js';
import { getProvider, supports } from '../providers.js';

/**
 * @param {Array} accounts        accounts whose provider declares `search`
 * @param {string} selectedId
 * @param {{onSubmit:Function, onSelect:Function}} handlers
 * @returns {{node:HTMLElement, input:HTMLInputElement}|null} null when no
 *   account can search — the bar is hidden rather than shown broken.
 */
export function buildSearchBar(accounts, selectedId, { onSubmit, onSelect }) {
    const usable = accounts.filter(a => supports(a.providerId, 'search'));
    if (!usable.length) return null;

    const selected = usable.find(a => a.id === selectedId) || usable[0];
    const provider = getProvider(selected.providerId);

    const input = el('input', {
        class: 'mail-search-input',
        type: 'search',
        // Browser-level history off: the field is for a query that is
        // deliberately not remembered, so the browser must not remember it
        // either.
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: `Search ${provider?.name || 'mail'}…   /`,
        'aria-label': `Search ${provider?.name || 'mail'}`,
    });

    const submit = () => {
        const q = input.value.trim();
        if (!q) return;
        onSubmit(selected, q);
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            submit();
        }
    });

    const bar = el('form', {
        class: 'mail-search',
        onsubmit: (e) => { e.preventDefault(); submit(); },
    }, [
        el('span', { class: 'mail-search-icon', 'aria-hidden': 'true' }, '⌕'),
        input,
    ]);

    // Only offer the account picker when there is a genuine choice.
    if (usable.length > 1) {
        const select = el('select', {
            class: 'mail-search-pick',
            'aria-label': 'Which account to search',
            onchange: (e) => onSelect(e.target.value),
        });
        for (const account of usable) {
            const p = getProvider(account.providerId);
            const opt = el('option', { value: account.id },
                account.label || p?.name || account.providerId);
            if (account.id === selected.id) opt.selected = true;
            select.appendChild(opt);
        }
        bar.appendChild(select);
    }

    bar.appendChild(el('button', {
        class: 'mail-search-go',
        type: 'submit',
        'aria-label': 'Search',
    }, 'Search'));

    return { node: bar, input };
}
