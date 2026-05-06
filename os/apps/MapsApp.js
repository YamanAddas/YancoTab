import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

const RECENTS_KEY = 'yancotab_maps_recents';
const FAVORITES_KEY = 'yancotab_maps_favorites';
const MAX_RECENTS = 12;
const MAX_FAVORITES = 20;

const CATEGORIES = [
    { id: 'restaurant',  icon: '🍽️', label: 'Restaurants',  query: 'restaurants',    bg: 'linear-gradient(145deg, #3d1a1a, #261010)' },
    { id: 'coffee',      icon: '☕',  label: 'Coffee',       query: 'coffee shops',   bg: 'linear-gradient(145deg, #3d2e1a, #261c0f)' },
    { id: 'gas',         icon: '⛽',  label: 'Gas Stations', query: 'gas stations',   bg: 'linear-gradient(145deg, #3d3218, #26200e)' },
    { id: 'hotel',       icon: '🏨',  label: 'Hotels',       query: 'hotels',         bg: 'linear-gradient(145deg, #0d2240, #061830)' },
    { id: 'hospital',    icon: '🏥',  label: 'Hospitals',    query: 'hospitals',      bg: 'linear-gradient(145deg, #2d1020, #1a0812)' },
    { id: 'pharmacy',    icon: '💊',  label: 'Pharmacy',     query: 'pharmacy',       bg: 'linear-gradient(145deg, #0d3328, #081e18)' },
    { id: 'grocery',     icon: '🛒',  label: 'Grocery',      query: 'grocery stores', bg: 'linear-gradient(145deg, #2e2e0d, #1a1a08)' },
    { id: 'parking',     icon: '🅿️',  label: 'Parking',      query: 'parking',        bg: 'linear-gradient(145deg, #141450, #0a0a30)' },
    { id: 'gym',         icon: '💪',  label: 'Gym',          query: 'gym fitness',    bg: 'linear-gradient(145deg, #3d1818, #260e0e)' },
    { id: 'bank',        icon: '🏦',  label: 'Banks',        query: 'banks ATM',      bg: 'linear-gradient(145deg, #0a1e3d, #061430)' },
    { id: 'shopping',    icon: '🛍️',  label: 'Shopping',     query: 'shopping malls', bg: 'linear-gradient(145deg, #2e1040, #1a0828)' },
    { id: 'park',        icon: '🌳',  label: 'Parks',        query: 'parks',          bg: 'linear-gradient(145deg, #0d2a18, #081a10)' },
];

const QUICK_ACTIONS = [
    { id: 'directions', icon: '🧭', label: 'Directions',  bg: 'linear-gradient(145deg, #1a2a4a, #0d1b36)' },
    { id: 'nearby',     icon: '📍', label: 'Nearby',      bg: 'linear-gradient(145deg, #0d3328, #081e18)' },
    { id: 'traffic',    icon: '🚦', label: 'Traffic',     bg: 'linear-gradient(145deg, #3d2e1a, #261c0f)' },
    { id: 'transit',    icon: '🚇', label: 'Transit',     bg: 'linear-gradient(145deg, #0d2240, #061830)' },
    { id: 'satellite',  icon: '🛰️', label: 'Satellite',   bg: 'linear-gradient(145deg, #1a1a2e, #0a0a14)' },
    { id: 'street',     icon: '🔭', label: 'Street View', bg: 'linear-gradient(145deg, #2e1040, #1a0828)' },
];

