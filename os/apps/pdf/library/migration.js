/**
 * pdf/library/migration.js — one-shot migration from v1 (FilesApp +
 * localStorage) to v2 (pdfStore IDB).
 *
 * Idempotent: gated by `yancotab_pdf_migrated_v2` so it only runs once.
 * On every subsequent boot, this module is a no-op.
 *
 * What it does, in order:
 *   1. Read `yancotab_pdf_recent` (legacy shape: [{name, path, openedAt}]).
 *      Each entry references a PDF stored in FilesApp (data URL inside
 *      localStorage).
 *   2. Back the legacy list up to `yancotab_pdf_recent_pre_v2` so a user
 *      can recover if the migration goes wrong.
 *   3. For each entry whose FilesApp path still resolves:
 *        - decode the data URL to a Blob,
 *        - call pdfStore.addDocument(blob, name, { sourcePath: path }),
 *        - record a v2 recent entry { docId, openedAt }.
 *   4. Write back the v2 recents list.
 *   5. Set `yancotab_pdf_migrated_v2 = true`.
 *
 * Pure(ish) — IO is injected so tests can drive the migration without
 * touching real localStorage / IDB.
 */

const FLAG_KEY = 'yancotab_pdf_migrated_v2';
const RECENTS_KEY = 'yancotab_pdf_recent';
const BACKUP_KEY = 'yancotab_pdf_recent_pre_v2';

/**
 * @typedef {object} MigrationIO
 * @property {(key: string) => any} loadStorage
 * @property {(key: string, value: any) => void} saveStorage
 * @property {(path: string) => null | { content: string, meta?: object }} readFile
 * @property {(path: string) => boolean} fileExists
 * @property {(blob: Blob, name: string, meta?: object) => Promise<{id: string}>} addDocument
 * @property {(path: string) => Promise<null | { id: string }>} findDocBySourcePath
 * @property {(msg: string, ...args: any[]) => void} [warn]
 */

/**
 * @returns {Promise<{ ranAt?: number, migrated: number, skipped: number, errors: number, alreadyDone?: boolean }>}
 */
export async function migrateIfNeeded(io) {
    if (io.loadStorage(FLAG_KEY) === true) {
        return { alreadyDone: true, migrated: 0, skipped: 0, errors: 0 };
    }
    return runMigration(io);
}

/** Force a migration run (test entry — bypasses the idempotency flag). */
export async function runMigration(io) {
    const warn = io.warn || (() => {});
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    const legacyRecents = io.loadStorage(RECENTS_KEY);
    const sourceList = Array.isArray(legacyRecents) ? legacyRecents : [];

    // Back up the v1 list verbatim before touching anything.
    if (sourceList.length > 0) {
        try { io.saveStorage(BACKUP_KEY, sourceList); }
        catch (e) { warn('migration: backup failed', e); }
    }

    const v2Recents = [];

    for (const entry of sourceList) {
        if (!entry || typeof entry !== 'object') { skipped++; continue; }

        // Already v2 shape? Pass through unchanged.
        if (typeof entry.docId === 'string' && entry.docId) {
            v2Recents.push({
                docId: entry.docId,
                openedAt: Number.isFinite(entry.openedAt) ? entry.openedAt : Date.now(),
            });
            skipped++;
            continue;
        }

        // v1 shape: { name, path, openedAt }
        const path = entry.path;
        const name = entry.name || basename(path);
        if (!path || !name) { skipped++; continue; }

        if (!io.fileExists(path)) {
            // Stale recent — file was deleted from FilesApp before
            // migration. Drop it.
            skipped++;
            continue;
        }

        // Has it already been imported under this sourcePath? (Migration
        // re-runs after a partial failure should be idempotent.)
        try {
            const existing = await io.findDocBySourcePath(path);
            if (existing && existing.id) {
                v2Recents.push({ docId: existing.id, openedAt: entry.openedAt || Date.now() });
                skipped++;
                continue;
            }
        } catch (e) {
            warn('migration: findDocBySourcePath failed', path, e);
        }

        try {
            const file = io.readFile(path);
            if (!file || typeof file.content !== 'string') {
                skipped++;
                continue;
            }
            const blob = await dataUrlToBlob(file.content);
            if (!blob) { skipped++; continue; }
            const meta = await io.addDocument(blob, name, { sourcePath: path });
            if (meta && meta.id) {
                v2Recents.push({ docId: meta.id, openedAt: entry.openedAt || Date.now() });
                migrated++;
            } else {
                skipped++;
            }
        } catch (e) {
            warn('migration: addDocument failed', path, e);
            errors++;
        }
    }

    try { io.saveStorage(RECENTS_KEY, v2Recents); }
    catch (e) { warn('migration: writing v2 recents failed', e); errors++; }

    try { io.saveStorage(FLAG_KEY, true); }
    catch (e) { warn('migration: setting flag failed', e); errors++; }

    return { ranAt: Date.now(), migrated, skipped, errors };
}

/** Convert a data: URL into a Blob. Returns null on parse failure. */
export async function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    try {
        // Prefer fetch() — handles base64 / non-base64 / charset uniformly.
        if (typeof fetch === 'function') {
            const res = await fetch(dataUrl);
            return await res.blob();
        }
    } catch { /* fall through to manual decode */ }

    // Manual fallback (test environments without fetch / Blob).
    try {
        const comma = dataUrl.indexOf(',');
        if (comma < 0) return null;
        const meta = dataUrl.slice(5, comma); // drop "data:"
        const body = dataUrl.slice(comma + 1);
        const isBase64 = /;base64/i.test(meta);
        const mime = meta.split(';')[0] || 'application/octet-stream';
        if (typeof Blob === 'undefined' || typeof atob === 'undefined') return null;
        if (isBase64) {
            const bin = atob(body);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
        }
        return new Blob([decodeURIComponent(body)], { type: mime });
    } catch {
        return null;
    }
}

function basename(p) {
    if (!p) return '';
    return String(p).split('/').pop() || '';
}

export const __MIGRATION_KEYS__ = Object.freeze({
    FLAG: FLAG_KEY,
    RECENTS: RECENTS_KEY,
    BACKUP: BACKUP_KEY,
});
