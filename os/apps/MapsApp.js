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
        try { this._recents = JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; } catch { this._recents = []; }
        try { this._favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; } catch { this._favorites = []; }
    }

    _saveRecents() { localStorage.setItem(RECENTS_KEY, JSON.stringify(this._recents.slice(0, MAX_RECENTS))); }
    _saveFavorites() { localStorage.setItem(FAVORITES_KEY, JSON.stringify(this._favorites.slice(0, MAX_FAVORITES))); }

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
        this._injectStyles();

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

    /* ── Styles ── */

    _injectStyles() {
        this.root.appendChild(el('style', {}, `
/* ═══════════════════════════════════════════
   Maps App — Honeycomb + Arabesque
   ═══════════════════════════════════════════ */
.app-maps {
    background: var(--bg, #060b14);
    color: var(--text-bright, #c8d6e5);
    font-family: var(--font-sans);
    overflow: hidden;
}
.maps-scroll {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    display: flex;
    flex-direction: column;
    padding-bottom: 24px;
}

/* ═══ Hero ═══ */
.maps-hero {
    position: relative;
    padding: 28px 24px 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    flex-shrink: 0;
}
.maps-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
        radial-gradient(ellipse at 50% 0%, rgba(var(--accent-rgb, 0,229,193), 0.13), transparent 55%),
        radial-gradient(ellipse at 80% 90%, rgba(var(--accent-rgb, 0,229,193), 0.04), transparent 40%);
    pointer-events: none;
}

/* ── Arabesque title ── */
.maps-arabesque {
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
}
.maps-ornament {
    font-size: 14px;
    color: var(--accent, #00e5c1);
    opacity: 0.5;
    animation: maps-ornament-pulse 3s ease-in-out infinite alternate;
}
@keyframes maps-ornament-pulse {
    from { opacity: 0.35; transform: scale(0.9); }
    to   { opacity: 0.7; transform: scale(1.1); }
}
.maps-title {
    margin: 0;
    font-size: 26px;
    font-weight: 300;
    font-style: italic;
    color: var(--text-bright, #c8d6e5);
    letter-spacing: 0.08em;
    text-shadow: 0 0 30px rgba(var(--accent-rgb, 0,229,193), 0.15);
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, 'Georgia', 'Times New Roman', serif;
}
.maps-subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim, #3d4f63);
    letter-spacing: 0.02em;
}

/* ═══ Search Bar ═══ */
.maps-search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 440px;
    margin-top: 12px;
    background: rgba(var(--accent-rgb, 0,229,193), 0.04);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(var(--accent-rgb, 0,229,193), 0.12);
    border-radius: var(--radius-pill, 999px);
    padding: 4px 5px 4px 16px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25), inset 0 0.5px 0 rgba(255,255,255,0.08);
    transition: border-color 0.2s, box-shadow 0.2s;
}
.maps-search-bar:focus-within {
    border-color: rgba(var(--accent-rgb, 0,229,193), 0.35);
    box-shadow: 0 2px 12px rgba(0,0,0,0.25), 0 0 24px rgba(var(--accent-rgb, 0,229,193), 0.1);
}
.maps-search-icon { font-size: 13px; opacity: 0.5; flex-shrink: 0; }
.maps-search-input {
    flex: 1; background: none; border: none; outline: none;
    color: var(--text-bright, #c8d6e5);
    font-size: 13px; font-family: inherit;
    padding: 7px 0; min-width: 0;
}
.maps-search-input::placeholder { color: var(--text-dim, #3d4f63); }
.maps-search-go {
    width: 34px; height: 34px; border-radius: 50%; border: none;
    background: var(--accent, #00e5c1);
    color: var(--accent-contrast, #0a0f1a);
    font-size: 16px; font-weight: 700; cursor: pointer;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 2px 8px rgba(var(--accent-rgb, 0,229,193), 0.3);
}
.maps-search-go:hover { transform: scale(1.1); box-shadow: 0 4px 16px rgba(var(--accent-rgb, 0,229,193), 0.4); }
.maps-search-go:active { transform: scale(0.93); }

/* ═══ Tab Bar ═══ */
.maps-tab-bar {
    display: flex;
    justify-content: center;
    gap: 4px;
    padding: 12px 16px 4px;
    flex-shrink: 0;
}
.maps-tab {
    padding: 7px 20px;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid var(--border, rgba(255,255,255,0.06));
    border-radius: var(--radius-pill, 999px);
    background: transparent;
    color: var(--text-dim, #3d4f63);
    cursor: pointer;
    transition: all 0.2s;
}
.maps-tab:hover {
    color: var(--text, #8a9bb0);
    border-color: rgba(var(--accent-rgb, 0,229,193), 0.15);
}
.maps-tab.is-active {
    background: rgba(var(--accent-rgb, 0,229,193), 0.1);
    border-color: rgba(var(--accent-rgb, 0,229,193), 0.3);
    color: var(--accent, #00e5c1);
    box-shadow: 0 0 12px rgba(var(--accent-rgb, 0,229,193), 0.1);
}

/* ═══ Panes (tab content) ═══ */
.maps-pane {
    display: none;
    padding: 8px 0;
    animation: maps-pane-in 0.3s ease;
}
.maps-pane.is-active { display: block; }
@keyframes maps-pane-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ═══ Honeycomb Grid ═══ */
.maps-honeycomb {
    --h-size: 62px;
    --h-gap: 12px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--h-gap) 6px;
    padding: 8px 16px 4px;
}

/* Stagger every other row */
.maps-hex-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    background: none;
    border: none;
    color: inherit;
    font-family: inherit;
    padding: 0;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    width: calc(var(--h-size) + 16px);
}
.maps-hex-item:hover { transform: translateY(-6px) scale(1.08); }
.maps-hex-item:active { transform: scale(0.95); }

/* ── Hex icon — mirrors home screen YancoVerse structure ── */
.maps-hex-icon {
    width: var(--h-size);
    height: var(--h-size);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Outer bloom glow */
.maps-hex-icon::before {
    content: '';
    position: absolute;
    inset: -5px;
    clip-path: var(--hex-clip, polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%));
    background: linear-gradient(135deg,
        rgba(var(--accent-rgb, 0,229,193), 0.8),
        rgba(var(--accent-rgb, 0,229,193), 0.3) 30%,
        rgba(var(--accent-rgb, 0,229,193), 0.5) 70%,
        rgba(var(--accent-rgb, 0,229,193), 0.7));
    opacity: 0.5;
    filter: blur(1px);
    transition: all 0.35s;
}
.maps-hex-item:hover .maps-hex-icon::before {
    opacity: 0.9;
    filter: blur(0.5px);
    inset: -6px;
}

/* Glass reflection overlay */
.maps-hex-icon::after {
    content: '';
    position: absolute;
    inset: 0;
    clip-path: var(--hex-clip, polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%));
    background: var(--yv-glass, linear-gradient(165deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 30%, transparent 50%));
    pointer-events: none;
    z-index: 4;
}

/* Inner ring */
.maps-hex-ring {
    position: absolute;
    inset: -3px;
    clip-path: var(--hex-clip, polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%));
    background: linear-gradient(160deg,
        rgba(var(--accent-rgb, 0,229,193), 0.9),
        rgba(var(--accent-rgb, 0,229,193), 0.35) 50%,
        rgba(var(--accent-rgb, 0,229,193), 0.7));
    z-index: 1;
    transition: all 0.35s;
}
.maps-hex-item:hover .maps-hex-ring {
    background: linear-gradient(160deg,
        rgba(var(--accent-rgb, 0,229,193), 1),
        rgba(var(--accent-rgb, 0,229,193), 0.5) 50%,
        rgba(var(--accent-rgb, 0,229,193), 0.9));
}

/* Content face */
.maps-hex-content {
    width: 100%;
    height: 100%;
    clip-path: var(--hex-clip, polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%));
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
}
/* Inner edge glow */
.maps-hex-content::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--yv-edge-glow,
        radial-gradient(ellipse at 50% 0%, rgba(var(--accent-rgb, 0,229,193), 0.12), transparent 50%),
        radial-gradient(ellipse at 50% 100%, rgba(var(--accent-rgb, 0,229,193), 0.08), transparent 50%));
    pointer-events: none;
    z-index: 1;
}

.maps-hex-emoji { font-size: 24px; position: relative; z-index: 2; }

/* Floating platform shadow */
.maps-hex-platform {
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 50px;
    height: 8px;
    background: var(--yv-platform, radial-gradient(ellipse, rgba(var(--accent-rgb, 0,229,193), 0.18), transparent 70%));
    filter: blur(4px);
    transition: all 0.35s;
    pointer-events: none;
    z-index: 0;
}
.maps-hex-item:hover .maps-hex-platform {
    width: 60px;
    height: 10px;
    background: var(--yv-platform-hover, radial-gradient(ellipse, rgba(var(--accent-rgb, 0,229,193), 0.32), transparent 70%));
    bottom: -14px;
}

/* Label */
.maps-hex-label {
    font-size: 10px;
    font-weight: 500;
    color: rgba(var(--ui-text-rgb, 200,220,240), 0.5);
    text-align: center;
    max-width: calc(var(--h-size) + 16px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow: 0 1px 6px rgba(0,0,0,0.9);
}

/* ═══ Sections ═══ */
.maps-section { padding: 0 16px; }
.maps-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-dim, #3d4f63);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 14px 4px 8px;
}

/* ═══ List (Recents & Favorites) ═══ */
.maps-list { display: flex; flex-direction: column; gap: 1px; }
.maps-list-row {
    display: flex; align-items: center; gap: 4px;
    border-radius: var(--radius-sm, 6px);
    transition: background 0.15s;
}
.maps-list-row:hover { background: rgba(var(--accent-rgb, 0,229,193), 0.04); }
.maps-list-main {
    flex: 1; display: flex; align-items: center; gap: 10px;
    padding: 9px 8px; background: none; border: none;
    cursor: pointer; color: inherit; font-family: inherit;
    font-size: 13px; text-align: left; min-width: 0;
}
.maps-list-main:hover .maps-list-query { color: var(--accent, #00e5c1); }
.maps-list-icon { font-size: 13px; opacity: 0.45; flex-shrink: 0; }
.maps-list-icon--fav { color: var(--warning, #ffa502); opacity: 1; }
.maps-list-query {
    color: var(--text-bright, #c8d6e5);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    min-width: 0; transition: color 0.15s;
}
.maps-list-time {
    font-size: 10px; color: var(--text-dim, #3d4f63);
    margin-left: auto; flex-shrink: 0; padding-right: 4px;
}
.maps-list-fav,
.maps-list-remove {
    width: 26px; height: 26px; border: none; background: none;
    cursor: pointer; border-radius: var(--radius-xs, 4px);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; color: var(--text-dim, #3d4f63);
    transition: all 0.15s; flex-shrink: 0; opacity: 0;
}
.maps-list-row:hover .maps-list-fav,
.maps-list-row:hover .maps-list-remove { opacity: 1; }
.maps-list-fav:hover { color: var(--warning, #ffa502); background: rgba(255,165,2,0.1); }
.maps-list-fav.is-active { color: var(--warning, #ffa502); opacity: 1; }
.maps-list-remove:hover { color: var(--danger, #ff4757); background: rgba(255,71,87,0.1); }
.maps-clear-btn {
    background: none; border: none;
    color: var(--text-dim, #3d4f63);
    font-size: 10px; cursor: pointer;
    padding: 3px 6px; border-radius: var(--radius-xs, 4px);
    font-family: inherit; transition: color 0.15s;
}
.maps-clear-btn:hover { color: var(--danger, #ff4757); }

/* ═══ Footer ═══ */
.maps-footer {
    display: flex; align-items: center; justify-content: center;
    gap: 4px; padding: 16px 16px 8px; font-size: 10px;
    color: var(--text-dim, #3d4f63);
}
.maps-footer-link {
    background: none; border: none;
    color: var(--accent, #00e5c1);
    font-size: inherit; font-family: inherit;
    cursor: pointer; padding: 0; opacity: 0.6;
    transition: opacity 0.15s;
}
.maps-footer-link:hover { opacity: 1; text-decoration: underline; }

/* ═══ Light Mode ═══ */
.light-mode .app-maps,
[data-theme="light"] .app-maps { background: #f4f6f8; color: #1a1a2e; }
.light-mode .maps-search-bar,
[data-theme="light"] .maps-search-bar {
    background: rgba(255,255,255,0.8);
    border-color: rgba(0,0,0,0.08);
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
.light-mode .maps-search-input,
[data-theme="light"] .maps-search-input { color: #1a1a2e; }
.light-mode .maps-title,
[data-theme="light"] .maps-title { color: #1a1a2e; text-shadow: none; }
.light-mode .maps-tab,
[data-theme="light"] .maps-tab { border-color: rgba(0,0,0,0.08); }
.light-mode .maps-tab.is-active,
[data-theme="light"] .maps-tab.is-active { background: rgba(var(--accent-rgb),0.08); }
.light-mode .maps-hex-label,
[data-theme="light"] .maps-hex-label { color: #555; text-shadow: none; }
.light-mode .maps-list-query,
[data-theme="light"] .maps-list-query { color: #1a1a2e; }
        `));
    }
}
