/**
 * mailView.js — DOM builders for the Mail hub.
 *
 * Pure-ish: every builder takes data plus callbacks and returns nodes. It
 * reads no storage and holds no state, so MailApp stays the only place that
 * knows about persistence.
 *
 * All user-authored text (account labels) goes in through the el() builder's
 * text child or textContent — never innerHTML — so a label is always inert.
 */

import { el } from '../../utils/dom.js';
import { PROVIDERS, getProvider, buildUrl } from './providers.js';

/** Provider mark: a brand-tinted rounded square with the provider's letter. */
function providerMark(provider, size = 'md') {
    return el('div', {
        class: `mail-mark mail-mark-${size}`,
        style: {
            // Brand colour is a literal from the registry, never user input.
            background: `linear-gradient(160deg, ${provider.brand}, ${provider.brand}bb)`,
        },
        'aria-hidden': 'true',
    }, provider.short || provider.name.slice(0, 1));
}

/** "Gmail · /u/1" style subtitle describing exactly what will open. */
function accountDescriptor(account) {
    const provider = getProvider(account.providerId);
    if (!provider) return '';
    return provider.accountIndex
        ? `${provider.name} · account ${account.accountIndex}`
        : provider.name;
}

/**
 * The hero card — the default account, with the two actions that matter.
 *
 * When nothing is configured this becomes the onboarding prompt instead of an
 * empty box, so the app is useful on first open without any setup.
 */
export function buildHero(account, { onOpen, onCompose, onPickPrompt }) {
    const card = el('div', { class: 'mail-hero' });

    if (!account) {
        card.append(
            el('div', { class: 'mail-hero-empty' }, [
                el('div', { class: 'mail-hero-eyebrow' }, 'no default yet'),
                el('h2', { class: 'mail-hero-title' }, 'Pick your mail'),
                el('p', { class: 'mail-hero-sub' },
                    'Choose a provider below to open it now, or add it as an account to pin it here.'),
                el('button', {
                    class: 'mail-btn mail-btn-primary',
                    type: 'button',
                    onclick: onPickPrompt,
                }, 'Add an account'),
            ]),
        );
        return card;
    }

    const provider = getProvider(account.providerId);
    const inboxUrl = buildUrl(account.providerId, account.accountIndex, 'inbox');
    const composeUrl = buildUrl(account.providerId, account.accountIndex, 'compose');
    // Show the real destination host so it is obvious where a click goes.
    let host = '';
    try { host = new URL(inboxUrl).host; } catch { host = ''; }

    const actions = el('div', { class: 'mail-hero-actions' }, [
        el('button', { class: 'mail-btn mail-btn-primary', type: 'button', onclick: onOpen },
            'Open inbox'),
    ]);
    // Only offer Compose when the provider has a distinct compose target.
    // iCloud has none, and a button that just reopens the inbox is a lie.
    if (composeUrl && composeUrl !== inboxUrl) {
        actions.appendChild(
            el('button', { class: 'mail-btn', type: 'button', onclick: onCompose }, 'Compose'),
        );
    }

    card.append(
        el('div', { class: 'mail-hero-eyebrow' }, 'default'),
        el('div', { class: 'mail-hero-row' }, [
            providerMark(provider, 'lg'),
            el('div', { class: 'mail-hero-id' }, [
                el('h2', { class: 'mail-hero-title' }, account.label || provider.name),
                el('div', { class: 'mail-hero-sub' }, accountDescriptor(account)),
                el('div', { class: 'mail-hero-host' }, host),
            ]),
        ]),
        actions,
    );
    return card;
}

/**
 * The accounts rail.
 *
 * Each row opens its inbox on click. Secondary actions (make default, remove)
 * are explicit buttons rather than a long-press or a hidden menu — this is a
 * desktop-first surface and a destructive action should not be a gesture.
 */
