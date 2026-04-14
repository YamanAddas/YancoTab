/**
 * YancoTab Unified Storage Layer
 *
 * Architecture invariant:
 *   No app, service, or utility writes YancoTab persistent state
 *   except through kernel.storage.
 *
 * Local storage is the canonical runtime store.
 * Remote sync (chrome.storage.sync) is background replication,
 * not a read path.
 */

// ─── Key Registry ────────────────────────────────────────────
// Every persistent key must be registered. No exceptions.

const REGISTRY = {
    // ── Preferences (syncPolicy: 'always') ──
    yancotab_theme_mode: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: 'dark',
        validate: (v) => v === 'dark' || v === 'light',
    },
    yancotab_24h: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: false,
        validate: (v) => typeof v === 'boolean',
    },
    yancotab_metric: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: true,
        validate: (v) => typeof v === 'boolean',
    },
    yancotabSearchEngine: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: 'google',
        validate: (v) => ['google', 'duck', 'bing'].includes(v),
    },
    yancotab_browser_prefs: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: {
            searchEngine: 'google',
            forceWebParam: true,
            historyLimit: 20,
            startTheme: 'aurora',
        },
        validate: (v) =>
            v && typeof v === 'object' &&
            ['google', 'duck', 'bing'].includes(v.searchEngine) &&
            typeof v.historyLimit === 'number',
    },
    yancotab_wallpaper: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: '',
        validate: (v) => typeof v === 'string',
    },
    yancotab_home_layout_v100: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: '',
        validate: (v) => typeof v === 'string',
    },
    yancotab_home_layout_mode: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: '',
        validate: (v) => typeof v === 'string',
    },
    yancotab_user_name: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: '',
        validate: (v) => typeof v === 'string',
    },
    yancotab_widgets: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: { clock: true, weather: true, todo: true },
        validate: (v) => v && typeof v === 'object',
    },
    yancotab_quick_links: {
        storageClass: 'user-data',
        syncPolicy: 'conditional',
        version: 1,
        default: [
            { label: 'Google', url: 'https://www.google.com' },
            { label: 'YouTube', url: 'https://www.youtube.com' },
            { label: 'GitHub', url: 'https://github.com' },
            { label: 'Wikipedia', url: 'https://www.wikipedia.org' },
            { label: 'Reddit', url: 'https://www.reddit.com' },
        ],
        validate: (v) => Array.isArray(v),
    },
    yancotab_onboarding_done: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: false,
        validate: (v) => typeof v === 'boolean',
    },
    yancotab_discovery_dismissed: {
        storageClass: 'volatile',
        syncPolicy: 'never',
        version: 1,
        default: [],
        validate: (v) => Array.isArray(v),
    },
    yancotab_starfield_enabled: {
        storageClass: 'preferences',
        syncPolicy: 'always',
        version: 1,
        default: true,
        validate: (v) => typeof v === 'boolean',
    },

    // ── User Data (syncPolicy: 'conditional') ──
    yancotab_todo_v1: {
        storageClass: 'user-data',
        syncPolicy: 'conditional',
        version: 1,
        default: {
            lists: [{
                id: 'default',
                name: 'My Tasks',
                tasks: [],
            }],
        },
        validate: (v) =>
            v && typeof v === 'object' &&
            Array.isArray(v.lists) &&
            v.lists.every((l) =>
                l && typeof l.id === 'string' &&
                typeof l.name === 'string' &&
                Array.isArray(l.tasks)),
    },
    yancotab_dock_items: {
        storageClass: 'user-data',
        syncPolicy: 'conditional',
        version: 1,
        default: ['browser', 'files', 'settings', 'notes'],
        validate: (v) => Array.isArray(v) && v.every((i) => typeof i === 'string'),
    },
    yancotab_notes_meta_v2: {
        storageClass: 'user-data',
        syncPolicy: 'conditional',
        version: 1,
        default: [],
        validate: (v) => Array.isArray(v),
    },

    // ── Volatile (syncPolicy: 'never') ──
    yancotab_mobile_grid_v8: {
        storageClass: 'volatile',
        syncPolicy: 'never',
        version: 1,
        default: null,
        validate: () => true, // complex structure, trust existing code
    },
    yancotab_browser_v1: {
        storageClass: 'volatile',
        syncPolicy: 'never',
        version: 1,
        default: {},
        validate: (v) => v && typeof v === 'object',
    },
    yancotabWeatherState: {
        storageClass: 'volatile',
        syncPolicy: 'never',
        version: 1,
        default: {},
        validate: (v) => v && typeof v === 'object',
    },
    yancotabWeatherCacheV2: {
        storageClass: 'volatile',
        syncPolicy: 'never',
        version: 1,
        default: {},
        validate: (v) => v && typeof v === 'object',
    },
    yancotab_memory_best: {
        storageClass: 'volatile',
        syncPolicy: 'never',
        version: 1,
        default: {},
        validate: (v) => v && typeof v === 'object',
    },
    yancotab_clock_state_v3: {
        storageClass: 'volatile',
        syncPolicy: 'never',
        version: 1,
        default: {},
        validate: (v) => v && typeof v === 'object',
    },
    yancotab_import_backup: {
        storageClass: 'volatile',
        syncPolicy: 'never',
        version: 1,
        default: null,
        validate: () => true,
    },
};

