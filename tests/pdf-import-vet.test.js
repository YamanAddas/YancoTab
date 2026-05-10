/**
 * Tests for os/apps/pdf/library/importExport.js — pure validation paths.
 *
 * Covers `vetImport` and `isPdfBlob`. Skips DOM-dependent helpers
 * (pickFileToImport, downloadBlob) since they need a real browser.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { vetImport, isPdfBlob, PdfImportError, __TEST__ } from '../os/apps/pdf/library/importExport.js';

function pdfBlob(payload = '%PDF-1.4\nfoo\n') {
    return new Blob([payload], { type: 'application/pdf' });
}

function fakeBlob(size, mime = 'application/pdf', payload = '%PDF-1.4\nfoo') {
    // Pad / truncate to the requested size while keeping the magic header.
    const head = '%PDF-';
    let body = payload;
    if (size <= head.length) body = head.slice(0, size);
    else body = head + 'X'.repeat(Math.max(0, size - head.length));
    return new Blob([body], { type: mime });
}

describe('isPdfBlob', () => {
    test('accepts blobs starting with %PDF-', async () => {
        const blob = pdfBlob();
        assert.equal(await isPdfBlob(blob), true);
    });

    test('rejects blobs without the magic prefix', async () => {
        const blob = new Blob(['<html>not a pdf</html>'], { type: 'text/html' });
        assert.equal(await isPdfBlob(blob), false);
    });

    test('rejects empty blobs', async () => {
        const blob = new Blob([], { type: 'application/pdf' });
        assert.equal(await isPdfBlob(blob), false);
    });

    test('rejects null / non-blob input', async () => {
        assert.equal(await isPdfBlob(null), false);
        assert.equal(await isPdfBlob({}), false);
        assert.equal(await isPdfBlob(undefined), false);
    });
});

describe('vetImport', () => {
    test('accepts a small valid PDF', async () => {
        const r = await vetImport(pdfBlob(), 'a.pdf');
        assert.equal(r.needsConfirm, false);
    });

    test('rejects bogus content with bad_magic', async () => {
        const blob = new Blob(['JUNK'], { type: 'application/pdf' });
        await assert.rejects(() => vetImport(blob, 'fake.pdf'), (err) => {
            assert.equal(err instanceof PdfImportError, true);
            assert.equal(err.code, 'bad_magic');
            return true;
        });
    });

    test('rejects null with no_file', async () => {
        await assert.rejects(() => vetImport(null, 'x'), (err) => {
            assert.equal(err.code, 'no_file');
            return true;
        });
    });

    test('refuses files above hard limit', async () => {
        // Synthesize a minimal blob that lies about its size — Node's Blob
        // doesn't fake size cheaply, so we use a real allocation just over
        // the limit. To avoid OOM in tests, we mock the size getter.
        const blob = pdfBlob();
        Object.defineProperty(blob, 'size', { value: __TEST__.HARD_LIMIT_BYTES + 1, configurable: true });
        await assert.rejects(() => vetImport(blob, 'huge.pdf'), (err) => {
            assert.equal(err.code, 'too_large');
            return true;
        });
    });

    test('soft-warns above 500 MB threshold', async () => {
        const blob = pdfBlob();
        Object.defineProperty(blob, 'size', { value: __TEST__.SOFT_WARN_BYTES + 1, configurable: true });
        // Need to also make slice/arrayBuffer return real bytes so isPdfBlob passes.
        // Our pdfBlob payload starts with %PDF- so the first 5 bytes are correct.
        const r = await vetImport(blob, 'big.pdf');
        assert.equal(r.needsConfirm, true);
        assert.match(r.reason, /large PDF/i);
    });

    test('does not soft-warn just under threshold', async () => {
        const blob = pdfBlob();
        Object.defineProperty(blob, 'size', { value: __TEST__.SOFT_WARN_BYTES - 1, configurable: true });
        const r = await vetImport(blob, 'normal.pdf');
        assert.equal(r.needsConfirm, false);
    });
});

describe('exported constants', () => {
    test('SOFT_WARN_BYTES = 500 MB', () => {
        assert.equal(__TEST__.SOFT_WARN_BYTES, 500 * 1024 * 1024);
    });
    test('HARD_LIMIT_BYTES = 2 GB', () => {
        assert.equal(__TEST__.HARD_LIMIT_BYTES, 2 * 1024 * 1024 * 1024);
    });
    test('FS_EXPORT_LIMIT_BYTES = 5 MB', () => {
        assert.equal(__TEST__.FS_EXPORT_LIMIT_BYTES, 5 * 1024 * 1024);
    });
    test('PDF_MAGIC matches "%PDF-"', () => {
        assert.deepEqual(__TEST__.PDF_MAGIC, [0x25, 0x50, 0x44, 0x46, 0x2D]);
    });
});