export function buildAccountList(state, { onOpen, onSetDefault, onRemove, onAdd }) {
    const rail = el('section', { class: 'mail-rail' });
    rail.appendChild(el('div', { class: 'mail-rail-head' }, [
        el('h3', { class: 'mail-rail-title' }, 'Accounts'),
        el('span', { class: 'mail-rail-count' },
            state.accounts.length ? String(state.accounts.length) : ''),
    ]));

    const list = el('div', { class: 'mail-account-list' });

    if (!state.accounts.length) {
        list.appendChild(el('p', { class: 'mail-empty' },
            'No accounts yet. Add one to pin it here and switch with a single click.'));
    }

    for (const account of state.accounts) {
        const provider = getProvider(account.providerId);
        if (!provider) continue;
        const isDefault = account.id === state.defaultId;

        const row = el('div', {
            class: `mail-account${isDefault ? ' is-default' : ''}`,
            'data-account-id': account.id,
        });

        const main = el('button', {
            class: 'mail-account-main',
            type: 'button',
            title: `Open ${provider.name}`,
            onclick: () => onOpen(account),
        }, [
            providerMark(provider, 'sm'),
            el('span', { class: 'mail-account-text' }, [
                el('span', { class: 'mail-account-label' }, account.label || provider.name),
                el('span', { class: 'mail-account-meta' }, accountDescriptor(account)),
            ]),
        ]);

        const tools = el('div', { class: 'mail-account-tools' });
        if (isDefault) {
            tools.appendChild(el('span', { class: 'mail-pin', title: 'Default account' }, '★'));
        } else {
            tools.appendChild(el('button', {
                class: 'mail-icon-btn',
                type: 'button',
                title: 'Make default',
                'aria-label': `Make ${account.label || provider.name} the default`,
                onclick: () => onSetDefault(account),
            }, '☆'));
        }
        tools.appendChild(el('button', {
            class: 'mail-icon-btn mail-icon-danger',
            type: 'button',
            title: 'Remove',
            'aria-label': `Remove ${account.label || provider.name}`,
            onclick: () => onRemove(account),
        }, '×'));

        row.append(main, tools);
        list.appendChild(row);
    }

    rail.append(list, el('button', {
        class: 'mail-add',
        type: 'button',
        onclick: onAdd,
    }, '+  Add account'));

    return rail;
}

/**
 * The provider grid.
 *
 * Primary click opens the provider immediately — no setup, no account needed.
 * That is deliberate: the common case is "just get me to my mail", and making
 * that require configuration first would be worse than a bookmark.
 * The ⁺ affordance is the path to pinning it as an account.
 */
export function buildProviderGrid({ onOpenProvider, onAddProvider, picking = false }) {
    const section = el('section', { class: 'mail-providers' });
    section.appendChild(el('div', { class: 'mail-section-head' }, [
        el('h3', { class: 'mail-section-title' }, picking ? 'Pick a provider to add' : 'All providers'),
        el('span', { class: 'mail-section-hint' },
            picking ? 'esc to cancel' : 'click to open · ⁺ to pin as account'),
    ]));

    // `picking` is applied here, on the grid itself, because that is what the
    // .mail-provider-grid.is-picking rules key off. Setting it on the returned
    // <section> from the caller silently does nothing.
    const grid = el('div', {
        class: `mail-provider-grid${picking ? ' is-picking' : ''}`,
    });

    for (const provider of PROVIDERS) {
        const tile = el('div', { class: 'mail-provider', 'data-provider': provider.id });

        const open = el('button', {
            class: 'mail-provider-open',
            type: 'button',
            title: provider.hint ? `${provider.name} — ${provider.hint}` : `Open ${provider.name}`,
            onclick: () => onOpenProvider(provider),
        }, [
            providerMark(provider, 'md'),
            el('span', { class: 'mail-provider-name' }, provider.name),
        ]);

        const pin = el('button', {
            class: 'mail-provider-pin',
            type: 'button',
            title: `Add ${provider.name} as an account`,
            'aria-label': `Add ${provider.name} as an account`,
            onclick: () => onAddProvider(provider),
        }, '⁺');

        tile.append(open, pin);
        grid.appendChild(tile);
    }

    section.appendChild(grid);
    return section;
}

/**
 * Privacy note.
 *
 * Stated in the UI, not just in the docs: a "Mail" app in a privacy-first
 * extension invites the reasonable assumption that it is reading mail. It
 * isn't, and it can't.
 */
export function buildFootnote() {
    return el('p', { class: 'mail-note' },
        'Shortcuts only — YancoTab never connects to your mailbox, so there are no '
        + 'unread counts. Nothing leaves this browser.');
}

/** Frame: hero + providers on the left, accounts rail on the right. */
export function buildFrame() {
    const frame = el('div', { class: 'mail-frame' });
    const left = el('div', { class: 'mail-col-main' });
    const right = el('div', { class: 'mail-col-side' });
    frame.append(left, right);
    return { frame, left, right };
}
