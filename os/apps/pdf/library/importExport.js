/**
 * pdf/library/importExport.js — bring PDFs into the Library, send them out.
 *
 * Responsibilities:
 *   1. Validate a File / Blob is actually a PDF (magic bytes, not just MIME).
 *   2. Soft-warn on huge imports (>500 MB) and refuse insanely huge ones (>2 GB).
 *   3. Import a Blob/File into pdfStore (IDB) → returns the new doc metadata.
 *   4. Bridge from FilesApp: read a /home/documents/*.pdf into the library.
 *   5. Bridge to FilesApp: copy a library blob back to FilesApp (size-gated;
 *      FilesApp lives in localStorage and dies on anything bigger than ~5 MB).
 *   6. Download a library blob to the user's disk via a temporary <a> click.
 *
 * Pure-ish — IO is injected via the `services` object so tests can drive
 * each entrypoint without a real IDB / DOM.
 */

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2D]; // "%PDF-"
const SOFT_WARN_BYTES = 500 * 1024 * 1024;        // 500 MB → confirm
const HARD_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;  // 2 GB → refuse
const FS_EXPORT_LIMIT_BYTES = 5 * 1024 * 1024;    // FilesApp localStorage cap
const PDF_DEFAULT_NAME = 'document.pdf';

export class PdfImportError extends Error {
    constructor(message, code, cause) {
        super(message);
        this.name = 'PdfImportError';
        this.code = code;
        if (cause) this.cause = cause;
    }
}

/**
 * Verify a Blob/File starts with %PDF-. Reads the first 5 bytes.
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
export async function isPdfBlob(blob) {
    if (!blob || typeof blob.slice !== 'function' || typeof blob.arrayBuffer !== 'function') return false;
    if (blob.size < 5) return false;
    try {
        const head = await blob.slice(0, 5).arrayBuffer();
        const arr = new Uint8Array(head);
        for (let i = 0; i < PDF_MAGIC.length; i++) {
            if (arr[i] !== PDF_MAGIC[i]) return false;
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Check whether a File should be accepted for import.
 * Throws PdfImportError on hard fails.
 * Returns { needsConfirm, reason? } when soft warnings apply.
 */
export async function vetImport(blob, name) {
    if (!blob) throw new PdfImportError('No file', 'no_file');
    if (!Number.isFinite(blob.size)) throw new PdfImportError('Bad blob', 'bad_blob');

    if (blob.size > HARD_LIMIT_BYTES) {
        throw new PdfImportError(
            `${name || 'PDF'} is ${(blob.size / 1024 / 1024 / 1024).toFixed(2)} GB — above the 2 GB import limit. Try splitting it.`,
            'too_large',
        );
    }
    if (!(await isPdfBlob(blob))) {
        throw new PdfImportError(`${name || 'File'} is not a valid PDF`, 'bad_magic');
    }
    if (blob.size > SOFT_WARN_BYTES) {
        return {
            needsConfirm: true,
            reason: `This is a large PDF (${(blob.size / 1024 / 1024).toFixed(0)} MB). Importing may take a moment.`,
        };
    }
    return { needsConfirm: false };
}

/**
 * Add a Blob to the Library. Triggers persist-permission request on
 * first import (idempotent — browser caches the grant).
 * @returns {Promise<object>} doc metadata (no blob)
 */
export async function importBlob({ pdfStore, blob, name, sourcePath = null, persistRequested = { value: false } }) {
    if (!pdfStore) throw new PdfImportError('pdfStore unavailable', 'no_store');
    if (!persistRequested.value) {
        persistRequested.value = true;
        try { await pdfStore.requestPersistence(); } catch { /* ignore */ }
    }
    const meta = await pdfStore.addDocument(blob, name || PDF_DEFAULT_NAME, sourcePath ? { sourcePath } : undefined);
    return meta;
}

/**
 * Pick a file via <input type=file> and import it.
 * @returns {Promise<{accepted: File} | null>}
 */
export function pickFileToImport() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf,.pdf';
        input.style.display = 'none';
        input.addEventListener('change', () => {
            const file = input.files?.[0] || null;
            input.remove();
            resolve(file ? { accepted: file } : null);
        }, { once: true });
        // Some browsers (Chrome) fire 'cancel' on Esc — fall back to focus check.
        input.addEventListener('cancel', () => {
            input.remove();
            resolve(null);
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    });
}

/**
 * Trigger a download of a Library doc as a regular file.
 * @param {Blob} blob
 * @param {string} name
 */
export function downloadBlob(blob, name) {
    if (!blob || !name) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
    }, 200);
}

/**
 * Read a /home/documents/*.pdf out of FilesApp into the Library.
 * Returns the new doc metadata, or null if the file does not exist /
 * is not a PDF / has been imported already (with sourcePath).
 */
export async function importFromFilesApp({ pdfStore, fs, path }) {
    if (!fs?.read || !pdfStore) return null;
    const file = fs.read(path);
    if (!file || typeof file.content !== 'string') return null;

    const existing = await pdfStore.findBySourcePath(path);
    if (existing) return existing;

    const blob = await dataUrlToBlob(file.content);
    if (!blob) return null;
    if (!(await isPdfBlob(blob))) return null;

    const name = (path || '').split('/').pop() || PDF_DEFAULT_NAME;
    const meta = await pdfStore.addDocument(blob, name, { sourcePath: path });
    return meta;
}

/**
 * Copy a Library blob back to FilesApp at /home/documents/<name>.
 * Refuses anything over FS_EXPORT_LIMIT_BYTES (FilesApp uses
 * localStorage and silently fails on writes that bust the quota).
 */
