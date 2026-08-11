/**
 * view/directory.js — the provider directory.
 *
 * Twelve providers is a setup-time list, so it is a *flow*, not furniture: it
 * takes over the board area on demand and hands it straight back. That is the
 * fix for the old layout's two problems at once — a third of the window was
 * permanently spent on a decision made twice a year, and the same providers
 * appeared both as tiles and as accounts, which read as the same thing twice.
 *
 * ZERO-SETUP SURVIVES, and this is not negotiable — it was a deliberate v1.2.0
 * property. With no accounts pinned, MailApp opens *directly on the directory*,
 * so "just get me to Gmail" is still one click with no configuration. The
 * board only becomes the primary surface once something is pinned.
 */

import { el } from '../../../utils/dom.js';
import { PROVIDERS, destinations } from '../providers.js';
import { providerMark } from './mark.js';

/**
 * @param {{onOpen:Function, onAdd:Function, onCancel:Function, canCancel:boolean}} handlers
 */
export function buildDirectory({ onOpen, onAdd, onCancel, canCancel = true }) {
    const section = el('section', { class: 'mail-directory' });

    section.appendChild(el('div', { class: 'mail-board-head' }, [
        el('h3', { class: 'mail-board-title' }, canCancel ? 'Add an account' : 'Open your mail'),
        el('span', { class: 'mail-board-hint' },
            canCancel ? 'esc to cancel' : 'open now, or ＋ to pin it'),
        canCancel
            ? el('button', {
                class: 'mail-dir-cancel',
                type: 'button',
                onclick: onCancel,
            }, 'Cancel')
            : null,
    ].filter(Boolean)));

    const grid = el('div', { class: 'mail-dir-grid' });

    for (const provider of PROVIDERS) {
        const tile = el('div', { class: 'mail-dir-tile', 'data-provider': provider.id });

        // Primary click opens immediately — no setup, no account needed. The
        // common case is "just get me to my mail", and requiring configuration
        // first would make this worse than a bookmark.
        const open = el('button', {
            class: 'mail-dir-open',
            type: 'button',
            title: `Open ${provider.name}`,
            onclick: () => onOpen(provider),
        }, [
            providerMark(provider, 'md'),
            el('span', { class: 'mail-dir-text' }, [
                el('span', { class: 'mail-dir-name' }, provider.name),
                // Rendered, not a tooltip: this line is the only thing that
                // tells Outlook and Outlook 365 apart.
                provider.hint ? el('span', { class: 'mail-dir-hint' }, provider.hint) : null,
            ].filter(Boolean)),
        ]);

        // Shows what this provider can actually do, before you commit to it.
        const caps = destinations(provider.id).length;
        open.appendChild(el('span', { class: 'mail-dir-caps' }, `${caps}`));

        const pin = el('button', {
            class: 'mail-dir-pin',
            type: 'button',
            title: `Pin ${provider.name} as an account`,
            'aria-label': `Pin ${provider.name} as an account`,
            onclick: () => onAdd(provider),
        }, '＋');

        tile.append(open, pin);
        grid.appendChild(tile);
    }

    section.appendChild(grid);
    return section;
}
