/**
 * pdf/library/LibraryFilter.js — filter pills + search + sort + view-toggle.
 *
 * Stateless DOM builder. Caller owns the state (filter / sort / query /
 * viewMode) and re-mounts when it wants the controls to reflect a new
 * value, or calls `update()` to mutate in place.
 */

import { el } from '../../../utils/dom.js';
import { FILTERS, SORTS, VIEW_MODES } from './libraryReducer.js';

const FILTER_LABELS = { all: 'All', recent: 'Recent', reading: 'Reading now' };
const SORT_LABELS = {
    lastOpened: 'Last opened',
    dateAdded: 'Date added',
    name: 'Name',
    size: 'Size',
};

export function buildLibraryFilter({ initial, onChange } = {}) {
    const state = {
        filter: FILTERS.includes(initial?.filter) ? initial.filter : 'all',
        sort: SORTS.includes(initial?.sort) ? initial.sort : 'lastOpened',
        viewMode: VIEW_MODES.includes(initial?.viewMode) ? initial.viewMode : 'grid',
        query: typeof initial?.query === 'string' ? initial.query : '',
    };

    const root = el('div', { class: 'pdf-lib-filter' });
    const pills = el('div', { class: 'pdf-lib-filter-pills', role: 'tablist' });
    const pillBtns = {};
    for (const key of FILTERS) {
        const btn = el('button', {
            type: 'button',
            class: `pdf-lib-pill ${state.filter === key ? 'is-active' : ''}`,
            role: 'tab',
            'aria-selected': state.filter === key ? 'true' : 'false',
            onclick: () => setFilter(key),
        }, FILTER_LABELS[key]);
        pillBtns[key] = btn;
        pills.appendChild(btn);
    }

    const search = el('input', {
        type: 'search',
        class: 'pdf-lib-filter-search',
        placeholder: 'Search documents…',
        value: state.query,
        oninput: (e) => {
            state.query = e.target.value;
            onChange?.({ ...state });
        },
    });

    const right = el('div', { class: 'pdf-lib-filter-right' });

    const sortLabel = el('span', { class: 'pdf-lib-filter-sort-label' }, 'Sort:');
    const sortSelect = el('select', {
        class: 'pdf-lib-filter-sort',
        onchange: (e) => {
            state.sort = e.target.value;
            onChange?.({ ...state });
        },
    });
    for (const k of SORTS) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = SORT_LABELS[k];
        if (k === state.sort) opt.selected = true;
        sortSelect.appendChild(opt);
    }

    const viewToggle = el('div', { class: 'pdf-lib-view-toggle', role: 'group' });
    const gridBtn = el('button', {
        type: 'button',
        class: `pdf-lib-view-btn ${state.viewMode === 'grid' ? 'is-active' : ''}`,
        title: 'Grid view',
        onclick: () => setViewMode('grid'),
    }, '▦');
    const listBtn = el('button', {
        type: 'button',
        class: `pdf-lib-view-btn ${state.viewMode === 'list' ? 'is-active' : ''}`,
        title: 'List view',
        onclick: () => setViewMode('list'),
    }, '☰');
    viewToggle.append(gridBtn, listBtn);

    right.append(sortLabel, sortSelect, viewToggle);

    root.append(pills, search, right);

    function setFilter(key) {
        if (!FILTERS.includes(key) || state.filter === key) return;
        state.filter = key;
        for (const k of Object.keys(pillBtns)) {
            const active = k === key;
            pillBtns[k].classList.toggle('is-active', active);
            pillBtns[k].setAttribute('aria-selected', active ? 'true' : 'false');
        }
        onChange?.({ ...state });
    }

    function setViewMode(mode) {
        if (!VIEW_MODES.includes(mode) || state.viewMode === mode) return;
        state.viewMode = mode;
        gridBtn.classList.toggle('is-active', mode === 'grid');
        listBtn.classList.toggle('is-active', mode === 'list');
        onChange?.({ ...state });
    }

    return {
        root,
        getState: () => ({ ...state }),
        setFilter,
        setViewMode,
        focusSearch: () => search.focus(),
    };
}