// ─── Internal Constants ──────────────────────────────────────

const SEQ_KEY = 'yancotab_seq';
const DEVICE_ID_KEY = 'yancotab_device_id';
const CHUNK_SUFFIX = '__chunk_';
const MAX_SYNC_ITEM_BYTES = 7168; // 7KB (leave margin under 8KB limit)
const DEBOUNCE_MS = 2000;

// ─── AppStorage Class ────────────────────────────────────────

export class AppStorage {
    constructor() {
        this._subscribers = new Map();  // key → Set<callback>
        this._dirtyKeys = new Set();
        this._debounceTimer = null;
        this._seq = 0;
        this._deviceId = '';
        this._lastSync = null;
        this._lastError = null;
        this._syncState = 'unknown'; // 'active' | 'fallback-local' | 'error' | 'standalone'
        this._hydrated = false;
    }

    // ─── Lifecycle ───────────────────────────────────────────

    init() {
        // Load or generate device identity
        this._seq = parseInt(localStorage.getItem(SEQ_KEY) || '0', 10) || 0;

        const storedId = localStorage.getItem(DEVICE_ID_KEY);
        if (storedId) {
            this._deviceId = storedId;
        } else {
            this._deviceId = this._generateId();
            localStorage.setItem(DEVICE_ID_KEY, this._deviceId);
        }

        // Determine runtime mode
        if (this.isExtension()) {
            this._syncState = 'active';
            this._setupSyncListeners();
            // Begin async hydration (non-blocking)
            this._hydrateFromRemote();
        } else {
            this._syncState = 'standalone';
        }

        // Listen for cross-tab changes in standalone mode
        window.addEventListener('storage', (e) => {
            if (!e.key || !REGISTRY[e.key]) return;
            const data = this.normalize(e.key, e.newValue, 'remote');
            this._emitIfChanged(e.key, data, 'remote');
        });
    }

    // ─── Public API ──────────────────────────────────────────

    /**
     * Load data for a registered key. Always reads local canonical state.
     * Returns clean app data (never envelope metadata).
     */
    load(key) {
        const entry = REGISTRY[key];
        if (!entry) {
            console.warn(`[AppStorage] Unknown key: ${key}`);
            return undefined;
        }

        const raw = localStorage.getItem(key);
        if (raw === null) return this._cloneDefault(entry.default);

        return this.normalize(key, raw, 'local');
    }

