/**
 * YancoTab File System Service
 * A robust virtual file system backed by LocalStorage.
 * 
 * Features:
 * - JSON Persistence
 * - Directory Structure Simulation
 * - Rename/Move/Delete operations
 */

export class FileSystemService {
    constructor() {
        this.prefix = 'yancotab:fs:';
        this.root = '/home';
    }

    init() {
        console.log('[FileSystem] Initializing...');
        this.mkdir('/home');
        this.mkdir('/home/documents');
        this.mkdir('/home/downloads');
        this.mkdir('/home/photos');
        this.mkdir('/home/trash');
    }

    // --- Core Operations ---

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
        this._save(path, file);
        return true;
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

        // Handle Directory Rename (Recursive)
        if (item.type === 'directory') {
            const prefix = oldPath + '/';
            const children = this._listAll().filter(p => p.startsWith(prefix));
            children.forEach(childPath => {
                const child = this._load(childPath);
                // Anchored replacement: only replace the leading oldPath portion
                const newChildPath = newPath + childPath.slice(oldPath.length);
                child.path = newChildPath;
                this._save(newChildPath, child);
                localStorage.removeItem(this._key(childPath));
            });
        }

        // Move Item
        item.path = newPath;
        this._save(newPath, item);
        localStorage.removeItem(this._key(oldPath));
    }

    mkdir(path) {
        if (this.exists(path)) return;
        const dir = {
            type: 'directory',
            path,
            meta: { created: Date.now() }
        };
        this._save(path, dir);
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

    _save(path, data) {
        try {
            localStorage.setItem(this._key(path), JSON.stringify(data));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
                console.error('[FS] Storage quota exceeded:', e);
                // Dispatch event so the UI layer can handle gracefully
                window.dispatchEvent(new CustomEvent('yancotab:storage-full', { detail: { path } }));
            } else {
                console.error('[FS] Write Error:', e);
            }
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
