/**
 * pdf/view/searchBar.js — in-doc Find bar.
 *
 * Layout: [search input] [n of m] [< >] [Aa] [W] [X]
 *
 * Stateless DOM. Caller drives:
 *   open(initialQuery?)  — shows the bar, focuses the input
 *   close()              — hides
 *   setMatches({ total, current })  — updates "3 of 47"
 *   onChange / onPrev / onNext / onClose / onCaseToggle / onWholeToggle
 */

import { el } from '../../../utils/dom.js';

export function buildSearchBar({
    onChange, onPrev, onNext, onClose,
    onCaseToggle, onWholeToggle,
    initial = { caseSensitive: false, wholeWord: false },
} = {}) {
    const root = el('div', { class: 'cx-find-bar', role: 'search' });
    root.style.display = 'none';

    const input = el('input', {
        type: 'text',
        class: 'cx-find-input',
        placeholder: 'Find in document…',
        'aria-label': 'Search query',
        oninput: () => {
            onChange?.(input.value);
            updateClearButton();
        },
        onkeydown: (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) onPrev?.();
                else onNext?.();
            } else if (e.key === 'Escape') {
                // Stop propagation so the global mobileShell Escape
                // handler doesn't close the entire reader.
                e.preventDefault();
                e.stopPropagation();
                onClose?.();
            }
        },
    });

    const clearBtn = el('button', {
        type: 'button', class: 'cx-find-clear',
        title: 'Clear',
        onclick: () => { input.value = ''; onChange?.(''); updateClearButton(); input.focus(); },
    }, '×');

    const counter = el('span', { class: 'cx-find-counter', 'aria-live': 'polite' }, '');

    const prevBtn = el('button', {
        type: 'button', class: 'cx-find-btn',
        title: 'Previous match (Shift+Enter)',
        'aria-label': 'Previous',
        onclick: () => onPrev?.(),
    }, '‹');
    const nextBtn = el('button', {
        type: 'button', class: 'cx-find-btn',
        title: 'Next match (Enter)',
        'aria-label': 'Next',
        onclick: () => onNext?.(),
    }, '›');

    let caseSensitive = !!initial.caseSensitive;
    let wholeWord = !!initial.wholeWord;

    const caseBtn = el('button', {
        type: 'button',
        class: `cx-find-toggle${caseSensitive ? ' is-active' : ''}`,
        title: 'Match case',
        'aria-pressed': caseSensitive ? 'true' : 'false',
        onclick: () => {
            caseSensitive = !caseSensitive;
            caseBtn.classList.toggle('is-active', caseSensitive);
            caseBtn.setAttribute('aria-pressed', caseSensitive ? 'true' : 'false');
            onCaseToggle?.(caseSensitive);
        },
    }, 'Aa');

    const wholeBtn = el('button', {
        type: 'button',
        class: `cx-find-toggle${wholeWord ? ' is-active' : ''}`,
        title: 'Whole words',
        'aria-pressed': wholeWord ? 'true' : 'false',
        onclick: () => {
            wholeWord = !wholeWord;
            wholeBtn.classList.toggle('is-active', wholeWord);
            wholeBtn.setAttribute('aria-pressed', wholeWord ? 'true' : 'false');
            onWholeToggle?.(wholeWord);
        },
    }, 'W');

    const closeBtn = el('button', {
        type: 'button', class: 'cx-find-btn',
        title: 'Close (Esc)',
        'aria-label': 'Close find bar',
        onclick: () => onClose?.(),
    }, '✕');

    const inputWrap = el('div', { class: 'cx-find-input-wrap' }, [input, clearBtn]);
    root.append(inputWrap, counter, prevBtn, nextBtn, caseBtn, wholeBtn, closeBtn);

    function updateClearButton() {
        clearBtn.style.display = input.value ? '' : 'none';
    }
    updateClearButton();

    function open(initialQuery) {
        root.style.display = '';
        if (typeof initialQuery === 'string') {
            input.value = initialQuery;
            updateClearButton();
        }
        setTimeout(() => { input.focus(); input.select(); }, 0);
    }

    function close() {
        root.style.display = 'none';
    }

    function setMatches({ total = 0, current = 0, indexing = false }) {
        if (indexing) {
            counter.textContent = 'indexing…';
            counter.classList.add('is-indexing');
            return;
        }
        counter.classList.remove('is-indexing');
        if (total === 0) counter.textContent = input.value ? '0 of 0' : '';
        else counter.textContent = `${current + 1} of ${total}`;
        prevBtn.disabled = total === 0;
        nextBtn.disabled = total === 0;
    }

    function getQuery() { return input.value; }
    function getFlags() { return { caseSensitive, wholeWord }; }

    return { root, open, close, setMatches, getQuery, getFlags };
}
