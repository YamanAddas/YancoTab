/**
 * view/board.js — the accounts board.
 *
 * One surface, replacing the old hero + rail + always-on provider grid. The
 * grid was a *directory* — a setup-time concern — permanently occupying the
 * primary area for a decision the user makes about twice a year, while the
 * accounts they use every day were squeezed into a 268px side rail. The
 * directory now opens on demand (view/directory.js); this is what remains.
 *
 * Every builder takes data plus callbacks and returns nodes. It reads no
 * storage and holds no state. All user-authored text (account labels) goes in
 * as a text child or textContent — never innerHTML — so a label is inert.
 *
 * Rows carry `data-account-id` because MailApp updates them surgically rather
 * than rebuilding the board: starring an account used to re-render twelve
 * cards and every chip in them.
 */

import { el } from '../../../utils/dom.js';
import { getProvider, destinations, buildUrl, KIND_LABELS } from '../providers.js';
import { providerMark } from './mark.js';

/** "Gmail · account 1" — says exactly what will open. */
export function accountDescriptor(account) {
    const provider = getProvider(account.providerId);
    if (!provider) return '';
    return provider.accountIndex
        ? `${provider.name} · account ${account.accountIndex}`
        : provider.name;
}

/**
 * The destination chips for one account.
 *
 * Capability-gated: a chip exists only where the provider *declares* that
 * destination in its `dest` map. Nobody is offered a Sent chip that lands them
 * on an inbox, and nobody is offered Compose on iCloud.
 *
 * `search` is excluded here on purpose — it needs a query, so it belongs to
 * the search bar. A chip that opened an empty search page would be strictly
 * worse than the bar that lands you in a result.
 */
export function buildChips(account, onOpen) {
    const row = el('div', { class: 'mail-chip-row' });

    for (const kind of destinations(account.providerId)) {
        if (kind === 'search') continue;

        // Resolve now so a template that cannot build (bad index, stray
        // placeholder) drops its chip instead of rendering a dead button.
        const url = buildUrl(account.providerId, kind, { accountIndex: account.accountIndex });
        if (!url) continue;

        let host = '';
        try { host = new URL(url).host; } catch { host = ''; }

        row.appendChild(el('button', {
            class: `mail-chip mail-chip--${kind}`,
            type: 'button',
            'data-kind': kind,
            title: host ? `${KIND_LABELS[kind]} — ${host}` : KIND_LABELS[kind],
            onclick: (e) => { e.stopPropagation(); onOpen(account, kind); },
        }, KIND_LABELS[kind]));
    }

    return row;
}

/**
 * One account card.
 *
 * The card body is a button (click → inbox) and the chips are buttons inside
 * it — so every chip stops propagation, or clicking "Sent" would also fire the
 * card's own open-inbox handler and race two tabs.
 */
export function buildAccountCard(account, state, handlers) {
    const provider = getProvider(account.providerId);
    if (!provider) return null;

    const isDefault = account.id === state.defaultId;
    const name = account.label || provider.name;

    const card = el('div', {
        class: `mail-card${isDefault ? ' is-default' : ''}`,
        'data-account-id': account.id,
    });

    const head = el('button', {
        class: 'mail-card-head',
        type: 'button',
        title: `Open ${provider.name}`,
        onclick: () => handlers.onOpen(account, 'inbox'),
    }, [
        providerMark(provider, 'md'),
        el('span', { class: 'mail-card-id' }, [
            el('span', { class: 'mail-card-label' }, name),
            el('span', { class: 'mail-card-meta' }, accountDescriptor(account)),
            // The hint is RENDERED, not a tooltip. It is the only thing that
            // separates Outlook from Outlook 365 — both are "Microsoft
            // Outlook" and every brand asset set ships one glyph for them, so
            // no icon can do this job.
            provider.hint ? el('span', { class: 'mail-card-hint' }, provider.hint) : null,
        ].filter(Boolean)),
    ]);

    const tools = el('div', { class: 'mail-card-tools' });
    tools.appendChild(el('button', {
        class: `mail-star${isDefault ? ' is-on' : ''}`,
        type: 'button',
        'aria-pressed': isDefault ? 'true' : 'false',
        title: isDefault ? 'Default account' : 'Make default',
        'aria-label': isDefault ? `${name} is the default account` : `Make ${name} the default`,
        onclick: (e) => { e.stopPropagation(); handlers.onSetDefault(account); },
    }, isDefault ? '★' : '☆'));
    tools.appendChild(el('button', {
        class: 'mail-remove',
        type: 'button',
        title: 'Remove',
        'aria-label': `Remove ${name}`,
        onclick: (e) => { e.stopPropagation(); handlers.onRemove(account); },
    }, '×'));

    card.append(head, tools, buildChips(account, handlers.onOpen));
    return card;
}

/** The "＋ Add account" tile that ends the board. */
export function buildAddTile(onAdd) {
    return el('button', {
        class: 'mail-add-tile',
        type: 'button',
        onclick: onAdd,
    }, [
        el('span', { class: 'mail-add-plus' }, '＋'),
        el('span', { class: 'mail-add-text' }, 'Add account'),
    ]);
}

/**
 * The board section.
 *
 * Returns the section plus the live grid node, so MailApp can insert, remove
 * and reorder single cards without rebuilding anything around them.
 */
export function buildBoard(state, handlers) {
    const section = el('section', { class: 'mail-board' });

    section.appendChild(el('div', { class: 'mail-board-head' }, [
        el('h3', { class: 'mail-board-title' }, 'Accounts'),
        el('span', { class: 'mail-board-count' },
            state.accounts.length ? String(state.accounts.length) : ''),
        el('span', { class: 'mail-board-hint' },
            state.accounts.length > 1 ? 'drag to reorder · 1–9 to open' : ''),
    ]));

    const grid = el('div', { class: 'mail-board-grid' });
    for (const account of state.accounts) {
        const card = buildAccountCard(account, state, handlers);
        if (card) grid.appendChild(card);
    }
    grid.appendChild(buildAddTile(handlers.onAdd));

    section.appendChild(grid);
    return { section, grid };
}

/**
 * Privacy note.
 *
 * Stated in the UI, not just in the docs: a "Mail" app in a privacy-first
 * extension invites the reasonable assumption that it is reading mail. It
 * isn't, and it can't. The affiliation line is also the disclaimer that goes
 * with using third-party brand marks nominatively — see marks.js.
 */
export function buildFootnote() {
    return el('p', { class: 'mail-note' }, [
        el('span', {},
            'Shortcuts only — YancoTab never connects to your mailbox, so there are no '
            + 'unread counts. Nothing leaves this browser.'),
        el('span', { class: 'mail-note-dim' },
            ' Provider names and logos are trademarks of their owners; YancoTab is not '
            + 'affiliated with or endorsed by any of them.'),
    ]);
}
