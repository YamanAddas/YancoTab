/**
 * pdf/view/moreMenu.js — overflow popover for the reader bar.
 *
 * Contains: Print / Dark mode toggle / Properties / (future).
 * Triggered by the "⋯" button in the reader bar.
 */

import { el } from '../../../utils/dom.js';

export function buildMoreMenu({ onPrint, onToggleDark, onShowProperties, getDarkMode } = {}) {
    const trigger = el('button', {
        type: 'button',
        class: 'cx-icbtn',
        title: 'More',
        'aria-label': 'More options',
        'aria-haspopup': 'true',
        onclick: () => toggle(),
    }, '⋯');

    let popover = null;

    function toggle() {
        if (popover) close();
        else open();
    }

    function open() {
        popover = el('div', { class: 'cx-more-popover', role: 'menu' });
        const isDark = !!getDarkMode?.();

        addItem(popover, '🖨', 'Print',          () => { close(); onPrint?.(); });
        addItem(popover, '🌙', isDark ? 'Light pages' : 'Dark pages',
                () => { close(); onToggleDark?.(); });
        addItem(popover, 'ℹ',  'Properties',     () => { close(); onShowProperties?.(); });

        const rect = trigger.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
        popover.style.top = `${Math.round(rect.bottom + 4)}px`;

        document.body.appendChild(popover);
        document.addEventListener('mousedown', onOutside, true);
        document.addEventListener('keydown', onEsc, true);
    }

    function close() {
        if (!popover) return;
        popover.remove();
        popover = null;
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onEsc, true);
    }

    function onOutside(e) {
        if (!popover) return;
        if (popover.contains(e.target) || trigger.contains(e.target)) return;
        close();
    }

    function onEsc(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
    }

    function addItem(host, glyph, label, fn) {
        const it = el('button', {
            type: 'button', class: 'cx-more-item', role: 'menuitem',
            onclick: fn,
        }, [
            el('span', { class: 'cx-more-glyph' }, glyph),
            el('span', { class: 'cx-more-label' }, label),
        ]);
        host.appendChild(it);
    }

    return { trigger, close };
}
