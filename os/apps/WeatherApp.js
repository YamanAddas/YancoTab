import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

export class WeatherApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Weather', id: 'weather', icon: '🌤️' };
        this.weatherService = this.kernel?.getService?.('weather') || null;
        this.state = this.loadState();
        this.recentSearches = this.loadRecentSearches();
        this.searchTimer = null;
        this.refreshTimer = null;
        this.currentResults = [];
        this.renderToken = 0;
        this.lastPayload = null;
        this.lastPayloadQuery = '';
        this.lastSuccessAt = 0;
        this.lastFailureAt = 0;
        this.lastFailureReason = '';
        this.onDocClick = null;
        this.exitStateApplied = false;
        this.onVisibilityChange = null;
        this.onWindowFocus = null;
        this.weatherShiftTimer = null;
        this.liveRefreshMins = 2;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-weather' });
        this.root.appendChild(this.buildLayout());
        this.bindSearchDismiss();
        await this.ensureStartupLocation();
        this.renderLocations();
        await this.refreshWeather({ withLoading: true });
        this.bindLiveRefreshEvents();
        this.startAutoRefresh();

        // Listen for external unit changes
        // Listen for external unit changes
        this.onWeatherChange = () => {
            const newState = this.loadState();
            // preserve location, update unit
            this.state.unit = newState.unit;
            this.toggleUnitDisplayOnly(); // Helper to just update UI
            this.refreshWeather({ withLoading: false });
        };
        window.addEventListener('yancotab:weatherchange', this.onWeatherChange);
    }

    destroy() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        if (this.searchTimer) clearTimeout(this.searchTimer);
        if (this.weatherShiftTimer) clearTimeout(this.weatherShiftTimer);

        if (this.onDocClick) document.removeEventListener('click', this.onDocClick);
        if (this.onVisibilityChange) document.removeEventListener('visibilitychange', this.onVisibilityChange);
        if (this.onWindowFocus) window.removeEventListener('focus', this.onWindowFocus);
        if (this.onWeatherChange) window.removeEventListener('yancotab:weatherchange', this.onWeatherChange);

        super.destroy();
    }


    toggleUnitDisplayOnly() {
        if (this.unitBtn) this.unitBtn.textContent = this.state.unit === 'f' ? '°F' : '°C';
    }

    buildLayout() {
        this.shell = el('div', { class: 'weather-shell' });

        this.title = el('div', { class: 'weather-heading' }, 'Weather');
        const closeBtn = el('button', { class: 'weather-close weather-close-bubble', type: 'button', onclick: () => this.close() }, '×');
        this.unitBtn = el('button', { class: 'weather-chip-btn weather-btn-unit', type: 'button', onclick: () => this.toggleUnit() }, this.state.unit === 'f' ? '°F' : '°C');
        const refreshBtn = el('button', { class: 'weather-chip-btn weather-btn-refresh', type: 'button', onclick: () => this.refreshWeather({ withLoading: false }) }, 'Refresh');
        const locateBtn = el('button', { class: 'weather-chip-btn weather-locate-btn weather-btn-locate', type: 'button', onclick: () => this.useCurrentLocation(), title: 'Use current location' }, '◎');

        this.searchInput = el('input', {
            class: 'weather-search-input',
            type: 'text',
            placeholder: 'Search city or place...',
            oninput: (e) => this.queueSearch(e.target.value),
            onkeyup: (e) => this.onSearchKey(e),
            onfocus: () => this.onSearchFocus()
        });
        this.suggestBox = el('div', { class: 'weather-suggestions' });
        const searchWrap = el('div', { class: 'weather-search-wrap weather-btn-search' }, [this.searchInput, this.suggestBox]);

        const controlsRow = el('div', { class: 'weather-controls-row' }, [
            searchWrap,
            el('div', { class: 'weather-actions-group' }, [this.unitBtn, refreshBtn, locateBtn])
        ]);

        const topbar = el('div', { class: 'weather-topbar' }, [
            el('div', { class: 'weather-head-left' }), // Empty for balance or back button later
            this.title,
            el('div', { class: 'weather-head-right' }, [closeBtn])
        ]);

        this.hero = el('section', { class: 'weather-hero-card' }, [
            el('div', { class: 'weather-hero-main' }, [
                this.cityEl = el('div', { class: 'weather-city' }, '—'),
                this.tempEl = el('div', { class: 'weather-temp' }, '--°'),
                this.condEl = el('div', { class: 'weather-condition' }, '—'),
                this.rangeEl = el('div', { class: 'weather-range' }, 'H: —  L: —'),
                this.metaRow = el('div', { class: 'weather-meta-row' }, [
                    this.metaEl = el('div', { class: 'weather-meta' }, 'Loading...'),
                    this.statusEl = el('div', { class: 'weather-status is-hidden' }, '')
                ])
            ]),
            this.heroIcon = el('div', { class: 'weather-hero-icon' })
        ]);

        this.hourlyList = el('div', { class: 'weather-hourly' });
        const hourlyCard = el('section', { class: 'weather-card' }, [
            el('div', { class: 'weather-card-title' }, 'Next 12 Hours'),
            this.hourlyList
        ]);

        this.dailyList = el('div', { class: 'weather-daily' });
        const dailyCard = el('section', { class: 'weather-card' }, [
            el('div', { class: 'weather-card-title' }, '7-Day Forecast'),
            this.dailyList
        ]);

        this.detailGrid = el('div', { class: 'weather-detail-grid' });
        const detailCard = el('section', { class: 'weather-card' }, [
            el('div', { class: 'weather-card-title' }, 'Details'),
            this.detailGrid
        ]);

        this.locationList = el('div', { class: 'weather-location-list' });
        const locationsCard = el('section', { class: 'weather-card' }, [
            el('div', { class: 'weather-card-title' }, 'Saved Locations'),
            this.locationList
        ]);

        this.airMain = el('div', { class: 'weather-air-main' }, '—');
        this.airMetrics = el('div', { class: 'weather-air-metrics' });
        const airCard = el('section', { class: 'weather-card' }, [
            el('div', { class: 'weather-card-title' }, 'Air Quality'),
            this.airMain,
            this.airMetrics
        ]);

        this.alertsList = el('div', { class: 'weather-alerts' });
        const alertsCard = el('section', { class: 'weather-card' }, [
            el('div', { class: 'weather-card-title' }, 'Alerts'),
            this.alertsList
        ]);

        this.leftCol = el('div', { class: 'weather-column weather-column-main' }, [
            controlsRow,
            this.hero,
            hourlyCard,
            dailyCard,
            detailCard
        ]);

        this.rightCol = el('div', { class: 'weather-column weather-column-side' }, [
            locationsCard,
            airCard,
            alertsCard
        ]);

        this.content = el('div', { class: 'weather-content' }, [this.leftCol, this.rightCol]);
        this.footer = el('div', { class: 'weather-footer' }, 'Data: Open-Meteo / NWS');
        this.shell.append(topbar, this.content, this.footer);
        return this.shell;
    }

    loadState() {
        if (this.weatherService?.getState) {
            const state = this.weatherService.getState();
            const withLegacy = this.seedLegacyLocation(state);
            return this.weatherService.normalizeState ? this.weatherService.normalizeState(withLegacy) : withLegacy;
        }
        const raw = localStorage.getItem('yancotab_weather_v1');
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                return {
                    unit: parsed.unit === 'fahrenheit' ? 'f' : 'c',
                    locations: [{
                        id: `weather-${Date.now()}`,
                        label: parsed.city || 'New York',
                        query: parsed.city || 'New York',
                        lat: parsed.lat || 40.71,
                        lon: parsed.lon || -74.01
                    }],
                    currentLocation: {
                        id: `weather-${Date.now()}-current`,
                        label: parsed.city || 'New York',
                        query: parsed.city || 'New York',
                        lat: parsed.lat || 40.71,
                        lon: parsed.lon || -74.01
                    },
                    effectsEnabled: true,
                    refreshMins: 15
                };
            } catch (_) { /* ignore */ }
        }
        return {
            unit: 'f',
            locations: [],
            currentLocation: null,
            effectsEnabled: true,
            refreshMins: 15
        };
    }

    seedLegacyLocation(state) {
        const next = { ...(state || {}) };
        next.locations = Array.isArray(next.locations) ? next.locations : [];
        if (next.currentLocation && next.currentLocation.query) return next;
        try {
            const legacy = JSON.parse(localStorage.getItem('yancotab_weather_v1') || 'null');
            if (legacy && legacy.city) {
                const loc = {
                    id: `weather-legacy-${Date.now()}`,
                    label: legacy.city,
                    query: legacy.city,
                    lat: legacy.lat || null,
                    lon: legacy.lon || null
                };
                if (!next.locations.some((i) => (i.query || '').toLowerCase() === loc.query.toLowerCase())) {
                    next.locations.unshift(loc);
                }
                next.currentLocation = loc;
            }
        } catch (_) { /* ignore */ }
        return next;
    }

    loadRecentSearches() {
        try {
            const raw = JSON.parse(localStorage.getItem('yancotabWeatherRecentSearchesV1') || '[]');
            if (!Array.isArray(raw)) return [];
            const seen = new Set();
            return raw
                .map((item) => ({
                    label: String(item?.label || item?.query || '').trim(),
                    query: String(item?.query || item?.label || '').trim(),
                    lat: item?.lat ?? null,
                    lon: item?.lon ?? null,
                    timezone: item?.timezone || null,
                    ts: Number(item?.ts) || Date.now()
                }))
                .filter((item) => {
                    const key = (item.query || item.label).toLowerCase();
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                })
                .slice(0, 8);
        } catch (_) {
            return [];
        }
    }

    saveRecentSearches() {
        try {
            localStorage.setItem('yancotabWeatherRecentSearchesV1', JSON.stringify((this.recentSearches || []).slice(0, 8)));
        } catch (_) { /* ignore */ }
    }

    addRecentSearch(item) {
        if (!item) return;
        const label = String(item.label || item.query || '').trim();
        const query = String(item.query || item.label || '').trim();
        if (!label || !query) return;
        if (query.includes(',') && Number.isFinite(Number(query.split(',')[0]))) return;
        const key = query.toLowerCase();
        const list = Array.isArray(this.recentSearches) ? [...this.recentSearches] : [];
        const next = [{ label, query, lat: item.lat ?? null, lon: item.lon ?? null, timezone: item.timezone || null, ts: Date.now() }];
        list.forEach((entry) => {
            const entryKey = String(entry.query || '').toLowerCase();
            if (entryKey && entryKey !== key) next.push(entry);
        });
        this.recentSearches = next.slice(0, 8);
        this.saveRecentSearches();
    }

    setStatus(type, text) {
        if (!this.statusEl) return;
        const clean = String(text || '').trim();
        if (!clean) {
            this.statusEl.textContent = '';
            this.statusEl.classList.add('is-hidden');
            this.statusEl.dataset.type = '';
            return;
        }
        this.statusEl.textContent = clean;
        this.statusEl.classList.remove('is-hidden');
        this.statusEl.dataset.type = type || 'info';
    }

    formatRelativeUpdate(updatedAt) {
        const ts = Number(updatedAt) || 0;
        if (!ts) return 'Updated recently';
        const diff = Math.max(0, Date.now() - ts);
        const mins = Math.round(diff / 60000);
        if (mins <= 0) return 'Updated now';
        if (mins < 60) return `Updated ${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        const rem = mins % 60;
        return rem ? `Updated ${hrs}h ${rem}m ago` : `Updated ${hrs}h ago`;
    }

    saveState() {
        if (this.weatherService?.saveState) {
            this.weatherService.saveState(this.state);
            return;
        }
        const current = this.state.currentLocation || this.state.locations[0];
        if (!current) return;
        localStorage.setItem('yancotab_weather_v1', JSON.stringify({
            city: current.label,
            lat: current.lat,
            lon: current.lon,
            unit: this.state.unit === 'f' ? 'fahrenheit' : 'celsius'
        }));
    }

    startAutoRefresh() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => this.refreshWeather({ withLoading: false }), this.liveRefreshMins * 60 * 1000);
    }

    bindLiveRefreshEvents() {
        this.onVisibilityChange = () => {
            if (document.visibilityState === 'visible') this.refreshWeather({ withLoading: false });
        };
        this.onWindowFocus = () => this.refreshWeather({ withLoading: false });
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        window.addEventListener('focus', this.onWindowFocus);
    }

    getClockPrefs() {
        const parse = (key) => {
            try {
                return JSON.parse(localStorage.getItem(key) || 'null');
            } catch (_) { return null; }
        };
        const v2 = parse('yancotab_clock_v2');
        if (v2 && typeof v2.use24h === 'boolean') return { use24h: v2.use24h };
        const v1 = parse('yancotabClockState');
        if (v1 && typeof v1.use24h === 'boolean') return { use24h: v1.use24h };
        return { use24h: false };
    }

    svgNode(svg) {
        const holder = document.createElement('div');
        holder.innerHTML = String(svg || '').trim();
        return holder.firstElementChild || document.createElement('span');
    }

    formatHourLabel(iso, use24h) {
        if (!iso) return '--';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: !use24h });
    }

    formatTimeLabel(iso, use24h) {
        if (!iso) return '--';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: !use24h });
    }

    formatDayLabel(dateStr) {
        if (!dateStr) return '--';
        const date = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    }

    queueSearch(term) {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.searchLocations(term), 220);
    }

    onSearchFocus() {
        const term = this.searchInput?.value?.trim() || '';
        if (term.length >= 2) return;
        this.renderSuggestions(this.recentSearches, { recent: true });
    }

    renderSuggestions(items, { recent = false } = {}) {
        this.currentResults = [];
        this.suggestBox.innerHTML = '';
        this.suggestBox.classList.remove('is-open');
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return;
        list.forEach((item) => {
            const btn = el('button', { class: 'weather-suggestion', type: 'button' }, [
                el('span', { class: 'weather-suggestion-label' }, item.label || item.query || 'Unknown'),
                recent ? el('span', { class: 'weather-suggestion-tag' }, 'Recent') : null
            ].filter(Boolean));
            btn.addEventListener('click', () => {
                this.applyLocation(item);
                this.searchInput.value = '';
                this.suggestBox.innerHTML = '';
                this.suggestBox.classList.remove('is-open');
            });
            this.suggestBox.appendChild(btn);
            this.currentResults.push(item);
        });
        this.suggestBox.classList.add('is-open');
    }

    async searchLocations(term) {
        const query = term.trim();
        if (query.length < 2) {
            this.renderSuggestions(this.recentSearches, { recent: true });
            return;
        }
        if (!this.weatherService?.searchLocations) return;
        const results = await this.weatherService.searchLocations(query);
        this.renderSuggestions(results, { recent: false });
    }

    onSearchKey(event) {
        if (event.key !== 'Enter') return;
        const term = this.searchInput.value.trim();
        if (!term) return;
        const exact = this.currentResults.find((r) => (r.label || '').toLowerCase() === term.toLowerCase());
        this.applyLocation(exact || this.currentResults[0] || { label: term, query: term });
        this.searchInput.value = '';
        this.suggestBox.innerHTML = '';
        this.suggestBox.classList.remove('is-open');
    }

    bindSearchDismiss() {
        this.onDocClick = (event) => {
            if (!this.root?.contains(event.target)) return;
            const wrap = this.searchInput?.closest('.weather-search-wrap');
            if (!wrap || wrap.contains(event.target)) return;
            this.suggestBox.classList.remove('is-open');
            this.suggestBox.innerHTML = '';
        };
        document.addEventListener('click', this.onDocClick);
    }

    hasCurrentLocation() {
        return Boolean(this.state?.currentLocation && (this.state.currentLocation.query || this.state.currentLocation.label));
    }

    getStoredCoordsLocation() {
        const latRaw = localStorage.getItem('yancotabLat');
        const lonRaw = localStorage.getItem('yancotabLon');
        const lat = Number(latRaw);
        const lon = Number(lonRaw);
        const label = localStorage.getItem('yancotabCityManual') || localStorage.getItem('yancotabCityAuto') || 'Current Location';
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return { id: 'weather-auto-current', label, query: `${lat},${lon}`, lat, lon, isAuto: true };
        }
        if (label && label !== 'Current Location') {
            return { id: 'weather-auto-current', label, query: label, lat: null, lon: null, isAuto: true };
        }
        return null;
    }

    async ensureStartupLocation() {
        if (this.hasCurrentLocation()) return;
        const locations = Array.isArray(this.state.locations) ? this.state.locations : [];
        const auto = locations.find((loc) => loc?.isAuto || loc?.id === 'weather-auto-current');
        if (auto) {
            this.state.currentLocation = auto;
            this.saveState();
            return;
        }
        if (locations.length) {
            this.state.currentLocation = locations[0];
            this.saveState();
            return;
        }
        const stored = this.getStoredCoordsLocation();
        if (stored) {
            this.setPrimaryLocation(stored, { refresh: false, emitChange: false });
            return;
        }
        await this.useCurrentLocation({ silent: true, refresh: false, emitChange: false });
    }

    normalizeLocation(item) {
        if (!item) return null;
        const label = item.label || item.query || 'Unknown';
        const query = item.query || item.label || '';
        return {
            id: item.id || `weather-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label,
            query,
            lat: item.lat ?? null,
            lon: item.lon ?? null,
            isAuto: item.isAuto === true
        };
    }

    applyLocation(item) {
        const ok = this.setPrimaryLocation(item, { refresh: true, emitChange: true, setCurrent: true });
        if (ok) this.addRecentSearch(item);
    }

    setPrimaryLocation(item, { refresh = true, emitChange = true, setCurrent = true } = {}) {
        const normalized = this.normalizeLocation(item);
        if (!normalized || !normalized.query) return false;
        const locations = Array.isArray(this.state.locations) ? [...this.state.locations] : [];
        const key = normalized.query.toLowerCase();
        let idx = locations.findIndex((loc) => (loc.query || '').toLowerCase() === key);
        if (normalized.isAuto) {
            const autoIndex = locations.findIndex((loc) => loc.isAuto);
            if (autoIndex >= 0) idx = autoIndex;
        }
        if (idx >= 0) {
            locations[idx] = { ...locations[idx], ...normalized };
        } else {
            locations.unshift(normalized);
        }
        this.state.locations = locations;
        if (setCurrent) {
            this.state.currentLocation = idx >= 0 ? locations[idx] : normalized;
        } else if (this.state.currentLocation?.query?.toLowerCase() === key) {
            this.state.currentLocation = idx >= 0 ? locations[idx] : normalized;
        }
        this.saveState();
        if (emitChange) window.dispatchEvent(new CustomEvent('yancotab:weatherchange'));
        this.renderLocations();
        if (refresh) this.refreshWeather({ withLoading: true });
        return true;
    }

    removeLocation(id) {
        const target = (this.state.locations || []).find((loc) => loc.id === id);
        if (target?.isAuto) {
            this.notify('Current location stays as default');
            return;
        }
        this.state.locations = (this.state.locations || []).filter((loc) => loc.id !== id);
        if (this.state.currentLocation?.id === id) {
            this.state.currentLocation = this.state.locations.find((loc) => loc.isAuto) || this.state.locations[0] || null;
        }
        if (!this.state.currentLocation && this.state.locations.length) {
            this.state.currentLocation = this.state.locations.find((loc) => loc.isAuto) || this.state.locations[0];
        }
        this.saveState();
        window.dispatchEvent(new CustomEvent('yancotab:weatherchange'));
        this.renderLocations();
        if (!this.state.currentLocation) {
            this.ensureStartupLocation().then(() => {
                this.renderLocations();
                this.refreshWeather({ withLoading: true });
            });
            return;
        }
        this.refreshWeather({ withLoading: true });
    }

    renderLocations() {
        this.locationList.innerHTML = '';
        const locations = Array.isArray(this.state.locations) ? this.state.locations : [];
        if (!locations.length) {
            this.locationList.appendChild(el('div', { class: 'weather-location-empty' }, 'Search for a city to start.'));
            return;
        }
        const currentQuery = (this.state.currentLocation?.query || '').toLowerCase();
        locations.forEach((loc) => {
            const active = currentQuery && (loc.query || '').toLowerCase() === currentQuery;
            const selectBtn = el('button', {
                class: `weather-location-btn ${active ? 'is-active' : ''}`,
                type: 'button',
                onclick: () => {
                    this.state.currentLocation = loc;
                    this.saveState();
                    this.renderLocations();
                    this.refreshWeather({ withLoading: true });
                }
            }, [
                el('span', { class: 'weather-location-name' }, loc.label || 'Unknown'),
                active
                    ? el('span', { class: 'weather-location-badge' }, loc.isAuto ? 'Auto' : 'Active')
                    : loc.isAuto
                        ? el('span', { class: 'weather-location-badge' }, 'Auto')
                        : null
            ].filter(Boolean));
            const row = el('div', { class: 'weather-location-row' }, [selectBtn]);
            if (!loc.isAuto) {
                const removeBtn = el('button', {
                    class: 'weather-location-remove',
                    type: 'button',
                    onclick: () => this.removeLocation(loc.id)
                }, '×');
                row.appendChild(removeBtn);
            }
            this.locationList.appendChild(row);
        });
    }

    toggleUnit() {
        this.state.unit = this.state.unit === 'f' ? 'c' : 'f';
        this.unitBtn.textContent = this.state.unit === 'f' ? '°F' : '°C';
        this.saveState();
        window.dispatchEvent(new CustomEvent('yancotab:weatherchange'));
        if (this.lastPayload) {
            this.renderPayload(this.lastPayload, {
                stale: Boolean(this.lastFailureReason),
                statusMessage: this.lastFailureReason ? `Live update failed. Showing saved data (${this.formatRelativeUpdate(this.lastSuccessAt)}).` : ''
            });
        }
    }

    async useCurrentLocation(options = {}) {
        const { silent = false, refresh = true, emitChange = true } = options;
        const fallbackAuto = this.getStoredCoordsLocation();
        const fallbackStateAuto = (this.state.locations || []).find((loc) => loc?.isAuto || loc?.id === 'weather-auto-current') || null;
        const fallbackCurrent = this.state.currentLocation || null;
        if (!navigator.geolocation) {
            const fallback = fallbackAuto || fallbackStateAuto || fallbackCurrent;
            if (fallback) {
                if (!silent) this.notify('GPS unsupported. Using saved location.');
                return this.setPrimaryLocation(fallback, { refresh, emitChange, setCurrent: true });
            }
            if (!silent) this.notify('Location is not supported on this device');
            return false;
        }
        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const lat = Number(pos.coords.latitude);
                const lon = Number(pos.coords.longitude);
                let label = 'Current Location';
                if (this.weatherService?.reverseGeocode) {
                    const reverse = await this.weatherService.reverseGeocode(lat, lon);
                    if (reverse) label = reverse;
                }
                const autoEntry = { id: 'weather-auto-current', label, query: `${lat},${lon}`, lat, lon, isAuto: true };
                const ok = this.setPrimaryLocation(autoEntry, { refresh, emitChange, setCurrent: true });
                if (!silent) this.notify(`Using current location: ${label}`);
                resolve(ok);
            }, (error) => {
                const fallback = fallbackAuto || fallbackStateAuto || fallbackCurrent;
                if (fallback) {
                    const ok = this.setPrimaryLocation(fallback, { refresh, emitChange, setCurrent: true });
                    if (!silent) this.notify(this.getLocationErrorMessage(error, true));
                    resolve(ok);
                    return;
                }
                if (!silent) this.notify(this.getLocationErrorMessage(error, false));
                resolve(false);
            }, { enableHighAccuracy: true, timeout: 12000 });
        });
    }

    getLocationErrorMessage(error, usedFallback) {
        const insecureHint = !window.isSecureContext ? ' Secure URL is required for GPS.' : '';
        const suffix = usedFallback ? ' Using saved location.' : '';
        if (!error) return `Could not get location.${suffix}${insecureHint}`.trim();
        if (error.code === 1) return `Location permission denied.${suffix}${insecureHint}`.trim();
        if (error.code === 2) return `Location unavailable.${suffix}${insecureHint}`.trim();
        if (error.code === 3) return `Location request timed out.${suffix}${insecureHint}`.trim();
        return `Could not get location.${suffix}${insecureHint}`.trim();
    }

    setLoading(loading) {
        this.content.classList.toggle('is-loading', loading);
        if (loading) this.metaEl.textContent = 'Updating...';
    }

    async refreshWeather({ withLoading = false } = {}) {
        let location = this.state.currentLocation || (this.state.locations || [])[0];
        if (!location) {
            await this.ensureStartupLocation();
            location = this.state.currentLocation || (this.state.locations || [])[0];
        }
        if (!location) {
            this.renderEmpty('Search for a city to load weather.');
            return;
        }
        if (!this.weatherService?.getForecastForLocation) {
            this.renderEmpty('Weather service unavailable.');
            return;
        }
        const locationKey = (location.query || location.label || '').toLowerCase();
        if (withLoading) this.setLoading(true);
        const token = ++this.renderToken;
        const queryState = { ...this.state, refreshMins: this.liveRefreshMins };
        let forecastResult = null;
        let airResult = null;
        let alertsResult = null;
        let requestError = null;
        try {
            const results = await Promise.all([
                this.weatherService.getForecastForLocation(location, queryState),
                this.weatherService.getAirQualityForLocation ? this.weatherService.getAirQualityForLocation(location, queryState) : Promise.resolve(null),
                this.weatherService.getAlertsForLocation ? this.weatherService.getAlertsForLocation(location, queryState) : Promise.resolve(null)
            ]);
            [forecastResult, airResult, alertsResult] = results;
        } catch (error) {
            requestError = error;
        } finally {
            if (token === this.renderToken) this.setLoading(false);
        }
        if (token !== this.renderToken) return;

        const freshForecast = forecastResult?.forecast || null;
        if (freshForecast) {
            const payload = {
                locationLabel: forecastResult?.label || location.label || location.query || 'Unknown',
                forecast: freshForecast,
                air: airResult?.airQuality || null,
                alerts: alertsResult?.alerts || null
            };
            this.lastPayload = payload;
            this.lastPayloadQuery = locationKey;
            this.lastSuccessAt = Number(freshForecast.updatedAt) || Date.now();
            this.lastFailureReason = '';
            this.renderPayload(payload, { stale: false, statusMessage: '' });
            return;
        }

        this.lastFailureAt = Date.now();
        this.lastFailureReason = requestError?.message || 'Live weather update failed';
        if (this.lastPayload?.forecast && this.lastPayloadQuery === locationKey) {
            this.renderPayload(this.lastPayload, {
                stale: true,
                statusMessage: `Live update failed. Showing saved data (${this.formatRelativeUpdate(this.lastSuccessAt)}).`
            });
            return;
        }
        this.renderEmpty('Could not load weather right now. Check connection and retry.');
    }

    renderEmpty(message) {
        this.cityEl.textContent = 'Weather';
        this.tempEl.textContent = '--°';
        this.condEl.textContent = 'Unavailable';
        this.rangeEl.textContent = 'H: —  L: —';
        this.metaEl.textContent = message || 'No data';
        this.heroIcon.innerHTML = '';
        this.hourlyList.innerHTML = '';
        this.hourlyList.appendChild(el('div', { class: 'weather-empty-state' }, 'Search for a city to load hourly forecast.'));
        this.dailyList.innerHTML = '';
        this.dailyList.appendChild(el('div', { class: 'weather-empty-state' }, 'Daily forecast will appear here.'));
        this.detailGrid.innerHTML = '';
        this.detailGrid.appendChild(el('div', { class: 'weather-empty-state' }, 'Weather details will appear here.'));
        this.airMain.textContent = '—';
        this.airMetrics.innerHTML = '';
        this.airMetrics.appendChild(el('div', { class: 'weather-empty-state' }, 'Air quality data will appear here.'));
        this.alertsList.innerHTML = '';
        this.alertsList.appendChild(el('div', { class: 'weather-alert-empty' }, 'No alerts to show.'));
        this.setStatus('warn', message || '');
        this.applyBackgroundState({ mood: 'clear', phase: this.getDayPhase(null, null) });
    }

    renderPayload(payload, options = {}) {
        if (!payload?.forecast) {
            this.renderEmpty('No forecast available for this location.');
            return;
        }
        const stale = options?.stale === true;
        const statusMessage = String(options?.statusMessage || '').trim();
        const state = this.state;
        const unit = state.unit || 'c';
        const use24h = this.getClockPrefs().use24h;
        const forecast = payload.forecast;
        const current = forecast.current || {};
        const hourly = forecast.hourly || {};
        const daily = forecast.daily || {};
        const currentCode = current.weathercode ?? hourly.weathercode?.[0] ?? daily.weathercode?.[0] ?? 0;
        const currentTemp = current.temperature ?? hourly.temperature_2m?.[0] ?? null;

        const high = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null;
        const low = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null;
        const times = Array.isArray(hourly.time) ? hourly.time : [];
        const currentTime = current.time || times[0];
        let startIndex = times.findIndex((t) => t >= currentTime);
        if (startIndex < 0) startIndex = 0;
        const currentIso = current.time || times[startIndex] || null;
        const weatherMood = this.getWeatherMood(currentCode);
        const isCurrentNight = this.isNightAt(currentIso, daily);
        let phase = this.getDayPhase(currentIso, daily);
        if (isCurrentNight) phase = 'night';

        this.cityEl.textContent = payload.locationLabel || 'Unknown';
        this.tempEl.textContent = this.weatherService.formatTemp(currentTemp, unit);
        this.condEl.textContent = this.weatherService.getWeatherCondition(currentCode);
        this.rangeEl.textContent = `H: ${this.weatherService.formatTemp(high, unit)}  L: ${this.weatherService.formatTemp(low, unit)}`;
        const updatedTs = Number(forecast.updatedAt) || this.lastSuccessAt || Date.now();
        const relative = this.formatRelativeUpdate(updatedTs);
        this.metaEl.textContent = stale ? `Stale • ${relative}` : relative;
        this.setStatus(stale ? 'warn' : 'ok', statusMessage);
        this.heroIcon.innerHTML = '';
        this.heroIcon.appendChild(this.svgNode(this.getDisplayIconSvg(currentCode, { night: isCurrentNight })));
        this.applyBackgroundState({ mood: weatherMood, phase });
        this.hourlyList.innerHTML = '';
        const count = Math.min(12, Math.max(0, times.length - startIndex));
        for (let i = 0; i < count; i += 1) {
            const idx = startIndex + i;
            const card = el('div', { class: 'weather-hour-card' }, [
                el('div', { class: 'weather-hour-time' }, i === 0 ? 'Now' : this.formatHourLabel(times[idx], use24h)),
                el('div', { class: 'weather-hour-icon' }, this.svgNode(this.getDisplayIconSvg(hourly.weathercode?.[idx] ?? currentCode, {
                    night: this.isNightAt(times[idx], daily)
                }))),
                el('div', { class: 'weather-hour-temp' }, this.weatherService.formatTemp(hourly.temperature_2m?.[idx], unit)),
                el('div', { class: 'weather-hour-precip' }, hourly.precipitation_probability?.[idx] != null ? `${Math.round(hourly.precipitation_probability[idx])}%` : '—')
            ]);
            this.hourlyList.appendChild(card);
        }
        if (!count) {
            this.hourlyList.appendChild(el('div', { class: 'weather-empty-state' }, 'Hourly forecast unavailable.'));
        }

        this.dailyList.innerHTML = '';
        const dayCount = Math.min(7, Array.isArray(daily.time) ? daily.time.length : 0);
        for (let i = 0; i < dayCount; i += 1) {
            this.dailyList.appendChild(el('div', { class: 'weather-day-row' }, [
                el('div', { class: 'weather-day-label' }, i === 0 ? 'Today' : this.formatDayLabel(daily.time[i])),
                el('div', { class: 'weather-day-icon' }, this.svgNode(this.getDisplayIconSvg(daily.weathercode?.[i] ?? currentCode, { night: false }))),
                el('div', { class: 'weather-day-precip' }, daily.precipitation_probability_max?.[i] != null ? `${Math.round(daily.precipitation_probability_max[i])}%` : '—'),
                el('div', { class: 'weather-day-temp' }, `${this.weatherService.formatTemp(daily.temperature_2m_max?.[i], unit)} / ${this.weatherService.formatTemp(daily.temperature_2m_min?.[i], unit)}`)
            ]));
        }
        if (!dayCount) {
            this.dailyList.appendChild(el('div', { class: 'weather-empty-state' }, 'Daily forecast unavailable.'));
        }

        const idx = startIndex >= 0 ? startIndex : 0;
        const details = [
            ['Feels Like', this.weatherService.formatTemp(hourly.apparent_temperature?.[idx], unit)],
            ['Humidity', hourly.relativehumidity_2m?.[idx] != null ? `${Math.round(hourly.relativehumidity_2m[idx])}%` : '—'],
            ['Wind', this.weatherService.formatWind(hourly.windspeed_10m?.[idx])],
            ['Visibility', hourly.visibility?.[idx] != null ? `${Math.round(hourly.visibility[idx] / 1000)} km` : '—'],
            ['UV Index', hourly.uv_index?.[idx] != null ? `${Math.round(hourly.uv_index[idx])}` : '—'],
            ['Pressure', hourly.surface_pressure?.[idx] != null ? `${Math.round(hourly.surface_pressure[idx])} hPa` : '—'],
            ['Sunrise', this.formatTimeLabel(daily.sunrise?.[0], use24h)],
            ['Sunset', this.formatTimeLabel(daily.sunset?.[0], use24h)]
        ];
        this.detailGrid.innerHTML = '';
        details.forEach(([label, value]) => {
            this.detailGrid.appendChild(el('div', { class: 'weather-detail-tile' }, [
                el('span', { class: 'weather-detail-label' }, label),
                el('span', { class: 'weather-detail-value' }, value)
            ]));
        });

        this.renderAir(payload.air);
        this.renderAlerts(payload.alerts, use24h);
    }

    renderAir(air) {
        this.airMain.textContent = '—';
        this.airMetrics.innerHTML = '';
        if (!air?.current) {
            this.airMetrics.appendChild(el('div', { class: 'weather-empty-state' }, 'Air quality unavailable for this location.'));
            return;
        }
        const current = air.current;
        const usAqi = current.us_aqi;
        const euAqi = current.european_aqi;
        this.airMain.textContent = usAqi != null ? `US AQI ${Math.round(usAqi)}` : euAqi != null ? `EU AQI ${Math.round(euAqi)}` : 'AQI —';
        const items = [
            ['PM2.5', current.pm2_5],
            ['PM10', current.pm10],
            ['O3', current.ozone],
            ['NO2', current.nitrogen_dioxide]
        ];
        items.forEach(([label, val]) => {
            this.airMetrics.appendChild(el('div', { class: 'weather-air-tile' }, [
                el('span', { class: 'weather-air-label' }, label),
                el('span', { class: 'weather-air-value' }, val != null ? `${Math.round(val)}` : '—')
            ]));
        });
    }

    renderAlerts(alertsPayload, use24h) {
        this.alertsList.innerHTML = '';
        const alerts = Array.isArray(alertsPayload?.alerts) ? alertsPayload.alerts : [];
        if (!alerts.length) {
            this.alertsList.appendChild(el('div', { class: 'weather-alert-empty' }, 'No active alerts.'));
            return;
        }
        alerts.slice(0, 4).forEach((alert) => {
            const ends = alert.ends ? this.formatTimeLabel(alert.ends, use24h) : null;
            this.alertsList.appendChild(el('div', { class: 'weather-alert-item' }, [
                el('div', { class: 'weather-alert-title' }, alert.event || alert.headline || 'Weather Alert'),
                el('div', { class: 'weather-alert-meta' }, [alert.severity, alert.urgency, ends ? `Ends ${ends}` : null].filter(Boolean).join(' • ')),
                alert.description ? el('div', { class: 'weather-alert-desc' }, this.truncate(alert.description, 170)) : null
            ].filter(Boolean)));
        });
    }

    truncate(text, maxLen = 160) {
        const str = typeof text === 'string' ? text.trim() : '';
        if (!str) return '';
        if (str.length <= maxLen) return str;
        const clipped = str.slice(0, maxLen);
        const lastSpace = clipped.lastIndexOf(' ');
        return `${clipped.slice(0, lastSpace > 40 ? lastSpace : maxLen)}...`;
    }

    getWeatherMood(code) {
        const n = Number(code);
        if ([95, 96, 99].includes(n)) return 'storm';
        if ([71, 73, 75, 77, 85, 86].includes(n)) return 'snow';
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return 'rain';
        if ([45, 48].includes(n)) return 'fog';
        if ([1, 2, 3].includes(n)) return 'cloud';
        return 'clear';
    }

    getIconType(code) {
        const n = Number(code);
        if ([95, 96, 99].includes(n)) return 'storm';
        if ([71, 73, 75, 77, 85, 86].includes(n)) return 'snow';
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return 'rain';
        if ([45, 48].includes(n)) return 'fog';
        if ([1, 2].includes(n)) return 'partly';
        if (n === 3) return 'cloud';
        return 'clear';
    }

    isNightAt(iso, daily) {
        const when = iso ? new Date(iso) : new Date();
        if (Number.isNaN(when.getTime())) return false;
        const dateKey = (typeof iso === 'string' && iso.length >= 10)
            ? iso.slice(0, 10)
            : `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
        const dates = Array.isArray(daily?.time) ? daily.time : [];
        const idx = dates.findIndex((d) => d === dateKey);
        const sunriseRaw = idx >= 0 ? daily?.sunrise?.[idx] : null;
        const sunsetRaw = idx >= 0 ? daily?.sunset?.[idx] : null;
        const sunrise = sunriseRaw ? new Date(sunriseRaw).getTime() : NaN;
        const sunset = sunsetRaw ? new Date(sunsetRaw).getTime() : NaN;
        if (Number.isFinite(sunrise) && Number.isFinite(sunset) && sunset > sunrise) {
            const t = when.getTime();
            return t < sunrise || t >= sunset;
        }
        const h = when.getHours();
        return h < 6 || h >= 19;
    }

    getDayPhase(iso, daily) {
        const when = iso ? new Date(iso) : new Date();
        if (Number.isNaN(when.getTime())) {
            const h = new Date().getHours();
            if (h < 6 || h >= 20) return 'night';
            if (h < 8) return 'dawn';
            if (h < 17) return 'day';
            return 'sunset';
        }
        const dateKey = (typeof iso === 'string' && iso.length >= 10)
            ? iso.slice(0, 10)
            : `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
        const dates = Array.isArray(daily?.time) ? daily.time : [];
        const idx = dates.findIndex((d) => d === dateKey);
        const sunriseRaw = idx >= 0 ? daily?.sunrise?.[idx] : null;
        const sunsetRaw = idx >= 0 ? daily?.sunset?.[idx] : null;
        const sunrise = sunriseRaw ? new Date(sunriseRaw).getTime() : NaN;
        const sunset = sunsetRaw ? new Date(sunsetRaw).getTime() : NaN;
        const t = when.getTime();
        if (Number.isFinite(sunrise) && Number.isFinite(sunset) && sunset > sunrise) {
            const dawnStart = sunrise - (55 * 60 * 1000);
            const dayStart = sunrise + (35 * 60 * 1000);
            const sunsetStart = sunset - (70 * 60 * 1000);
            const nightStart = sunset + (45 * 60 * 1000);
            if (t < dawnStart || t >= nightStart) return 'night';
            if (t < dayStart) return 'dawn';
            if (t < sunsetStart) return 'day';
            return 'sunset';
        }
        const h = when.getHours();
        if (h < 6 || h >= 20) return 'night';
        if (h < 8) return 'dawn';
        if (h < 17) return 'day';
        return 'sunset';
    }

    applyBackgroundState({ mood = 'clear', phase = 'day' } = {}) {
        if (!this.root) return;
        const prevMood = this.root.dataset.weatherMood || '';
        const prevPhase = this.root.dataset.weatherPhase || '';
        this.root.dataset.weatherMood = mood;
        this.root.dataset.weatherPhase = phase;
        this.root.dataset.weatherFreshness = this.lastFailureReason ? 'stale' : 'live';
        if (prevMood === mood && prevPhase === phase) return;
        this.root.classList.add('is-weather-shift');
        if (this.weatherShiftTimer) clearTimeout(this.weatherShiftTimer);
        this.weatherShiftTimer = setTimeout(() => {
            this.root?.classList.remove('is-weather-shift');
            this.weatherShiftTimer = null;
        }, 420);
    }

    getDisplayIconSvg(code, { night = false } = {}) {
        const type = this.getIconType(code);
        if (type === 'clear' && night) {
            return `
                <svg viewBox="0 0 64 64" fill="none">
                    <path d="M40 9c-1.5 8-8.4 14.1-16.8 14.1-2.7 0-5.1-.6-7.3-1.6 2.1 12.4 12.5 21.8 25.5 21.8 4.4 0 8.7-1.2 12.2-3.2-4.4 8.2-13 13.9-22.9 13.9-14.3 0-26-11.7-26-26 0-11.5 7.6-21.5 18.5-24.8C28.5 1.6 34.7 3.7 40 9Z" fill="#DDE9FF"/>
                    <circle cx="44" cy="17" r="2" fill="#BFD4FF"/><circle cx="50" cy="25" r="1.7" fill="#BFD4FF"/><circle cx="38" cy="22" r="1.4" fill="#BFD4FF"/>
                </svg>`;
        }
        if (type === 'clear') {
            return `
                <svg viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="11" fill="#FFD34D"/>
                    <g stroke="#FFB11A" stroke-width="3" stroke-linecap="round">
                        <path d="M32 7v8"/><path d="M32 49v8"/><path d="M7 32h8"/><path d="M49 32h8"/>
                        <path d="M14 14l6 6"/><path d="M44 44l6 6"/><path d="M14 50l6-6"/><path d="M44 20l6-6"/>
                    </g>
                </svg>`;
        }
        if (type === 'partly' && night) {
            return `
                <svg viewBox="0 0 64 64" fill="none">
                    <path d="M31 13c-1.1 5.8-6 10.2-12 10.2-1.9 0-3.7-.4-5.2-1.1 1.5 9 9 15.8 18.3 15.8 3.2 0 6.2-.9 8.8-2.3-3.2 6-9.4 10-16.5 10-10.4 0-18.8-8.4-18.8-18.8 0-8.3 5.5-15.6 13.4-18C22.8 7.7 27.3 9.2 31 13Z" fill="#DDE8FF"/>
                    <path d="M20 45h25c5.8 0 10-3.8 10-8.8 0-4.9-4-8.7-9-8.7-1.6-5.3-6.4-8.7-12.1-8.7-7.1 0-12.8 5.4-13.2 12.2-4.5.3-7.7 3.8-7.7 7.9 0 3.6 3.7 6.1 7 6.1Z" fill="#EDF7FF"/>
                    <path d="M20 45h25c5.8 0 10-3.8 10-8.8 0-4.9-4-8.7-9-8.7-1.6-5.3-6.4-8.7-12.1-8.7-7.1 0-12.8 5.4-13.2 12.2-4.5.3-7.7 3.8-7.7 7.9 0 3.6 3.7 6.1 7 6.1Z" stroke="#BDD8EE" stroke-width="1.4"/>
                </svg>`;
        }
        if (type === 'partly') {
            return `
                <svg viewBox="0 0 64 64" fill="none">
                    <circle cx="23" cy="23" r="9" fill="#FFD75E"/>
                    <g stroke="#FFB92E" stroke-width="2.5" stroke-linecap="round">
                        <path d="M23 9v5"/><path d="M23 32v5"/><path d="M9 23h5"/><path d="M32 23h5"/>
                    </g>
                    <path d="M19 44h26c6 0 10-3.9 10-9 0-5-4.1-8.9-9.2-8.9-1.7-5.7-6.8-9.5-13-9.5-7.6 0-13.8 5.8-14.2 13.1C13.8 30.1 10 33.7 10 38.2 10 42 13.9 44 19 44Z" fill="#EAF6FF"/>
                    <path d="M19 44h26c6 0 10-3.9 10-9 0-5-4.1-8.9-9.2-8.9-1.7-5.7-6.8-9.5-13-9.5-7.6 0-13.8 5.8-14.2 13.1C13.8 30.1 10 33.7 10 38.2 10 42 13.9 44 19 44Z" stroke="#B7D8F5" stroke-width="1.4"/>
                </svg>`;
        }
        if (type === 'cloud') {
            return `
                <svg viewBox="0 0 64 64" fill="none">
                    <path d="M17 43h30c6.5 0 11-4.2 11-9.8 0-5.5-4.6-9.8-10.4-9.8-2-6.3-7.8-10.5-14.8-10.5-8.6 0-15.5 6.3-16 14.3C11.8 27.8 8 31.8 8 36.7 8 40.8 12 43 17 43Z" fill="#EDF7FF"/>
                    <path d="M17 43h30c6.5 0 11-4.2 11-9.8 0-5.5-4.6-9.8-10.4-9.8-2-6.3-7.8-10.5-14.8-10.5-8.6 0-15.5 6.3-16 14.3C11.8 27.8 8 31.8 8 36.7 8 40.8 12 43 17 43Z" stroke="#BCD9F0" stroke-width="1.4"/>
                </svg>`;
        }
        if (type === 'fog') {
            return `
                <svg viewBox="0 0 64 64" fill="none">
                    <path d="M18 34h28c5.7 0 10-3.8 10-8.8s-4.3-8.8-9.6-8.8c-1.8-5.3-6.8-8.8-12.8-8.8-7.2 0-13.1 5.4-13.6 12.2-4.7.4-8 3.6-8 7.6 0 3.5 3.6 6.6 8 6.6Z" fill="#EAF4FF"/>
                    <path d="M12 40h40" stroke="#A8C9E5" stroke-width="3" stroke-linecap="round"/>
                    <path d="M16 46h32" stroke="#A8C9E5" stroke-width="3" stroke-linecap="round"/>
                    <path d="M20 52h24" stroke="#A8C9E5" stroke-width="3" stroke-linecap="round"/>
                </svg>`;
        }
        if (type === 'rain') {
            return `
                <svg viewBox="0 0 64 64" fill="none">
                    <path d="M17 37h30c6.4 0 11-4 11-9.5 0-5.3-4.5-9.4-10.2-9.4-2-6.1-7.7-10.2-14.6-10.2-8.5 0-15.3 6.1-15.8 14-5 .5-8.4 4.2-8.4 8.2C9 33.8 12.8 37 17 37Z" fill="#EBF6FF"/>
                    <g fill="#44A8FF">
                        <path d="M20 43c2.2 0 4 1.7 4 3.8 0 2.5-2.2 4.1-4.1 6.8-1.8-2.7-4-4.3-4-6.8 0-2.1 1.8-3.8 4.1-3.8Z"/>
                        <path d="M32 44c2.2 0 4 1.7 4 3.8 0 2.5-2.2 4.1-4.1 6.8-1.8-2.7-4-4.3-4-6.8 0-2.1 1.8-3.8 4.1-3.8Z"/>
                        <path d="M44 43c2.2 0 4 1.7 4 3.8 0 2.5-2.2 4.1-4.1 6.8-1.8-2.7-4-4.3-4-6.8 0-2.1 1.8-3.8 4.1-3.8Z"/>
                    </g>
                </svg>`;
        }
        if (type === 'snow') {
            return `
                <svg viewBox="0 0 64 64" fill="none">
                    <path d="M17 37h30c6.4 0 11-4 11-9.5 0-5.3-4.5-9.4-10.2-9.4-2-6.1-7.7-10.2-14.6-10.2-8.5 0-15.3 6.1-15.8 14-5 .5-8.4 4.2-8.4 8.2C9 33.8 12.8 37 17 37Z" fill="#F2FAFF"/>
                    <g stroke="#7EC8FF" stroke-width="2.3" stroke-linecap="round">
                        <path d="M20 44v9"/><path d="M16 48h8"/><path d="M17.2 45.2l5.6 5.6"/><path d="M22.8 45.2l-5.6 5.6"/>
                        <path d="M32 43v9"/><path d="M28 47.5h8"/><path d="M29.2 44.2l5.6 5.6"/><path d="M34.8 44.2l-5.6 5.6"/>
                        <path d="M44 44v9"/><path d="M40 48h8"/><path d="M41.2 45.2l5.6 5.6"/><path d="M46.8 45.2l-5.6 5.6"/>
                    </g>
                </svg>`;
        }
        return `
            <svg viewBox="0 0 64 64" fill="none">
                <path d="M17 37h30c6.4 0 11-4 11-9.5 0-5.3-4.5-9.4-10.2-9.4-2-6.1-7.7-10.2-14.6-10.2-8.5 0-15.3 6.1-15.8 14-5 .5-8.4 4.2-8.4 8.2C9 33.8 12.8 37 17 37Z" fill="#DCEEFF"/>
                <path d="M31 40l-5.5 10h5.2L28 58l10.5-13h-5.3l4.8-5Z" fill="#FFB000"/>
                <g fill="#50B3FF">
                    <path d="M20 43c2.2 0 4 1.7 4 3.8 0 2.5-2.2 4.1-4.1 6.8-1.8-2.7-4-4.3-4-6.8 0-2.1 1.8-3.8 4.1-3.8Z"/>
                    <path d="M44 43c2.2 0 4 1.7 4 3.8 0 2.5-2.2 4.1-4.1 6.8-1.8-2.7-4-4.3-4-6.8 0-2.1 1.8-3.8 4.1-3.8Z"/>
                </g>
            </svg>`;
    }

    notify(message) {
        window.dispatchEvent(new CustomEvent('yancotab:notify', { detail: { message } }));
    }

    getAutoLocationCandidate() {
        const list = Array.isArray(this.state.locations) ? this.state.locations : [];
        const fromList = list.find((loc) => loc?.isAuto || loc?.id === 'weather-auto-current');
        if (fromList) {
            return this.normalizeLocation({ ...fromList, id: 'weather-auto-current', isAuto: true });
        }
        const stored = this.getStoredCoordsLocation();
        if (stored) {
            return this.normalizeLocation({ ...stored, id: 'weather-auto-current', isAuto: true });
        }
        return null;
    }

    applyDefaultLocationOnExit() {
        if (this.exitStateApplied) return false;
        this.exitStateApplied = true;
        const auto = this.getAutoLocationCandidate();
        if (!auto) return false;

        const locations = Array.isArray(this.state.locations) ? [...this.state.locations] : [];
        const autoKey = (auto.query || '').toLowerCase();
        let idx = locations.findIndex((loc) => loc?.isAuto || loc?.id === 'weather-auto-current');
        if (idx < 0 && autoKey) {
            idx = locations.findIndex((loc) => (loc?.query || '').toLowerCase() === autoKey);
        }
        if (idx >= 0) {
            locations[idx] = { ...locations[idx], ...auto, isAuto: true, id: 'weather-auto-current' };
        } else {
            locations.unshift({ ...auto, isAuto: true, id: 'weather-auto-current' });
            idx = 0;
        }
        this.state.locations = locations;
        this.state.currentLocation = locations[idx];
        this.saveState();
        return true;
    }

    close() {
        this.applyDefaultLocationOnExit();
        super.close();
    }

    destroy() {
        this.applyDefaultLocationOnExit();
        if (this.searchTimer) clearTimeout(this.searchTimer);
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        if (this.weatherShiftTimer) clearTimeout(this.weatherShiftTimer);
        if (this.onDocClick) document.removeEventListener('click', this.onDocClick);
        if (this.onVisibilityChange) document.removeEventListener('visibilitychange', this.onVisibilityChange);
        if (this.onWindowFocus) window.removeEventListener('focus', this.onWindowFocus);
        super.destroy();
    }
}
