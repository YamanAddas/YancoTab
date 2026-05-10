/**
 * pdfStore — IndexedDB-backed storage for PDF documents, view state,
 * annotations, and per-doc text search indexes.
 *
 * Why IDB and not localStorage / FilesApp:
 *   localStorage caps at ~5–10 MB total per origin and stores strings
 *   only — base64-encoding a PDF blows the cap on the first import.
 *   IDB stores Blobs natively, supports gigabytes per origin under
 *   "best effort" mode (and is never evicted under "persistent" mode),
 *   and is per-origin scoped — IDB data never reaches chrome.storage.sync.
 *
 * Schema (db `yancotab_pdf_v1` / version 1):
 *   documents      keyPath 'id'
 *   viewState      keyPath 'docId'
 *   annotations    autoIncrement, indexes byDoc / byDocPage / byKind
 *   searchIndex    keyPath 'docId'
 *
 * Public API is Promise-based; never throws on "not found" — returns
 * null. Throws PdfStoreQuotaError on QuotaExceededError so callers
 * can pattern-match without sniffing strings.
 */

const DB_NAME = 'yancotab_pdf_v1';
const DB_VERSION = 2;

const STORE_DOCUMENTS    = 'documents';
const STORE_VIEW_STATE   = 'viewState';
const STORE_ANNOTATIONS  = 'annotations';
const STORE_SEARCH_INDEX = 'searchIndex';
const STORE_QUOTES       = 'quotes';

export class PdfStoreQuotaError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'PdfStoreQuotaError';
        if (cause) this.cause = cause;
    }
}

export class PdfStore {
    constructor() {
        this._db = null;
        this._opening = null;
    }

    // ─── lifecycle ──────────────────────────────────────────────

