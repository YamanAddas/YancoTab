/**
 * pdf/view/viewModeMenu.js — segmented picker for view modes.
 *
 * Layout: [Single] [Continuous] [Spread] [Book] as a single pill row.
 * Active mode highlighted with accent. Click → callback.
 *
 * Modes:
 *   single     — one page at a time, page-flip teleport
 *   continuous — virtualized vertical scroll
 *   spread     — 2-up (current default for landscape ≥ 920px)
 *   book       — 2-up cover-offset (cover alone on right)
 */

import { el } from '../../../utils/dom.js';

export const VIEW_MODES = Object.freeze(['single', 'continuous', 'spread', 'book']);

const LABELS = Object.freeze({
    single:     { label: 'Single',  glyph: '▭',  title: 'Single page' },
    continuous: { label: 'Scroll',  glyph: '☰', title: 'Continuous scroll' },
    spread:     { label: 'Spread',  glyph: '▭▭', title: 'Two-page spread' },
    book:       { label: 'Book',    glyph: '📖', title: 'Two-page book (cover offset)' },
});

export function buildViewModeMenu({ initial = 'continuous', onPick } = {}) {
    const root = el('div', { class: 'cx-mode-group', role: 'group', 'aria-label': 'View mode' });
    const buttons = {};
    let current = VIEW_MODES.includes(initial) ? initial : 'continuous';

    for (const mode of VIEW_MODES) {
        const meta = LABELS[mode];
        const btn = el('button', {
            type: 'button',
            class: `cx-mode-btn${mode === current ? ' is-active' : ''}`,
            title: meta.title,
            'aria-pressed': mode === current ? 'true' : 'false',
            onclick: () => { setMode(mode); onPick?.(mode); },
        }, [
            el('span', { class: 'cx-mode-glyph' }, meta.glyph),
            el('span', { class: 'cx-mode-label' }, meta.label),
        ]);
        buttons[mode] = btn;
        root.appendChild(btn);
    }

    function setMode(mode) {
        if (!VIEW_MODES.includes(mode)) return;
        current = mode;
        for (const m of VIEW_MODES) {
            const active = m === mode;
            buttons[m].classList.toggle('is-active', active);
            buttons[m].setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    return {
        root,
        get current() { return current; },
        setMode,
    };
}
