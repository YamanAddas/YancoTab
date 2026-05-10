/**
 * pdf/view/printDoc.js — print the current PDF via a hidden iframe.
 *
 * Strategy:
 *   1. Create a hidden <iframe>, point it at a blob URL of the PDF.
 *   2. Wait for the iframe to load.
 *   3. Call iframe.contentWindow.print().
 *   4. Remove the iframe + revoke the blob URL after the dialog closes.
 *
 * On chrome-extension:// origins this falls back to opening the blob
 * in a new tab if iframe printing is blocked — the user can then
 * Ctrl+P from that tab.
 */

const PRINT_TIMEOUT_MS = 30_000;   // give up after 30s

/**
 * @param {Blob} blob — the PDF blob
 * @param {(message: string) => void} [onError]
 */
export async function printPdf(blob, onError) {
    if (!blob) { onError?.('No document to print'); return; }
    let blobUrl = null;
    let iframe = null;

    try {
        blobUrl = URL.createObjectURL(blob);

        iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.opacity = '0';
        iframe.setAttribute('aria-hidden', 'true');
        iframe.src = blobUrl;
        document.body.appendChild(iframe);

        // Wait for the PDF to render in the iframe (browser's native viewer).
        await waitForLoad(iframe);

        // Defer one paint so the PDF viewer is ready to receive the print.
        await new Promise((r) => setTimeout(r, 200));

        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } catch (e) {
            // Some Chrome extension contexts disallow iframe print() —
            // fall back to opening the blob in a new tab.
            window.open(blobUrl, '_blank', 'noopener');
            onError?.('Opened in a new tab — use your browser\'s print dialog');
        }

        // Clean up after a delay (the print dialog is modal but
        // navigator.print() returns synchronously after the user dismisses).
        setTimeout(cleanup, 2000);
    } catch (e) {
        onError?.(e?.message || 'Print failed');
        cleanup();
    }

    function cleanup() {
        try { iframe?.remove(); } catch { /* ignore */ }
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        iframe = null;
        blobUrl = null;
    }
}

function waitForLoad(iframe) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('print iframe load timeout')), PRINT_TIMEOUT_MS);
        const onLoad = () => { clearTimeout(t); resolve(); };
        iframe.addEventListener('load', onLoad, { once: true });
    });
}
