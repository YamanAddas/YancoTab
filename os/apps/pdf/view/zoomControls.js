/**
 * pdf/view/zoomControls.js — zoom group UI: [-] [100% ▾] [+]
 *
 * The middle button is a clickable label that opens a small popover
 * with presets (50/75/100/125/150/200/300/400, Fit width, Fit page,
 * Actual size). Custom % is typed in an input at the bottom.
 *
 * Stateless DOM builder — caller owns the zoom state and calls
 * `update(level)` to reflect changes. Click handlers fire callbacks.
 */

import { el } from '../../../utils/dom.js';
import { PRESETS, formatLevel, levelFromString } from '../engine/zoom.js';

export function buildZoomControls({ onStep, onPick, getCurrent } = {}) {
    const root = el('div', { class: 'cx-zoom-group', role: 'group', 'aria-label': 'Zoom' });

    const minus = el('button', {
        type: 'button', class: 'cx-zoom-btn cx-zoom-btn-step',
        title: 'Zoom out', 'aria-label': 'Zoom out',
        onclick: () => onStep?.(-1),
    }, '−');

    const label = el('button', {
        type: 'button', class: 'cx-zoom-btn cx-zoom-label',
        title: 'Zoom presets', 'aria-haspopup': 'true', 'aria-expanded': 'false',
        onclick: () => togglePopover(),
    }, '100%');

    const plus = el('button', {
        type: 'button', class: 'cx-zoom-btn cx-zoom-btn-step',
        title: 'Zoom in', 'aria-label': 'Zoom in',
        onclick: () => onStep?.(1),
    }, '+');

    root.append(minus, label, plus);

    let popover = null;

    function togglePopover() {
        if (popover) { closePopover(); return; }
        openPopover();
    }

    function openPopover() {
        const cur = getCurrent?.();
        popover = el('div', { class: 'cx-zoom-popover', role: 'menu' });

        const list = el('div', { class: 'cx-zoom-popover-list' });
        for (const p of PRESETS) {
            const it = el('button', {
                type: 'button',
                class: `cx-zoom-popover-item${cur === p ? ' is-current' : ''}`,
                role: 'menuitem',
                onclick: () => { onPick?.(p); closePopover(); },
            }, formatLevel(p));
            list.appendChild(it);
        }
        const sep = el('div', { class: 'cx-zoom-popover-sep' });
        const fitWidth = el('button', {
            type: 'button',
            class: `cx-zoom-popover-item${cur === 'fit-width' ? ' is-current' : ''}`,
            role: 'menuitem',
            onclick: () => { onPick?.('fit-width'); closePopover(); },
        }, 'Fit width');
        const fitPage = el('button', {
            type: 'button',
            class: `cx-zoom-popover-item${cur === 'fit-page' ? ' is-current' : ''}`,
            role: 'menuitem',
            onclick: () => { onPick?.('fit-page'); closePopover(); },
        }, 'Fit page');
        const actual = el('button', {
            type: 'button',
            class: 'cx-zoom-popover-item',
            role: 'menuitem',
            onclick: () => { onPick?.(1.0); closePopover(); },
        }, 'Actual size');

        const customWrap = el('div', { class: 'cx-zoom-popover-custom' });
        const customInput = el('input', {
            type: 'text',
            class: 'cx-zoom-popover-input',
            placeholder: '150%',
            'aria-label': 'Custom zoom',
            onkeydown: (e) => {
                if (e.key === 'Enter') {
                    const parsed = levelFromString(customInput.value);
                    if (parsed != null) {
                        onPick?.(parsed);
                        closePopover();
                    } else {
                        customInput.classList.add('is-invalid');
                        setTimeout(() => customInput.classList.remove('is-invalid'), 600);
                    }
                } else if (e.key === 'Escape') {
                    closePopover();
                }
            },
        });
        customWrap.append(customInput);

        popover.append(list, sep, fitWidth, fitPage, actual, sep.cloneNode(), customWrap);

        // Position below the label button.
        const rect = label.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.left = `${Math.round(rect.left + rect.width / 2 - 110)}px`;
        popover.style.top = `${Math.round(rect.bottom + 4)}px`;

        document.body.appendChild(popover);
        label.setAttribute('aria-expanded', 'true');
        setTimeout(() => customInput.focus(), 0);

        document.addEventListener('mousedown', onOutsideClick, true);
        document.addEventListener('keydown', onEscape, true);
    }

    function closePopover() {
        if (!popover) return;
        popover.remove();
        popover = null;
        label.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', onOutsideClick, true);
        document.removeEventListener('keydown', onEscape, true);
    }

    function onOutsideClick(e) {
        if (!popover) return;
        if (popover.contains(e.target) || root.contains(e.target)) return;
        closePopover();
    }
    function onEscape(e) {
        if (e.key === 'Escape') { e.preventDefault(); closePopover(); }
    }

    return {
        root,
        update(level) { label.textContent = formatLevel(level); },
        destroy() { closePopover(); },
    };
}