export async function exportToFilesApp({ pdfStore, fs, docId }) {
    if (!fs?.write || !pdfStore) {
        throw new PdfImportError('FilesApp unavailable', 'no_fs');
    }
    const doc = await pdfStore.getDocument(docId);
    if (!doc) throw new PdfImportError('Document not found', 'not_found');
    if (doc.sizeBytes > FS_EXPORT_LIMIT_BYTES) {
        throw new PdfImportError(
            `Too large for Files (max ${(FS_EXPORT_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB). Use Download instead.`,
            'fs_too_large',
        );
    }

    const dataUrl = await blobToDataUrl(doc.blob);
    const name = doc.name || PDF_DEFAULT_NAME;
    let target = `/home/documents/${name}`;
    if (fs.exists?.(target)) {
        const dot = name.toLowerCase().lastIndexOf('.pdf');
        const stem = dot >= 0 ? name.slice(0, dot) : name;
        let n = 2;
        while (fs.exists(target)) {
            target = `/home/documents/${stem} (${n}).pdf`;
            n++;
        }
    }
    fs.write(target, dataUrl, { mime: 'application/pdf', size: dataUrl.length, source: 'pdf-reader' });
    await pdfStore.updateMeta(docId, { sourcePath: target });
    return { path: target };
}

/** List PDF candidates in /home/documents/ for the "Import from Files" picker. */
export function listFilesAppPdfs(fs) {
    if (!fs?.list) return [];
    const items = fs.list('/home/documents');
    return items
        .filter((i) => i?.type === 'file' && /\.pdf$/i.test(i.path || ''))
        .map((i) => ({ path: i.path, name: (i.path || '').split('/').pop(), size: i.meta?.size || 0 }));
}

// ─── helpers ────────────────────────────────────────────────────

export async function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    try {
        const res = await fetch(dataUrl);
        return await res.blob();
    } catch { return null; }
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Collect all annotations for a document and trigger a Markdown file download.
 *
 * @param {object} opts
 * @param {string} opts.docTitle   — display name of the document
 * @param {string} [opts.fileName] — base file name; defaults to docTitle
 * @param {Array}  opts.bookmarks  — [{ page, label, color }]
 * @param {Array}  opts.highlights — [{ page, text, color }]
 * @param {Array}  opts.notes      — [{ page, body?, text?, createdAt? }]
 * @param {Array}  opts.quotes     — [{ page, text }]
 */
export function exportAnnotationsMarkdown({
    docTitle = 'Document', fileName,
    bookmarks = [], highlights = [], notes = [], quotes = [],
} = {}) {
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
        `# ${docTitle}`,
        `*Exported from YancoTab PDF Reader · ${date}*`,
        '',
    ];

    if (bookmarks.length) {
        lines.push(`## Bookmarks (${bookmarks.length})`, '');
        const sorted = [...bookmarks].sort((a, b) => (a.page || 0) - (b.page || 0));
        for (const b of sorted) lines.push(`- **p.${b.page}** — ${b.label || 'Bookmark'}`);
        lines.push('');
    }

    if (highlights.length) {
        lines.push(`## Highlights (${highlights.length})`, '');
        const sorted = [...highlights].sort((a, b) => (a.page || 0) - (b.page || 0));
        let lastPage = -1;
        for (const h of sorted) {
            if (h.page !== lastPage) {
                if (lastPage >= 0) lines.push('');
                lines.push(`### Page ${h.page}`);
                lastPage = h.page;
            }
            lines.push(`> ${String(h.text || '').replace(/\n/g, ' ')}`);
        }
        lines.push('');
    }

    if (notes.length) {
        lines.push(`## Notes (${notes.length})`, '');
        const sorted = [...notes].sort((a, b) => (a.page || 0) - (b.page || 0));
        let lastPage = -1;
        for (const n of sorted) {
            if (n.page !== lastPage) {
                if (lastPage >= 0) lines.push('');
                const ts = n.createdAt ? ` *(${new Date(n.createdAt).toLocaleDateString()})*` : '';
                lines.push(`### Page ${n.page}${ts}`);
                lastPage = n.page;
            }
            lines.push(String(n.body || n.text || '').replace(/\n/g, '\n\n'));
        }
        lines.push('');
    }

    if (quotes.length) {
        lines.push(`## Saved Quotes (${quotes.length})`, '');
        const sorted = [...quotes].sort((a, b) => (a.page || 0) - (b.page || 0));
        let lastPage = -1;
        for (const q of sorted) {
            if (q.page !== lastPage) {
                if (lastPage >= 0) lines.push('');
                lines.push(`### Page ${q.page}`);
                lastPage = q.page;
            }
            lines.push(`> ${String(q.text || '').replace(/\n/g, ' ')}`);
        }
        lines.push('');
    }

    if (!bookmarks.length && !highlights.length && !notes.length && !quotes.length) {
        lines.push('*No annotations in this document yet.*', '');
    }

    const markdown = lines.join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const stem = (fileName || docTitle || 'document')
        .replace(/\.pdf$/i, '')
        .replace(/[<>:"/\\|?*]/g, '')
        .trim() || 'document';
    downloadBlob(blob, `${stem}-annotations.md`);
}

export const __TEST__ = Object.freeze({
    PDF_MAGIC, SOFT_WARN_BYTES, HARD_LIMIT_BYTES, FS_EXPORT_LIMIT_BYTES,
});
