import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

/**
 * PageTabs — top-level navigation for the home page.
 *
 *   [Apps]  [Today]  [Files]  [Notes]  [Web]
 *
 * Click a tab → set `body.tab-<id>` class. CSS rules show/hide the matching
 * `.page-pane[data-tab="<id>"]` blocks. Apps is default.
 *
 * Also dispatches `page:tab-change` so other components (notably SmartSearch)
 * can sync — the active tab doubles as the search scope when the user types.
 *
 * Persists active tab in `kernel.storage('yancotab_active_page_tab')` so the
 * choice survives reload. Default: 'apps'.
 */

const TABS = [
    { id: 'apps',  label: 'Apps',  meta: 'Your installed apps' },
    { id: 'today', label: 'Today', meta: 'Live widgets' },
    { id: 'files', label: 'Files', meta: 'Your files' },
    { id: 'notes', label: 'Notes', meta: 'Your notes' },
    { id: 'web',   label: 'Web',   meta: 'Quick links' },
];

const STORAGE_KEY = 'yancotab_active_page_tab';

export class PageTabs {
    constructor() {
        this.root = null;
        this._items = new Map();
        this._active = this._loadActive();
    }

    _loadActive() {
        try {
            const stored = kernel.storage?.load(STORAGE_KEY);
            if (typeof stored === 'string' && TABS.some(t => t.id === stored)) {
                return stored;
            }
        } catch { /* ignore */ }
        return 'apps';
    }

    render() {
        this.root = el('div', { class: 'page-tabs', role: 'tablist' });

        for (const tab of TABS) {
            const node = el('button', {
                type: 'button',
                class: `page-tab${tab.id === this._active ? ' active' : ''}`,
                'data-tab': tab.id,
                role: 'tab',
                'aria-selected': tab.id === this._active ? 'true' : 'false',
                title: tab.meta,
                onclick: () => this.setActive(tab.id),
            }, [
                el('span', { class: 'page-tab-label' }, tab.label),
                el('span', { class: 'page-tab-underline' }),
            ]);
            this._items.set(tab.id, node);
            this.root.appendChild(node);
        }

        // Apply the body class on first render so CSS shows the right pane
        this._applyBodyClass();

        return this.root;
    }

    setActive(id) {
        if (!TABS.some(t => t.id === id) || id === this._active) return;
        this._active = id;
        for (const [tabId, node] of this._items) {
            const isActive = tabId === id;
            node.classList.toggle('active', isActive);
            node.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
        this._applyBodyClass();
        try { kernel.storage?.save(STORAGE_KEY, id); } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent('page:tab-change', { detail: { tab: id } }));
    }

    getActive() { return this._active; }

    _applyBodyClass() {
        for (const t of TABS) document.body.classList.remove(`tab-${t.id}`);
        document.body.classList.add(`tab-${this._active}`);
    }

    destroy() {
        if (this.root) this.root.remove();
        this._items.clear();
    }
}
