/**
 * pdf/v3/ops/pdfLibLoader.js — lazy loader for the vendored pdf-lib UMD.
 *
 * pdf-lib is ~525 KB minified. We only need it for PDF binary
 * mutation (merge, split, delete-page, redact-bake, signature embed).
 * The overlay-only features (live signature display, ink, shapes,
 * redact preview) don't depend on it.
 *
 * Loader uses dynamic import() of the UMD via a tiny shim — pdf-lib's
 * UMD attaches to `globalThis.PDFLib` when no module loader is
 * present. We use a `<script>` tag (NOT import()) because the UMD's
 * `!function(t,e){...}` head doesn't expose ES exports. Once the
 * script loads, we read PDFLib off the window and return it.
 *
 * The script tag is created via document.createElement, NOT inline,
 * so it satisfies MV3's strict CSP (script-src 'self'). Source URL
 * resolves through chrome.runtime.getURL() in extension mode and
 * import.meta.url in standalone mode.
 *
 * Target size: ≤ 120 lines.
 */

const SCRIPT_PATH = 'vendor/pdf-lib/pdf-lib.min.js';

let loadPromise = null;

/**
 * Returns a promise resolving to the PDFLib namespace object.
 *
 * Cached after first call. If the user triggers a second mutation
 * action while the first load is in flight, both await the same
 * promise.
 */
export function loadPdfLib() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    // If something else already loaded it (e.g. an earlier feature),
    // reuse the global.
    if (globalThis.PDFLib && globalThis.PDFLib.PDFDocument) {
      return globalThis.PDFLib;
    }
    const url = resolveScriptUrl();
    await injectScript(url);
    if (!globalThis.PDFLib || !globalThis.PDFLib.PDFDocument) {
      throw new Error('pdf-lib loaded but PDFLib namespace missing');
    }
    return globalThis.PDFLib;
  })().catch((err) => {
    // Clear the cache so a future call can retry.
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

/**
 * Resolve the script's URL. Extension mode uses chrome.runtime.getURL
 * for a stable absolute URL; standalone web mode falls back to a
 * relative path resolved against the document.
 */
function resolveScriptUrl() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(SCRIPT_PATH);
    }
  } catch { /* best-effort */ }
  // Standalone web fallback — relative to page.
  return `/${SCRIPT_PATH}`;
}

/**
 * Inject a <script> tag pointing at `url` and resolve when it loads.
 * Rejects on error or 30s timeout.
 */
function injectScript(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pdf-lib-loader]`);
    if (existing) {
      // Already inserted; wait on its load event if not yet ready.
      if (globalThis.PDFLib) { resolve(); return; }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('pdf-lib script load failed')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.dataset.pdfLibLoader = '1';
    const timeout = setTimeout(() => {
      reject(new Error('pdf-lib load timed out'));
    }, 30000);
    s.addEventListener('load', () => {
      clearTimeout(timeout);
      resolve();
    });
    s.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('pdf-lib script load failed'));
    });
    document.head.appendChild(s);
  });
}