    /** Idempotent. Resolves once the DB is ready. */
    open() {
        if (this._db) return Promise.resolve(this._db);
        if (this._opening) return this._opening;

        this._opening = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => this._upgrade(e.target.result, e.oldVersion);
            req.onsuccess = () => {
                this._db = req.result;
                this._db.onversionchange = () => {
                    // Another tab requested an upgrade — close so it can proceed.
                    try { this._db.close(); } catch { /* ignore */ }
                    this._db = null;
                };
                resolve(this._db);
            };
            req.onerror = () => reject(req.error || new Error('IDB open failed'));
            req.onblocked = () => reject(new Error('IDB open blocked by another tab'));
        });

        return this._opening;
    }

    close() {
        if (this._db) {
            try { this._db.close(); } catch { /* ignore */ }
            this._db = null;
        }
        this._opening = null;
    }

    _upgrade(db, oldVersion) {
        if (oldVersion < 1) {
            const docs = db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
            docs.createIndex('byImportedAt', 'importedAt');
            docs.createIndex('byMtime', 'mtime');
            docs.createIndex('bySourcePath', 'sourcePath');

            db.createObjectStore(STORE_VIEW_STATE, { keyPath: 'docId' });

            const anns = db.createObjectStore(STORE_ANNOTATIONS, { keyPath: 'id', autoIncrement: true });
            anns.createIndex('byDoc', 'docId');
            anns.createIndex('byDocPage', ['docId', 'page']);
            anns.createIndex('byKind', ['docId', 'kind']);

            db.createObjectStore(STORE_SEARCH_INDEX, { keyPath: 'docId' });
        }
        if (oldVersion < 2) {
            const q = db.createObjectStore(STORE_QUOTES, { keyPath: 'id', autoIncrement: true });
            q.createIndex('byDoc', 'docId');
            q.createIndex('byAddedAt', 'addedAt');
        }
    }

    // ─── helpers ────────────────────────────────────────────────

    async _tx(stores, mode, fn) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const list = Array.isArray(stores) ? stores : [stores];
            let tx;
            try {
                tx = db.transaction(list, mode);
            } catch (e) {
                reject(e);
                return;
            }
            let result;
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(this._wrapError(tx.error));
            tx.onabort = () => reject(this._wrapError(tx.error || new Error('IDB transaction aborted')));
            try {
                Promise.resolve(fn(tx)).then((r) => { result = r; }).catch(reject);
            } catch (e) {
                reject(e);
            }
        });
    }

    _wrapError(err) {
        if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
            return new PdfStoreQuotaError('Storage quota exceeded', err);
        }
        return err || new Error('IDB error');
    }

    _request(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(this._wrapError(req.error));
        });
    }

    _genId() {
        const t = Date.now().toString(36);
        const r = Math.random().toString(36).slice(2, 8);
        return `doc-${t}-${r}`;
    }

    // ─── documents ──────────────────────────────────────────────

    /**
     * @param {Blob} blob — PDF blob (application/pdf)
     * @param {string} name — display name
     * @param {object} [meta] — optional { sourcePath, tags, mtime }
     * @returns {Promise<object>} the stored metadata (without blob)
     */
    async addDocument(blob, name, meta = {}) {
        if (!(blob instanceof Blob) && !(typeof Blob !== 'undefined' && blob && blob.constructor?.name === 'Blob')) {
            throw new TypeError('addDocument expects a Blob');
        }
        const now = Date.now();
        const record = {
            id: meta.id || this._genId(),
            name: String(name || 'Untitled.pdf'),
            sizeBytes: blob.size,
            importedAt: now,
            mtime: meta.mtime || now,
            blob,
            sourcePath: meta.sourcePath || null,
            tags: Array.isArray(meta.tags) ? meta.tags.slice(0) : [],
            pageCount: meta.pageCount || null,
            thumbnailDataUrl: meta.thumbnailDataUrl || null,
        };
        await this._tx(STORE_DOCUMENTS, 'readwrite', (tx) => {
            return this._request(tx.objectStore(STORE_DOCUMENTS).put(record));
        });
        const { blob: _omit, ...metaOnly } = record;
        return metaOnly;
    }

    /**
     * @param {object} [opts] — { sort: 'importedAt'|'mtime'|'name'|'size', limit }
     * @returns {Promise<Array>} array of metadata records (no blob)
     */
    async listDocuments(opts = {}) {
        const sort = opts.sort || 'importedAt';
        const limit = Number.isFinite(opts.limit) ? opts.limit : null;
        const records = await this._tx(STORE_DOCUMENTS, 'readonly', (tx) => {
            return this._request(tx.objectStore(STORE_DOCUMENTS).getAll());
        });
        const out = records.map((r) => stripBlob(r));
        if (sort === 'name') out.sort((a, b) => String(a.name).localeCompare(b.name));
        else if (sort === 'size') out.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
        else if (sort === 'mtime') out.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        else out.sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
        return limit ? out.slice(0, limit) : out;
    }

    async getDocument(id) {
        if (!id) return null;
        return this._tx(STORE_DOCUMENTS, 'readonly', async (tx) => {
            const rec = await this._request(tx.objectStore(STORE_DOCUMENTS).get(id));
            return rec || null;
        });
    }

    async readBlob(id) {
        const doc = await this.getDocument(id);
        return doc?.blob || null;
    }

    async findBySourcePath(path) {
        if (!path) return null;
        return this._tx(STORE_DOCUMENTS, 'readonly', async (tx) => {
            const idx = tx.objectStore(STORE_DOCUMENTS).index('bySourcePath');
            const rec = await this._request(idx.get(path));
            return rec ? stripBlob(rec) : null;
        });
    }

    async updateMeta(id, patch) {
        if (!id || !patch) return null;
        return this._tx(STORE_DOCUMENTS, 'readwrite', async (tx) => {
            const store = tx.objectStore(STORE_DOCUMENTS);
            const cur = await this._request(store.get(id));
            if (!cur) return null;
            const next = { ...cur };
            for (const k of Object.keys(patch)) {
                if (k === 'id' || k === 'blob') continue; // immutable here
                next[k] = patch[k];
            }
            next.mtime = Date.now();
            await this._request(store.put(next));
            return stripBlob(next);
        });
    }

    async replaceContent(id, blob) {
        if (!id) return null;
        return this._tx(STORE_DOCUMENTS, 'readwrite', async (tx) => {
            const store = tx.objectStore(STORE_DOCUMENTS);
            const cur = await this._request(store.get(id));
            if (!cur) return null;
            const next = { ...cur, blob, sizeBytes: blob.size, mtime: Date.now() };
            await this._request(store.put(next));
            return stripBlob(next);
        });
    }

    async deleteDocument(id) {
        if (!id) return false;
        await this._tx(
            [STORE_DOCUMENTS, STORE_VIEW_STATE, STORE_ANNOTATIONS, STORE_SEARCH_INDEX, STORE_QUOTES],
            'readwrite',
            async (tx) => {
                await this._request(tx.objectStore(STORE_DOCUMENTS).delete(id));
                await this._request(tx.objectStore(STORE_VIEW_STATE).delete(id));
                await this._request(tx.objectStore(STORE_SEARCH_INDEX).delete(id));
                const walkByDoc = (storeName) => new Promise((resolve, reject) => {
                    const req = tx.objectStore(storeName).index('byDoc').openCursor(IDBKeyRange.only(id));
                    req.onsuccess = () => { const c = req.result; if (!c) { resolve(); return; } c.delete(); c.continue(); };
                    req.onerror = () => reject(this._wrapError(req.error));
                });
                await walkByDoc(STORE_ANNOTATIONS);
                await walkByDoc(STORE_QUOTES);
            },
        );
        return true;
    }

    // ─── view state ─────────────────────────────────────────────

    async getViewState(docId) {
        if (!docId) return null;
        return this._tx(STORE_VIEW_STATE, 'readonly', async (tx) => {
            const rec = await this._request(tx.objectStore(STORE_VIEW_STATE).get(docId));
            return rec || null;
        });
    }

    async saveViewState(docId, patch) {
        if (!docId) return null;
        return this._tx(STORE_VIEW_STATE, 'readwrite', async (tx) => {
            const store = tx.objectStore(STORE_VIEW_STATE);
            const cur = await this._request(store.get(docId));
            const next = { ...(cur || { docId }), ...patch, docId, lastOpenedAt: Date.now() };
            await this._request(store.put(next));
            return next;
        });
    }

    // ─── annotations ────────────────────────────────────────────

    async listAnnotations(docId) {
        if (!docId) return [];
        return this._tx(STORE_ANNOTATIONS, 'readonly', async (tx) => {
            const idx = tx.objectStore(STORE_ANNOTATIONS).index('byDoc');
            return this._request(idx.getAll(IDBKeyRange.only(docId)));
        });
    }

    async listAnnotationsOnPage(docId, page) {
        if (!docId || !Number.isFinite(page)) return [];
        return this._tx(STORE_ANNOTATIONS, 'readonly', async (tx) => {
            const idx = tx.objectStore(STORE_ANNOTATIONS).index('byDocPage');
            return this._request(idx.getAll(IDBKeyRange.only([docId, page])));
        });
    }

    async listAnnotationsByKind(docId, kind) {
        if (!docId || !kind) return [];
        return this._tx(STORE_ANNOTATIONS, 'readonly', async (tx) => {
            const idx = tx.objectStore(STORE_ANNOTATIONS).index('byKind');
            return this._request(idx.getAll(IDBKeyRange.only([docId, kind])));
        });
    }

    async addAnnotation(docId, ann) {
        if (!docId || !ann) return null;
        return this._tx(STORE_ANNOTATIONS, 'readwrite', async (tx) => {
            const now = Date.now();
            const record = {
                ...ann, docId,
                createdAt: ann.createdAt || now,
                modifiedAt: now,
            };
            delete record.id; // autoIncrement assigns
            const id = await this._request(tx.objectStore(STORE_ANNOTATIONS).add(record));
            return { ...record, id };
        });
    }

    async updateAnnotation(id, patch) {
        if (!id || !patch) return null;
        return this._tx(STORE_ANNOTATIONS, 'readwrite', async (tx) => {
            const store = tx.objectStore(STORE_ANNOTATIONS);
            const cur = await this._request(store.get(id));
            if (!cur) return null;
            const next = { ...cur, ...patch, id, docId: cur.docId, modifiedAt: Date.now() };
            await this._request(store.put(next));
            return next;
        });
    }

    async deleteAnnotation(id) {
        if (!id) return false;
        await this._tx(STORE_ANNOTATIONS, 'readwrite', (tx) => {
            return this._request(tx.objectStore(STORE_ANNOTATIONS).delete(id));
        });
        return true;
    }

    async deleteAnnotationsForDoc(docId) {
        if (!docId) return 0;
        let count = 0;
        await this._tx(STORE_ANNOTATIONS, 'readwrite', async (tx) => {
            const idx = tx.objectStore(STORE_ANNOTATIONS).index('byDoc');
            await new Promise((resolve, reject) => {
                const req = idx.openCursor(IDBKeyRange.only(docId));
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) { resolve(); return; }
                    cur.delete();
                    count++;
                    cur.continue();
                };
                req.onerror = () => reject(this._wrapError(req.error));
            });
        });
        return count;
    }

    // ─── search index ───────────────────────────────────────────

    async getSearchIndex(docId) {
        if (!docId) return null;
        return this._tx(STORE_SEARCH_INDEX, 'readonly', async (tx) => {
            const rec = await this._request(tx.objectStore(STORE_SEARCH_INDEX).get(docId));
            return rec || null;
        });
    }

    async saveSearchIndex(docId, pages) {
        if (!docId || !Array.isArray(pages)) return null;
        return this._tx(STORE_SEARCH_INDEX, 'readwrite', async (tx) => {
            const bytes = pages.reduce((s, p) => s + (p?.length || 0), 0);
            const record = { docId, pages, builtAt: Date.now(), pageCount: pages.length, bytes };
            await this._request(tx.objectStore(STORE_SEARCH_INDEX).put(record));
            return record;
        });
    }

    async deleteSearchIndex(docId) {
        if (!docId) return false;
        await this._tx(STORE_SEARCH_INDEX, 'readwrite', (tx) => {
            return this._request(tx.objectStore(STORE_SEARCH_INDEX).delete(docId));
        });
        return true;
    }

    // ─── quota ──────────────────────────────────────────────────

    async estimateQuota() {
        try {
            if (navigator?.storage?.estimate) {
                const { usage = null, quota = null } = await navigator.storage.estimate();
                let persistent = false;
                try { persistent = await navigator.storage.persisted?.() || false; } catch { /* ignore */ }
                return { usage, quota, persistent };
            }
        } catch { /* ignore */ }
        return { usage: null, quota: null, persistent: false };
    }

    async requestPersistence() {
        try {
            if (navigator?.storage?.persist) {
                return Boolean(await navigator.storage.persist());
            }
        } catch { /* ignore */ }
        return false;
    }

    // ─── quote vault ────────────────────────────────────────────

    /**
     * Save a quoted passage to the vault.
     * @param {string} docId
     * @param {{ text, page, docTitle, color? }} entry
     * @returns {Promise<object>} saved record with auto-assigned id
     */
    async saveQuote(docId, entry) {
        if (!docId || !entry?.text) return null;
        const VALID_COLORS = ['accent', 'warm', 'rose', 'violet', 'cool'];
        return this._tx(STORE_QUOTES, 'readwrite', async (tx) => {
            const record = {
                docId,
                docTitle: String(entry.docTitle || '').trim(),
                page: Number.isFinite(entry.page) ? Math.floor(entry.page) : null,
                text: String(entry.text).slice(0, 1200).trim(),
                color: VALID_COLORS.includes(entry.color) ? entry.color : 'accent',
                addedAt: Date.now(),
            };
            const id = await this._request(tx.objectStore(STORE_QUOTES).add(record));
            return { ...record, id };
        });
    }

    /**
     * List saved quotes, newest first.
     * @param {string} [docId] — if provided, filter to one doc; otherwise all docs
     */
    async listQuotes(docId) {
        return this._tx(STORE_QUOTES, 'readonly', async (tx) => {
            let records;
            if (docId) {
                const idx = tx.objectStore(STORE_QUOTES).index('byDoc');
                records = await this._request(idx.getAll(IDBKeyRange.only(docId)));
            } else {
                records = await this._request(tx.objectStore(STORE_QUOTES).getAll());
            }
            return records.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        });
    }

    async deleteQuote(id) {
        if (!id) return false;
        await this._tx(STORE_QUOTES, 'readwrite', (tx) =>
            this._request(tx.objectStore(STORE_QUOTES).delete(id)));
        return true;
    }
}

function stripBlob(record) {
    if (!record) return record;
    const { blob: _b, ...rest } = record;
    return rest;
}
