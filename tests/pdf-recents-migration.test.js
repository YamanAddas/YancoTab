/**
 * Tests for os/apps/pdf/library/migration.js
 *
 * Migration is pure-ish — IO is injected. We hand it fake storage,
 * fake FilesApp, and a fake addDocument and confirm:
 *   - v1 entries with valid FilesApp paths get migrated to v2 docIds
 *   - the original list is backed up to the *_pre_v2 key
 *   - the flag is set after a successful run, and second runs no-op
 *   - findBySourcePath de-dupes a re-run
 *   - stale paths (FilesApp doesn't have them) are dropped, not errored
 *   - already-v2 entries pass through unchanged
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { migrateIfNeeded, runMigration, dataUrlToBlob, __MIGRATION_KEYS__ } from '../os/apps/pdf/library/migration.js';

function makeIO({ recents = null, files = {}, existing = {} } = {}) {
    const storage = new Map();
    if (recents !== undefined) storage.set(__MIGRATION_KEYS__.RECENTS, recents);

    const docsByPath = new Map(Object.entries(existing));
    const added = [];
    let nextId = 1;

    return {
        storage,
        added,
        io: {
            loadStorage: (k) => storage.has(k) ? storage.get(k) : null,
            saveStorage: (k, v) => { storage.set(k, v); },
            readFile: (path) => files[path] || null,
            fileExists: (path) => Object.prototype.hasOwnProperty.call(files, path),
            findDocBySourcePath: async (path) => docsByPath.get(path) || null,
            addDocument: async (blob, name, meta) => {
                const id = `doc-${nextId++}`;
                const rec = { id, name, sourcePath: meta?.sourcePath || null, sizeBytes: blob?.size ?? 0 };
                added.push(rec);
                docsByPath.set(rec.sourcePath, rec);
                return rec;
            },
            warn: () => {},
        },
    };
}

const PDF_DATAURL = 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MK';

describe('migrateIfNeeded — gating', () => {
    test('returns alreadyDone when flag set', async () => {
        const { io, storage } = makeIO();
        storage.set(__MIGRATION_KEYS__.FLAG, true);
        const r = await migrateIfNeeded(io);
        assert.deepEqual(r, { alreadyDone: true, migrated: 0, skipped: 0, errors: 0 });
    });

    test('runs when flag is not set', async () => {
        const { io } = makeIO({ recents: [] });
        const r = await migrateIfNeeded(io);
        assert.equal(r.alreadyDone, undefined);
        assert.equal(r.migrated, 0);
    });
});

describe('runMigration — backup', () => {
    test('writes legacy list to _pre_v2 key when non-empty', async () => {
        const recents = [{ name: 'a.pdf', path: '/home/documents/a.pdf', openedAt: 1 }];
        const { io, storage } = makeIO({
            recents,
            files: {
                '/home/documents/a.pdf': { content: PDF_DATAURL },
            },
        });
        await runMigration(io);
        assert.deepEqual(storage.get(__MIGRATION_KEYS__.BACKUP), recents);
    });

    test('does not write _pre_v2 when no legacy entries', async () => {
        const { io, storage } = makeIO({ recents: [] });
        await runMigration(io);
        assert.equal(storage.has(__MIGRATION_KEYS__.BACKUP), false);
    });
});

describe('runMigration — entry handling', () => {
    test('valid entry migrates and produces v2 record', async () => {
        const { io, storage, added } = makeIO({
            recents: [{ name: 'snow.pdf', path: '/home/documents/snow.pdf', openedAt: 1234 }],
            files: { '/home/documents/snow.pdf': { content: PDF_DATAURL } },
        });
        const r = await runMigration(io);
        assert.equal(r.migrated, 1);
        assert.equal(r.skipped, 0);
        assert.equal(added.length, 1);
        const out = storage.get(__MIGRATION_KEYS__.RECENTS);
        assert.equal(out.length, 1);
        assert.equal(typeof out[0].docId, 'string');
        assert.equal(out[0].openedAt, 1234);
    });

    test('stale path is dropped without error', async () => {
        const { io, storage, added } = makeIO({
            recents: [{ name: 'gone.pdf', path: '/home/documents/gone.pdf', openedAt: 1 }],
            files: {},
        });
        const r = await runMigration(io);
        assert.equal(r.migrated, 0);
        assert.equal(r.skipped, 1);
        assert.equal(added.length, 0);
        assert.deepEqual(storage.get(__MIGRATION_KEYS__.RECENTS), []);
    });

    test('already-v2 entry passes through unchanged', async () => {
        const { io, storage, added } = makeIO({
            recents: [{ docId: 'doc-existing', openedAt: 5555 }],
            files: {},
        });
        const r = await runMigration(io);
        assert.equal(r.skipped, 1);
        assert.equal(added.length, 0);
        assert.deepEqual(storage.get(__MIGRATION_KEYS__.RECENTS), [{ docId: 'doc-existing', openedAt: 5555 }]);
    });

    test('mixed list: drops stale, migrates v1, passes v2', async () => {
        const { io, storage, added } = makeIO({
            recents: [
                { name: 'a.pdf', path: '/home/documents/a.pdf', openedAt: 100 },
                { name: 'gone.pdf', path: '/home/documents/gone.pdf', openedAt: 200 },
                { docId: 'doc-x', openedAt: 300 },
            ],
            files: {
                '/home/documents/a.pdf': { content: PDF_DATAURL },
            },
        });
        const r = await runMigration(io);
        assert.equal(r.migrated, 1);
        assert.equal(r.skipped, 2);
        const out = storage.get(__MIGRATION_KEYS__.RECENTS);
        assert.equal(out.length, 2);
        const docIds = out.map((x) => x.docId);
        assert.ok(docIds.includes('doc-x'));
        assert.ok(docIds.some((id) => id !== 'doc-x'));
        assert.equal(added.length, 1);
    });
});

describe('runMigration — idempotency', () => {
    test('second run uses findBySourcePath instead of re-importing', async () => {
        const recents = [{ name: 'a.pdf', path: '/home/documents/a.pdf', openedAt: 1 }];
        const files = { '/home/documents/a.pdf': { content: PDF_DATAURL } };
        const { io: io1, added: added1 } = makeIO({ recents, files });
        const r1 = await runMigration(io1);
        assert.equal(r1.migrated, 1);
        assert.equal(added1.length, 1);

        // Simulate re-run: legacy recents still present, but doc is now
        // in pdfStore. findBySourcePath should hit, addDocument should not.
        const { io: io2, added: added2 } = makeIO({
            recents,
            files,
            existing: { '/home/documents/a.pdf': { id: 'doc-existing' } },
        });
        const r2 = await runMigration(io2);
        assert.equal(r2.migrated, 0);
        assert.equal(r2.skipped, 1);
        assert.equal(added2.length, 0);
    });

    test('flag is set after run completes', async () => {
        const { io, storage } = makeIO({ recents: [] });
        await runMigration(io);
        assert.equal(storage.get(__MIGRATION_KEYS__.FLAG), true);
    });
});

describe('runMigration — error handling', () => {
    test('addDocument failure increments errors and skips', async () => {
        const recents = [{ name: 'a.pdf', path: '/home/documents/a.pdf', openedAt: 1 }];
        const io = {
            loadStorage: (k) => k === __MIGRATION_KEYS__.RECENTS ? recents : null,
            saveStorage: () => {},
            readFile: () => ({ content: PDF_DATAURL }),
            fileExists: () => true,
            findDocBySourcePath: async () => null,
            addDocument: async () => { throw new Error('quota'); },
            warn: () => {},
        };
        const r = await runMigration(io);
        assert.equal(r.migrated, 0);
        assert.equal(r.errors, 1);
    });
});

describe('dataUrlToBlob', () => {
    test('returns null for non-data URLs', async () => {
        assert.equal(await dataUrlToBlob('https://example.com'), null);
        assert.equal(await dataUrlToBlob(''), null);
        assert.equal(await dataUrlToBlob(null), null);
    });

    test('parses base64 data URL into a Blob', async () => {
        const blob = await dataUrlToBlob(PDF_DATAURL);
        assert.ok(blob);
        assert.equal(blob.type, 'application/pdf');
        // Magic bytes: %PDF-
        const buf = new Uint8Array(await blob.arrayBuffer());
        assert.equal(buf[0], 0x25);
        assert.equal(buf[1], 0x50);
        assert.equal(buf[2], 0x44);
        assert.equal(buf[3], 0x46);
        assert.equal(buf[4], 0x2D);
    });
});
