/**
 * YancoTab File System Service
 * A robust virtual file system backed by LocalStorage.
 * 
 * Features:
 * - JSON Persistence
 * - Directory Structure Simulation
 * - Rename/Move/Delete operations
 */

import { dlog } from '../utils/debugLog.js';

export class FileSystemService {
    constructor() {
        this.prefix = 'yancotab:fs:';
        this.root = '/home';
    }

    init() {
        dlog('[FileSystem] Initializing...');
        this.mkdir('/home');
        this.mkdir('/home/documents');
        this.mkdir('/home/downloads');
        this.mkdir('/home/photos');
        this.mkdir('/home/trash');
    }

    // --- Core Operations ---

    /**
     * Write a file. Returns true on success and FALSE when the write was
     * refused (storage full) — it does not throw, because the hot caller
     * is Notes' 300ms autosave and a throw there would surface as an
     * unhandled rejection on every keystroke. The shell turns the
     * storage-full event into a toast; callers that render their own
     * save state should check this return.
     */
    write(path, content, meta = {}) {
        const file = {
            type: 'file',
            path,
            content,
            meta: {
                ...meta,
                created: meta.created || Date.now(),
                modified: Date.now()
            }
        };
        return this._save(path, file);
    }

    read(path) {
        return this._load(path);
    }

    delete(path) {
        const item = this._load(path);
        if (!item) return;

        if (item.type === 'directory') {
            // Recursive delete
            const children = this.list(path);
            children.forEach(child => this.delete(child.path));
        }
        localStorage.removeItem(this._key(path));
    }

    rename(oldPath, newPath) {
        if (!oldPath || !newPath) throw new Error('Invalid path');
        if (!this.exists(oldPath)) throw new Error('Source not found');
        if (this.exists(newPath)) throw new Error('Destination exists');

        const item = this._load(oldPath);

        // Rename is copy-then-delete, so a refused copy must ABORT before
        // the delete. Otherwise a full disk does not merely fail to
        // rename — it destroys the file: the new copy never lands and the
        // original is removed anyway. Throwing is right here (unlike
        // write(), which returns false): the callers already wrap rename
        // in try/catch and toast "Rename failed", and the alternative is
        // silent deletion.
        const FULL = 'Storage full — rename aborted to avoid losing the file';

        // Handle Directory Rename (Recursive)
        if (item.type === 'directory') {
            const prefix = oldPath + '/';
            const children = this._listAll().filter(p => p.startsWith(prefix));
            for (const childPath of children) {
                const child = this._load(childPath);
                // Anchored replacement: only replace the leading oldPath portion
                const newChildPath = newPath + childPath.slice(oldPath.length);
                child.path = newChildPath;
                if (!this._save(newChildPath, child)) throw new Error(FULL);
                localStorage.removeItem(this._key(childPath));
            }
        }

        // Move Item
        item.path = newPath;
        if (!this._save(newPath, item)) throw new Error(FULL);
        localStorage.removeItem(this._key(oldPath));
    }

    /** Returns true if the directory exists after the call. */
    mkdir(path) {
        if (this.exists(path)) return true;
        const dir = {
            type: 'directory',
            path,
            meta: { created: Date.now() }
        };
        return this._save(path, dir);
    }

    list(dirPath) {
        const searchPath = dirPath.endsWith('/') ? dirPath : dirPath + '/';
        const items = [];
        const allKeys = this._listAllKeys();

        allKeys.forEach(key => {
            const path = key.replace(this.prefix, '');
            // Direct child check: starts with dir/ AND has no deeper slashes
            if (path.startsWith(searchPath) && path !== dirPath) {
                const relative = path.substring(searchPath.length);
                if (!relative.includes('/')) {
                    const item = this._load(path);
                    if (item) items.push(item);
                }
            }
        });
        return items;
    }

    exists(path) {
        return localStorage.getItem(this._key(path)) !== null;
    }

    search(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        const results = [];
        const allKeys = this._listAllKeys();

        allKeys.forEach(key => {
            const path = key.replace(this.prefix, '');
            // Simple name match for now
            const name = path.split('/').pop();
            if (name.toLowerCase().includes(q)) {
                const item = this._load(path);
                if (item) results.push(item);
            }
        });
        return results;
    }

    // --- Helpers ---

    _key(path) { return this.prefix + path; }

    /**
     * Persist one node. Returns true on success, false when the write
     * was refused (quota) or otherwise failed.
     *
     * Every FS write funnels through here, so this return value is the
     * only thing standing between a full disk and silent data loss.
     * Before v1.10.7 it swallowed QuotaExceededError and returned
     * undefined while write() reported success regardless — a note
     * autosave, a file rename or a PDF import could fail with the user
     * told it worked.
     *
     * The `yancotab:storage-full` event is dispatched for the UI to
     * surface; mobileShell bridges it to a toast. It had no listener at
     * all for its entire life, which is the other half of the same bug.
     */
    _save(path, data) {
        try {
            localStorage.setItem(this._key(path), JSON.stringify(data));
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
                console.error('[FS] Storage quota exceeded:', e);
                try {
                    window.dispatchEvent(new CustomEvent('yancotab:storage-full', { detail: { path } }));
                } catch { /* no window (tests, workers) */ }
            } else {
                console.error('[FS] Write Error:', e);
            }
            return false;
        }
    }

    _load(path) {
        try {
            return JSON.parse(localStorage.getItem(this._key(path)));
        } catch (e) { return null; }
    }

    _listAll() {
        return this._listAllKeys().map(k => k.replace(this.prefix, ''));
    }

    _listAllKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.prefix)) keys.push(key);
        }
        return keys;
    }
}