export class MapsApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Maps', id: 'maps', icon: '🗺️' };
        this._recents = [];
        this._favorites = [];
        this._activeTab = 'categories'; // 'categories' | 'actions'
    }

    async init() {
        this.root = el('div', { class: 'app-window app-maps' });
        this._loadData();
        this.render();
    }

    destroy() { super.destroy(); }

    /* ── Data ── */

    _loadData() {
        try { this._recents = this.kernel.storage.load(RECENTS_KEY) || []; } catch { this._recents = []; }
        try { this._favorites = this.kernel.storage.load(FAVORITES_KEY) || []; } catch { this._favorites = []; }
    }

    _saveRecents() { this.kernel.storage.save(RECENTS_KEY, this._recents.slice(0, MAX_RECENTS)); }
    _saveFavorites() { this.kernel.storage.save(FAVORITES_KEY, this._favorites.slice(0, MAX_FAVORITES)); }

    _addRecent(query) {
        const q = query.trim();
        if (!q) return;
        this._recents = [{ query: q, ts: Date.now() }, ...this._recents.filter(r => r.query.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENTS);
        this._saveRecents();
    }

    _removeRecent(query) {
        this._recents = this._recents.filter(r => r.query !== query);
        this._saveRecents();
        this.render();
    }

    _toggleFavorite(query) {
        const q = query.trim();
        if (!q) return;
        const idx = this._favorites.findIndex(f => f.query.toLowerCase() === q.toLowerCase());
        if (idx >= 0) this._favorites.splice(idx, 1);
        else {
            this._favorites.unshift({ query: q, ts: Date.now() });
            if (this._favorites.length > MAX_FAVORITES) this._favorites.length = MAX_FAVORITES;
        }
        this._saveFavorites();
        this.render();
    }

    _isFavorite(query) {
        return this._favorites.some(f => f.query.toLowerCase() === query.trim().toLowerCase());
    }

    _clearRecents() { this._recents = []; this._saveRecents(); this.render(); }

    /* ── Navigation ── */

    _openMaps(query, layer) {
        let url = 'https://www.google.com/maps';
        if (query) { this._addRecent(query); url += '/search/' + encodeURIComponent(query); }
        if (layer) url += '/@?layer=' + layer;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    _handleQuickAction(id) {
        switch (id) {
            case 'directions': this._addRecent('Directions'); window.open('https://www.google.com/maps/dir/', '_blank', 'noopener,noreferrer'); return;
            case 'nearby':
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => window.open(`https://www.google.com/maps/@${pos.coords.latitude},${pos.coords.longitude},15z`, '_blank', 'noopener,noreferrer'),
                        () => this._openMaps('nearby places')
                    );
                } else this._openMaps('nearby places');
                return;
            case 'traffic':   return this._openMaps(null, 'traffic');
            case 'transit':   return this._openMaps(null, 'transit');
            case 'satellite': window.open('https://www.google.com/maps/@0,0,3z/data=!3m1!1e1', '_blank', 'noopener,noreferrer'); return;
            case 'street':    window.open('https://www.google.com/maps/@0,0,3z?layer=streetview', '_blank', 'noopener,noreferrer'); return;
        }
    }

    /* ── Tab switch ── */

    _switchTab(tab) {
        this._activeTab = tab;
        const catPane = this.root.querySelector('.maps-pane--cat');
        const actPane = this.root.querySelector('.maps-pane--act');
        const tabBtns = this.root.querySelectorAll('.maps-tab');
        if (catPane && actPane) {
            catPane.classList.toggle('is-active', tab === 'categories');
            actPane.classList.toggle('is-active', tab === 'actions');
        }
        tabBtns.forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    }

    /* ── Hex builder (matches home screen YancoVerse hex structure) ── */

    _buildHex(icon, label, bg, onclick) {
        const hexIcon = el('div', { class: 'maps-hex-icon' }, [
            el('div', { class: 'maps-hex-ring' }),
            el('div', { class: 'maps-hex-content', style: { background: bg } }, [
                el('span', { class: 'maps-hex-emoji' }, icon),
            ]),
            el('div', { class: 'maps-hex-platform' }),
        ]);
        return el('button', {
            class: 'maps-hex-item', type: 'button',
            onclick,
        }, [
            hexIcon,
            el('span', { class: 'maps-hex-label' }, label),
        ]);
    }

    /* ── Render ── */

    render() {
        this.root.innerHTML = '';

        const scroll = el('div', { class: 'maps-scroll' });

        /* ── Hero ── */
        this._searchInput = el('input', {
            class: 'maps-search-input', type: 'text',
            placeholder: 'Search places, addresses, coordinates...',
            onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const q = this._searchInput.value.trim(); if (q) this._openMaps(q); } },
        });
        const searchBar = el('div', { class: 'maps-search-bar' }, [
            el('span', { class: 'maps-search-icon' }, '🔍'),
            this._searchInput,
            el('button', { class: 'maps-search-go', type: 'button', onclick: () => { const q = this._searchInput.value.trim(); if (q) this._openMaps(q); } }, '→'),
        ]);

        const hero = el('div', { class: 'maps-hero' }, [
            el('div', { class: 'maps-arabesque' }, [
                el('span', { class: 'maps-ornament' }, '✦'),
                el('h2', { class: 'maps-title' }, 'Explore the World'),
                el('span', { class: 'maps-ornament' }, '✦'),
            ]),
            el('p', { class: 'maps-subtitle' }, 'Search any place and open it in Google Maps'),
            searchBar,
        ]);
        scroll.appendChild(hero);

        /* ── Tabs ── */
        const tabBar = el('div', { class: 'maps-tab-bar' }, [
            el('button', { class: `maps-tab ${this._activeTab === 'categories' ? 'is-active' : ''}`, type: 'button', 'data-tab': 'categories', onclick: () => this._switchTab('categories') }, 'Categories'),
            el('button', { class: `maps-tab ${this._activeTab === 'actions' ? 'is-active' : ''}`, type: 'button', 'data-tab': 'actions', onclick: () => this._switchTab('actions') }, 'Quick Actions'),
        ]);
        scroll.appendChild(tabBar);

        /* ── Categories pane (honeycomb) ── */
        const catGrid = el('div', { class: 'maps-honeycomb' });
        CATEGORIES.forEach(cat => catGrid.appendChild(this._buildHex(cat.icon, cat.label, cat.bg, () => this._openMaps(cat.query))));
        const catPane = el('div', { class: `maps-pane maps-pane--cat ${this._activeTab === 'categories' ? 'is-active' : ''}` }, [catGrid]);
        scroll.appendChild(catPane);

        /* ── Quick Actions pane (honeycomb) ── */
        const actGrid = el('div', { class: 'maps-honeycomb maps-honeycomb--sm' });
        QUICK_ACTIONS.forEach(act => actGrid.appendChild(this._buildHex(act.icon, act.label, act.bg, () => this._handleQuickAction(act.id))));
        const actPane = el('div', { class: `maps-pane maps-pane--act ${this._activeTab === 'actions' ? 'is-active' : ''}` }, [actGrid]);
        scroll.appendChild(actPane);

        /* ── Favorites ── */
        if (this._favorites.length) scroll.appendChild(this._buildFavorites());

        /* ── Recents ── */
        if (this._recents.length) scroll.appendChild(this._buildRecents());

        /* ── Footer ── */
        scroll.appendChild(el('div', { class: 'maps-footer' }, [
            el('span', {}, 'Powered by '),
            el('button', { class: 'maps-footer-link', type: 'button', onclick: () => window.open('https://www.google.com/maps', '_blank', 'noopener,noreferrer') }, 'Google Maps'),
        ]));

        this.root.appendChild(scroll);
    }

    _buildFavorites() {
        const list = el('div', { class: 'maps-list' });
        for (const fav of this._favorites) {
            list.appendChild(el('div', { class: 'maps-list-row' }, [
                el('button', { class: 'maps-list-main', type: 'button', onclick: () => this._openMaps(fav.query) }, [
                    el('span', { class: 'maps-list-icon maps-list-icon--fav' }, '★'),
                    el('span', { class: 'maps-list-query' }, fav.query),
                ]),
                el('button', { class: 'maps-list-remove', type: 'button', onclick: () => this._toggleFavorite(fav.query) }, '×'),
            ]));
        }
        return el('section', { class: 'maps-section' }, [el('div', { class: 'maps-section-head' }, 'Saved Places'), list]);
    }

    _buildRecents() {
        const list = el('div', { class: 'maps-list' });
        for (const rec of this._recents) {
            const isFav = this._isFavorite(rec.query);
            list.appendChild(el('div', { class: 'maps-list-row' }, [
                el('button', { class: 'maps-list-main', type: 'button', onclick: () => this._openMaps(rec.query) }, [
                    el('span', { class: 'maps-list-icon' }, '🕐'),
                    el('span', { class: 'maps-list-query' }, rec.query),
                    el('span', { class: 'maps-list-time' }, this._timeAgo(rec.ts)),
                ]),
                el('button', { class: `maps-list-fav ${isFav ? 'is-active' : ''}`, type: 'button', onclick: () => this._toggleFavorite(rec.query) }, '★'),
                el('button', { class: 'maps-list-remove', type: 'button', onclick: () => this._removeRecent(rec.query) }, '×'),
            ]));
        }
        return el('section', { class: 'maps-section' }, [
            el('div', { class: 'maps-section-head' }, [
                el('span', {}, 'Recent Searches'),
                el('button', { class: 'maps-clear-btn', type: 'button', onclick: () => this._clearRecents() }, 'Clear All'),
            ]),
            list,
        ]);
    }

    _timeAgo(ts) {
        const d = Date.now() - ts;
        if (d < 60_000) return 'Just now';
        if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
        if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
        if (d < 604_800_000) return `${Math.floor(d / 86_400_000)}d ago`;
        return new Date(ts).toLocaleDateString();
    }

    // Styles moved to css/maps.css
}
