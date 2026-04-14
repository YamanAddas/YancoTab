/**
 * Tests for os/services/fileSystemService.js
 * Run with: node --test tests/file-system-service.test.js
 *
 * Uses an in-memory localStorage mock — no browser required.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── In-memory localStorage mock ─────────────────────────────────────────────
// Must be set up before any code that calls localStorage runs.
let _store;
function resetStore() { _store = new Map(); }

globalThis.localStorage = {
    getItem:    (k)    => _store.has(k) ? _store.get(k) : null,
    setItem:    (k, v) => _store.set(k, String(v)),
    removeItem: (k)    => _store.delete(k),
    clear:      ()     => _store.clear(),
    get length()       { return _store.size; },
    key:        (i)    => [..._store.keys()][i] ?? null,
};

// FileSystemService._save() calls window.dispatchEvent on quota errors
globalThis.window = { dispatchEvent: () => {} };

// ── Import after globals are set ─────────────────────────────────────────────
import { FileSystemService } from '../os/services/fileSystemService.js';

// ─────────────────────────────────────────────
// Helper: fresh FS + initialised directories
// ─────────────────────────────────────────────
function makeFs() {
    resetStore();
    const fs = new FileSystemService();
    fs.init(); // creates /home, /home/documents, /home/downloads, /home/trash
    return fs;
}

// ─────────────────────────────────────────────
// init / mkdir / exists
// ─────────────────────────────────────────────
describe('init & mkdir', () => {
    test('init creates standard directories', () => {
        const fs = makeFs();
        assert.ok(fs.exists('/home'),                'should create /home');
        assert.ok(fs.exists('/home/documents'),      'should create /home/documents');
        assert.ok(fs.exists('/home/downloads'),      'should create /home/downloads');
        assert.ok(fs.exists('/home/trash'),          'should create /home/trash');
    });

    test('mkdir does not overwrite an existing directory', () => {
        const fs = makeFs();
        const before = fs.read('/home');
        fs.mkdir('/home'); // no-op
        const after = fs.read('/home');
        assert.deepEqual(before, after);
    });

    test('mkdir creates a new directory entry', () => {
        const fs = makeFs();
        fs.mkdir('/home/custom');
        assert.ok(fs.exists('/home/custom'));
        const dir = fs.read('/home/custom');
        assert.equal(dir.type, 'directory');
        assert.equal(dir.path, '/home/custom');
    });
});

// ─────────────────────────────────────────────
// write / read / exists
// ─────────────────────────────────────────────
describe('write & read', () => {
    test('write creates a file that can be read back', () => {
        const fs = makeFs();
        fs.write('/home/documents/note.txt', 'hello world');
        const file = fs.read('/home/documents/note.txt');
        assert.equal(file.type, 'file');
        assert.equal(file.content, 'hello world');
        assert.equal(file.path, '/home/documents/note.txt');
    });

    test('read returns null for a non-existent path', () => {
        const fs = makeFs();
        assert.equal(fs.read('/home/documents/missing.txt'), null);
    });

    test('exists returns true for a written file', () => {
        const fs = makeFs();
        fs.write('/home/documents/exists.txt', '');
        assert.ok(fs.exists('/home/documents/exists.txt'));
    });

    test('exists returns false for a missing path', () => {
        const fs = makeFs();
        assert.ok(!fs.exists('/home/documents/ghost.txt'));
    });

    test('write sets created timestamp from meta when provided', () => {
        const fs = makeFs();
        const created = 1_000_000;
        fs.write('/home/documents/timed.txt', 'data', { created });
        const file = fs.read('/home/documents/timed.txt');
        assert.equal(file.meta.created, created);
    });

    test('write auto-sets created timestamp when not provided', () => {
        const fs = makeFs();
        fs.write('/home/documents/auto.txt', 'data');
        const file = fs.read('/home/documents/auto.txt');
        assert.ok(typeof file.meta.created === 'number');
        assert.ok(file.meta.created > 0);
    });

    test('write sets modified timestamp', () => {
        const fs = makeFs();
        fs.write('/home/documents/mod.txt', 'data');
        const file = fs.read('/home/documents/mod.txt');
        assert.ok(typeof file.meta.modified === 'number');
    });

    test('overwriting a file updates its content', () => {
        const fs = makeFs();
        fs.write('/home/documents/update.txt', 'v1');
        fs.write('/home/documents/update.txt', 'v2');
        assert.equal(fs.read('/home/documents/update.txt').content, 'v2');
    });
});

// ─────────────────────────────────────────────
// delete
// ─────────────────────────────────────────────
describe('delete', () => {
    test('deletes an existing file', () => {
        const fs = makeFs();
        fs.write('/home/documents/del.txt', 'bye');
        fs.delete('/home/documents/del.txt');
        assert.ok(!fs.exists('/home/documents/del.txt'));
    });

    test('delete is a no-op for non-existent path', () => {
        const fs = makeFs();
        // Should not throw
        fs.delete('/home/documents/nope.txt');
    });

    test('deleting a directory removes its children recursively', () => {
        const fs = makeFs();
        fs.mkdir('/home/documents/folder');
        fs.write('/home/documents/folder/a.txt', 'a');
        fs.write('/home/documents/folder/b.txt', 'b');
        fs.delete('/home/documents/folder');
        assert.ok(!fs.exists('/home/documents/folder'));
        assert.ok(!fs.exists('/home/documents/folder/a.txt'));
        assert.ok(!fs.exists('/home/documents/folder/b.txt'));
    });
});

// ─────────────────────────────────────────────
// rename
// ─────────────────────────────────────────────
describe('rename', () => {
    test('renames a file', () => {
        const fs = makeFs();
        fs.write('/home/documents/old.txt', 'content');
        fs.rename('/home/documents/old.txt', '/home/documents/new.txt');
        assert.ok(!fs.exists('/home/documents/old.txt'), 'old path should not exist');
        assert.ok(fs.exists('/home/documents/new.txt'),  'new path should exist');
        assert.equal(fs.read('/home/documents/new.txt').content, 'content');
    });

    test('rename updates the path field in the stored object', () => {
        const fs = makeFs();
        fs.write('/home/documents/a.txt', 'data');
        fs.rename('/home/documents/a.txt', '/home/documents/b.txt');
        assert.equal(fs.read('/home/documents/b.txt').path, '/home/documents/b.txt');
    });

    test('rename throws when source does not exist', () => {
        const fs = makeFs();
        assert.throws(
            () => fs.rename('/home/documents/ghost.txt', '/home/documents/new.txt'),
            /Source not found/
        );
    });

    test('rename throws when destination already exists', () => {
        const fs = makeFs();
        fs.write('/home/documents/a.txt', 'a');
        fs.write('/home/documents/b.txt', 'b');
        assert.throws(
            () => fs.rename('/home/documents/a.txt', '/home/documents/b.txt'),
            /Destination exists/
        );
    });

    test('rename throws for invalid (empty) paths', () => {
        const fs = makeFs();
        assert.throws(() => fs.rename('', '/home/documents/new.txt'), /Invalid path/);
        assert.throws(() => fs.rename('/home/documents/a.txt', ''), /Invalid path/);
    });

    test('renaming a directory renames all children', () => {
        const fs = makeFs();
        fs.mkdir('/home/documents/alpha');
        fs.write('/home/documents/alpha/a.txt', 'a');
        fs.write('/home/documents/alpha/b.txt', 'b');
        fs.rename('/home/documents/alpha', '/home/documents/beta');
        assert.ok(!fs.exists('/home/documents/alpha'));
        assert.ok(!fs.exists('/home/documents/alpha/a.txt'));
        assert.ok(fs.exists('/home/documents/beta'));
        assert.ok(fs.exists('/home/documents/beta/a.txt'));
        assert.ok(fs.exists('/home/documents/beta/b.txt'));
    });
});

// ─────────────────────────────────────────────
// list
// ─────────────────────────────────────────────
describe('list', () => {
    test('lists direct children of a directory', () => {
        const fs = makeFs();
        fs.write('/home/documents/a.txt', '');
        fs.write('/home/documents/b.txt', '');
        const items = fs.list('/home/documents');
        const paths = items.map(i => i.path).sort();
        assert.ok(paths.includes('/home/documents/a.txt'));
        assert.ok(paths.includes('/home/documents/b.txt'));
    });

    test('does not list grandchildren', () => {
        const fs = makeFs();
        fs.mkdir('/home/documents/sub');
        fs.write('/home/documents/sub/deep.txt', '');
        const items = fs.list('/home/documents');
        const paths = items.map(i => i.path);
        assert.ok(!paths.includes('/home/documents/sub/deep.txt'));
    });

    test('returns empty array for empty directory', () => {
        const fs = makeFs();
        // /home/trash is created by init but nothing is inside
        assert.deepEqual(fs.list('/home/trash'), []);
    });

    test('list works with trailing slash', () => {
        const fs = makeFs();
        fs.write('/home/documents/x.txt', '');
        const items = fs.list('/home/documents/');
        assert.equal(items.length, 1);
    });
});

// ─────────────────────────────────────────────
// search
// ─────────────────────────────────────────────
describe('search', () => {
    test('finds files matching query by name', () => {
        const fs = makeFs();
        fs.write('/home/documents/meeting-notes.txt', '');
        fs.write('/home/documents/todo.txt', '');
        const results = fs.search('meeting');
        assert.equal(results.length, 1);
        assert.equal(results[0].path, '/home/documents/meeting-notes.txt');
    });

    test('search is case-insensitive', () => {
        const fs = makeFs();
        fs.write('/home/documents/Meeting.txt', '');
        const results = fs.search('meeting');
        assert.equal(results.length, 1);
    });

    test('returns empty array for empty query', () => {
        const fs = makeFs();
        fs.write('/home/documents/a.txt', '');
        assert.deepEqual(fs.search(''), []);
    });

    test('returns empty array for no matches', () => {
        const fs = makeFs();
        fs.write('/home/documents/hello.txt', '');
        assert.deepEqual(fs.search('xyz123'), []);
    });

    test('matches partial filename', () => {
        const fs = makeFs();
        fs.write('/home/documents/my-project.txt', '');
        const results = fs.search('project');
        assert.equal(results.length, 1);
    });
});