    /**
     * Save data for a registered key. Validates, writes local,
     * queues sync if eligible.
     */
    save(key, data) {
        const entry = REGISTRY[key];
        if (!entry) {
            console.warn(`[AppStorage] Unknown key: ${key}`);
            return;
        }

        // Normalize incoming data (runs validation/migration)
        const clean = this.normalize(key, data, 'local');

        // Check if data actually changed
        const oldClean = this.load(key);
        const changed = !this._deepEqual(oldClean, clean);

        // Increment seq, build envelope, write
        this._seq++;
        localStorage.setItem(SEQ_KEY, String(this._seq));

        const envelope = {
            data: clean,
            version: entry.version,
            ts: Date.now(),
            seq: this._seq,
            deviceId: this._deviceId,
        };

        localStorage.setItem(key, JSON.stringify(envelope));

        // Queue for sync if eligible
        if (this.isExtension() && entry.syncPolicy !== 'never') {
            this._dirtyKeys.add(key);
            this._scheduleSync();
        }

        // Emit to subscribers if data changed
        if (changed) {
            this._emit(key, { key, oldValue: oldClean, newValue: clean, source: 'local' });
        }
    }

    /**
     * Remove a registered key from storage.
     */
    remove(key) {
        const entry = REGISTRY[key];
        if (!entry) return;

        const oldClean = this.load(key);
        localStorage.removeItem(key);

        // Clean up any chunks
        this._deleteChunks(key);

        if (this.isExtension() && entry.syncPolicy !== 'never') {
            try { chrome.storage.sync.remove(key); } catch { /* ignore */ }
        }

        const newClean = this._cloneDefault(entry.default);
        if (!this._deepEqual(oldClean, newClean)) {
            this._emit(key, { key, oldValue: oldClean, newValue: newClean, source: 'local' });
        }
    }

    /**
     * Subscribe to changes for a key. Returns unsubscribe function.
     * Callback receives { key, oldValue, newValue, source }.
     */
    subscribe(key, callback) {
        if (!this._subscribers.has(key)) {
            this._subscribers.set(key, new Set());
        }
        this._subscribers.get(key).add(callback);
        return () => {
            const subs = this._subscribers.get(key);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) this._subscribers.delete(key);
            }
        };
    }

    /**
     * Immediately flush all pending sync writes.
     */
    async flush() {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }

        if (!this.isExtension() || this._dirtyKeys.size === 0) return;

        const keys = [...this._dirtyKeys];
        this._dirtyKeys.clear();

        for (const key of keys) {
            await this._syncKeyToRemote(key);
        }

        this._lastSync = Date.now();
    }

    /**
     * Get current storage status.
     */
    getStatus() {
        return {
            mode: this.isExtension() ? 'extension' : 'standalone',
            lastSync: this._lastSync,
            lastError: this._lastError,
            syncState: this._syncState,
            hydrated: this._hydrated,
        };
    }

    /**
     * Detect if running as a Chrome extension.
     */
    isExtension() {
        try {
            return !!(
                typeof chrome !== 'undefined' &&
                chrome.runtime &&
                chrome.runtime.id &&
                chrome.storage &&
                chrome.storage.sync
            );
        } catch {
            return false;
        }
    }

    /**
     * Export all eligible data. Returns clean app data only.
     */
    exportAll(options = {}) {
        const keys = {};

        for (const [key, entry] of Object.entries(REGISTRY)) {
            // Always include preferences and user-data
            if (entry.storageClass === 'preferences' || entry.storageClass === 'user-data') {
                const data = this.load(key);
                if (data !== null && data !== undefined) {
                    keys[key] = data;
                }
            }
            // Optionally include local-only user data
            if (options.includeLocal && entry.storageClass === 'volatile' && key !== 'yancotab_import_backup') {
                const data = this.load(key);
                if (data !== null && data !== undefined) {
                    keys[key] = data;
                }
            }
        }

        return {
            exportVersion: 1,
            exportDate: new Date().toISOString(),
            keys,
        };
    }

    /**
     * Import data from an export file. Returns summary.
     */
    importAll(json) {
        const result = { imported: [], skipped: [], errors: [] };

        // Validate shape
        if (!json || typeof json !== 'object' || json.exportVersion !== 1 || !json.keys) {
            result.errors.push('Invalid export file format');
            return result;
        }

        // Backup current state before import
        try {
            const backup = this.exportAll({ includeLocal: true });
            backup.backupDate = new Date().toISOString();
            localStorage.setItem('yancotab_import_backup', JSON.stringify({
                data: backup,
                version: 1,
                ts: Date.now(),
                seq: this._seq,
                deviceId: this._deviceId,
            }));
        } catch (e) {
            console.warn('[AppStorage] Backup before import failed:', e);
        }

        // Import each key through normalize/save pipeline
        for (const [key, importedData] of Object.entries(json.keys)) {
            if (!REGISTRY[key]) {
                result.skipped.push(key);
                continue;
            }

            try {
                const normalized = this.normalize(key, importedData, 'import');
                const entry = REGISTRY[key];

                // If normalize returned default and imported data wasn't the default,
                // that means validation failed
                if (this._deepEqual(normalized, this._cloneDefault(entry.default)) &&
                    !this._deepEqual(importedData, entry.default)) {
                    result.errors.push(key);
                    continue;
                }

                this.save(key, normalized);
                result.imported.push(key);
            } catch (e) {
                console.warn(`[AppStorage] Import failed for ${key}:`, e);
                result.errors.push(key);
            }
        }

        return result;
    }

    // ─── Internal: Normalize ─────────────────────────────────

    /**
     * Single function through which ALL data flows.
     * Parses, unwraps envelope, migrates, validates.
     * Returns clean app data.
     */
    normalize(key, rawData, source) {
        const entry = REGISTRY[key];
        if (!entry) return undefined;

        let data;
        let version = 0;

        // Step 1: Parse if string
        if (typeof rawData === 'string') {
            try {
                data = JSON.parse(rawData);
            } catch {
                console.warn(`[AppStorage] ${key}: JSON parse failed (source: ${source}), using default`);
                return this._cloneDefault(entry.default);
            }
        } else {
            data = rawData;
        }

        if (data === null || data === undefined) {
            return this._cloneDefault(entry.default);
        }

        // Step 2: Detect and unwrap envelope
        if (this._isEnvelope(data)) {
            version = data.version || 0;
            data = data.data;
        }
        // else: raw (legacy or import) — treat as version 0

        // Step 3: Handle chunked manifests
        if (data && typeof data === 'object' && data.__chunked) {
            data = this._reassembleChunks(key, data, source);
            if (data === null) {
                console.warn(`[AppStorage] ${key}: chunk reassembly failed (source: ${source}), using default`);
                return this._cloneDefault(entry.default);
            }
        }

        // Step 4: Run migrations
        if (entry.migrate && version < entry.version) {
            for (let v = version; v < entry.version; v++) {
                if (typeof entry.migrate[v] === 'function') {
                    try {
                        data = entry.migrate[v](data);
                    } catch (e) {
                        console.warn(`[AppStorage] ${key}: migration ${v}→${v + 1} failed (source: ${source}):`, e);
                        return this._cloneDefault(entry.default);
                    }
                }
            }
        }

        // Step 5: Validate
        try {
            if (!entry.validate(data)) {
                console.warn(`[AppStorage] ${key}: validation failed (source: ${source}), using default`);
                return this._cloneDefault(entry.default);
            }
        } catch {
            console.warn(`[AppStorage] ${key}: validation threw (source: ${source}), using default`);
            return this._cloneDefault(entry.default);
        }

        return data;
    }

    // ─── Internal: Sync ──────────────────────────────────────

    _setupSyncListeners() {
        if (!this.isExtension()) return;

        try {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'sync') return;

                for (const [rawKey, { newValue }] of Object.entries(changes)) {
                    // Skip chunk keys — they're handled via manifest
                    if (rawKey.includes(CHUNK_SUFFIX)) continue;

                    const key = rawKey;
                    if (!REGISTRY[key]) continue;

                    this._handleRemoteChange(key, newValue);
                }
            });
        } catch (e) {
            console.warn('[AppStorage] Failed to set up sync listeners:', e);
            this._syncState = 'error';
            this._lastError = e.message;
        }
    }

    _handleRemoteChange(key, remoteRaw) {
        if (!remoteRaw) return;

        let remoteEnvelope;
        try {
            remoteEnvelope = typeof remoteRaw === 'string' ? JSON.parse(remoteRaw) : remoteRaw;
        } catch {
            return;
        }

        if (!this._isEnvelope(remoteEnvelope)) return;

        // Compare against current local envelope
        const localRaw = localStorage.getItem(key);
        let localEnvelope = null;
        try {
            localEnvelope = localRaw ? JSON.parse(localRaw) : null;
        } catch { /* no local envelope */ }

        // If remote wins, update local
        if (this._remoteWins(localEnvelope, remoteEnvelope)) {
            localStorage.setItem(key, JSON.stringify(remoteEnvelope));
            const clean = this.normalize(key, remoteEnvelope, 'remote');
            this._emitIfChanged(key, clean, 'remote');
        }
    }

    async _hydrateFromRemote() {
        if (!this.isExtension()) return;

        try {
            const syncKeys = Object.entries(REGISTRY)
                .filter(([, e]) => e.syncPolicy !== 'never')
                .map(([k]) => k);

            const remote = await chrome.storage.sync.get(syncKeys);

            for (const [key, remoteRaw] of Object.entries(remote)) {
                if (!REGISTRY[key] || !remoteRaw) continue;
                this._handleRemoteChange(key, remoteRaw);
            }

            this._hydrated = true;
            this._lastSync = Date.now();
        } catch (e) {
            console.warn('[AppStorage] Hydration failed:', e);
            this._syncState = 'fallback-local';
            this._lastError = e.message;
            this._hydrated = true; // Mark hydrated even on failure — local data is valid
        }
    }

    async _syncKeyToRemote(key) {
        if (!this.isExtension()) return;

        const entry = REGISTRY[key];
        if (!entry || entry.syncPolicy === 'never') return;

        const raw = localStorage.getItem(key);
        if (!raw) return;

        try {
            const serialized = raw;
            const bytes = new Blob([serialized]).size;

            // Clean up any old chunks for this key first
            await this._deleteRemoteChunks(key);

            if (bytes <= MAX_SYNC_ITEM_BYTES) {
                // Direct write
                await chrome.storage.sync.set({ [key]: JSON.parse(serialized) });
            } else if (entry.syncPolicy === 'conditional') {
                // Chunk it
                const chunks = this._splitIntoChunks(serialized);
                const manifest = {
                    __chunked: true,
                    count: chunks.length,
                    ts: Date.now(),
                    deviceId: this._deviceId,
                    totalBytes: bytes,
                };

                const writeObj = { [key]: manifest };
                chunks.forEach((chunk, i) => {
                    writeObj[`${key}${CHUNK_SUFFIX}${i}`] = chunk;
                });

                await chrome.storage.sync.set(writeObj);
            }
            // If 'always' and too large — should not happen for preferences

            this._lastSync = Date.now();
            this._syncState = 'active';
        } catch (e) {
            console.warn(`[AppStorage] Sync write failed for ${key}:`, e);
            this._lastError = e.message;

            if (e.message && e.message.includes('QUOTA')) {
                this._syncState = 'fallback-local';
            } else {
                this._syncState = 'error';
            }
        }
    }

    _scheduleSync() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            this.flush();
        }, DEBOUNCE_MS);
    }

    // ─── Internal: Chunking ──────────────────────────────────

    _splitIntoChunks(serialized) {
        const chunks = [];
        for (let i = 0; i < serialized.length; i += MAX_SYNC_ITEM_BYTES) {
            chunks.push(serialized.slice(i, i + MAX_SYNC_ITEM_BYTES));
        }
        return chunks;
    }

    _reassembleChunks(key, manifest, source) {
        if (!manifest.__chunked || typeof manifest.count !== 'number') return null;

        const parts = [];
        for (let i = 0; i < manifest.count; i++) {
            const chunkKey = `${key}${CHUNK_SUFFIX}${i}`;
            let chunk;

            if (source === 'remote' && this.isExtension()) {
                // Remote chunks should have been fetched already — not supported in sync read
                // This path is handled differently in hydration
                return null;
            }

            chunk = localStorage.getItem(chunkKey);
            if (chunk === null) return null; // Missing chunk
            parts.push(chunk);
        }

        const reassembled = parts.join('');

        // Integrity check
        if (manifest.totalBytes && new Blob([reassembled]).size !== manifest.totalBytes) {
            return null;
        }

        try {
            return JSON.parse(reassembled);
        } catch {
            return null;
        }
    }

    _deleteChunks(key) {
        // Delete local chunks
        for (let i = 0; i < 100; i++) {
            const ck = `${key}${CHUNK_SUFFIX}${i}`;
            if (localStorage.getItem(ck) === null) break;
            localStorage.removeItem(ck);
        }
    }

    async _deleteRemoteChunks(key) {
        if (!this.isExtension()) return;

        try {
            // Try to read the current remote value to check for chunks
            const remote = await chrome.storage.sync.get(key);
            const val = remote[key];
            if (val && val.__chunked && typeof val.count === 'number') {
                const keysToRemove = [];
                for (let i = 0; i < val.count; i++) {
                    keysToRemove.push(`${key}${CHUNK_SUFFIX}${i}`);
                }
                if (keysToRemove.length) {
                    await chrome.storage.sync.remove(keysToRemove);
                }
            }
        } catch {
            // Best effort — ignore failures
        }
    }

    // ─── Internal: Conflict Resolution ───────────────────────

    _remoteWins(localEnvelope, remoteEnvelope) {
        if (!localEnvelope || !this._isEnvelope(localEnvelope)) return true;
        if (!remoteEnvelope || !this._isEnvelope(remoteEnvelope)) return false;

        const lts = localEnvelope.ts || 0;
        const rts = remoteEnvelope.ts || 0;
        if (rts > lts) return true;
        if (rts < lts) return false;

        const lseq = localEnvelope.seq || 0;
        const rseq = remoteEnvelope.seq || 0;
        if (rseq > lseq) return true;
        if (rseq < lseq) return false;

        // Tiebreak: lexicographic deviceId
        const lid = localEnvelope.deviceId || '';
        const rid = remoteEnvelope.deviceId || '';
        return rid > lid;
    }

    // ─── Internal: Events ────────────────────────────────────

    _emit(key, detail) {
        const subs = this._subscribers.get(key);
        if (subs) {
            for (const cb of subs) {
                try { cb(detail); } catch (e) {
                    console.warn(`[AppStorage] Subscriber error for ${key}:`, e);
                }
            }
        }
        window.dispatchEvent(new CustomEvent('yancotab:storage-changed', { detail }));
    }

    _emitIfChanged(key, newClean, source) {
        const entry = REGISTRY[key];
        if (!entry) return;

        // Compare against what load() currently returns
        const raw = localStorage.getItem(key);
        let oldClean;
        if (raw !== null) {
            try {
                const parsed = JSON.parse(raw);
                oldClean = this._isEnvelope(parsed)
                    ? parsed.data
                    : this.normalize(key, raw, 'local');
            } catch {
                oldClean = this._cloneDefault(entry.default);
            }
        } else {
            oldClean = this._cloneDefault(entry.default);
        }

        if (!this._deepEqual(oldClean, newClean)) {
            this._emit(key, { key, oldValue: oldClean, newValue: newClean, source });
        }
    }

    // ─── Internal: Helpers ───────────────────────────────────

    _isEnvelope(obj) {
        return (
            obj && typeof obj === 'object' &&
            'data' in obj &&
            'version' in obj &&
            typeof obj.ts === 'number'
        );
    }

    _cloneDefault(def) {
        if (def === null || def === undefined) return def;
        if (typeof def !== 'object') return def;
        return JSON.parse(JSON.stringify(def));
    }

    _deepEqual(a, b) {
        if (a === b) return true;
        if (a === null || b === null) return false;
        if (typeof a !== typeof b) return false;
        if (typeof a !== 'object') return false;
        return JSON.stringify(a) === JSON.stringify(b);
    }

    _generateId() {
        const arr = new Uint8Array(8);
        crypto.getRandomValues(arr);
        return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    }
}
