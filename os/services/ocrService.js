/**
 * OCR Service — lazy singleton for text recognition in images.
 *
 * Wraps tesseract-wasm (vendored at vendor/tesseract/).
 * All resources (WASM binary, worker, trained model) are loaded on
 * first `recognize()` call and cached for subsequent uses.
 *
 * Worker is automatically terminated after IDLE_TIMEOUT_MS of
 * inactivity to free memory.
 *
 * Usage:
 *   import { ocrService } from './ocrService.js';
 *   const { text, boxes } = await ocrService.recognize(imageSource);
 *
 * imageSource: ImageBitmap | ImageData | HTMLImageElement | HTMLCanvasElement
 */

const IDLE_TIMEOUT_MS = 30_000;

// Resolve asset paths — chrome.runtime.getURL in extension context,
// import.meta.url fallback for standalone web-app mode.
function assetURL(relativePath) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        return chrome.runtime.getURL(relativePath);
    }
    return new URL(`../../${relativePath}`, import.meta.url).href;
}

class OcrService {
    constructor() {
        /** @type {import('../../vendor/tesseract/lib.js').OCRClient | null} */
        this._client = null;
        this._initPromise = null;
        this._idleTimer = null;
        this._busy = false;
    }

    // ── Public API ──────────────────────────────────────────

    /**
     * Recognize text in an image.
     *
     * @param {ImageBitmap|ImageData|HTMLImageElement|HTMLCanvasElement} imageSource
     * @param {object} [opts]
     * @param {'word'|'line'} [opts.unit='word'] — granularity for bounding boxes
     * @param {(progress: number) => void} [opts.onProgress] — 0-1 progress callback
     * @returns {Promise<{ text: string, boxes: Array<{ text: string, rect: {left:number,top:number,right:number,bottom:number}, confidence: number }> }>}
     */
    async recognize(imageSource, opts = {}) {
        const { unit = 'word', onProgress } = opts;
        const client = await this._ensureClient();

        this._busy = true;
        this._clearIdle();

        try {
            const imageData = await this._toImageData(imageSource);
            await client.loadImage(imageData);

            const [text, boxes] = await Promise.all([
                client.getText(onProgress),
                client.getTextBoxes(unit),
            ]);

            await client.clearImage();

            return {
                text: text.trim(),
                boxes: boxes.map((b) => ({
                    text: b.text,
                    rect: { ...b.rect },
                    confidence: b.confidence ?? 0,
                })),
            };
        } finally {
            this._busy = false;
            this._scheduleIdle();
        }
    }

    /**
     * Tear down the worker immediately. Safe to call multiple times.
     * After destroy(), the next `recognize()` will re-initialize.
     */
    async destroy() {
        this._clearIdle();
        if (this._client) {
            try { await this._client.destroy(); } catch { /* already dead */ }
            this._client = null;
        }
        this._initPromise = null;
    }

    /**
     * Whether the engine is currently loaded and ready.
     */
    get ready() {
        return this._client !== null;
    }

    // ── Lazy init ───────────────────────────────────────────

    async _ensureClient() {
        if (this._client) return this._client;
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._init();
        try {
            return await this._initPromise;
        } catch (err) {
            this._initPromise = null;
            throw err;
        }
    }

    async _init() {
        const { OCRClient } = await import(
            /* webpackIgnore: true */
            assetURL('vendor/tesseract/lib.js')
        );

        const workerURL = assetURL('vendor/tesseract/tesseract-worker.js');

        // Fetch WASM binary ourselves — avoids import.meta.url
        // resolution issues inside the Worker's Emscripten glue.
        const wasmResp = await fetch(assetURL('vendor/tesseract/tesseract-core.wasm'));
        const wasmBinary = await wasmResp.arrayBuffer();

        const client = new OCRClient({ workerURL, wasmBinary });

        // Load the English model
        const modelURL = assetURL('vendor/tesseract/eng.traineddata');
        await client.loadModel(modelURL);

        this._client = client;
        this._scheduleIdle();
        return client;
    }

    // ── Image conversion ────────────────────────────────────

    /**
     * Convert any supported image source to ImageData.
     * tesseract-wasm also accepts ImageBitmap directly, but going
     * through ImageData avoids a Chrome bug with rotation metadata.
     */
    async _toImageData(source) {
        if (source instanceof ImageData) return source;

        // HTMLImageElement or HTMLCanvasElement or ImageBitmap
        let width, height;
        if (source instanceof HTMLImageElement) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        } else if (source instanceof HTMLCanvasElement) {
            width = source.width;
            height = source.height;
        } else if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
            width = source.width;
            height = source.height;
        } else {
            throw new Error('OCR: unsupported image source type');
        }

        if (!width || !height) {
            throw new Error('OCR: image has zero dimensions');
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0);
        return ctx.getImageData(0, 0, width, height);
    }

    // ── Idle management ─────────────────────────────────────

    _scheduleIdle() {
        this._clearIdle();
        this._idleTimer = setTimeout(() => {
            if (!this._busy) this.destroy();
        }, IDLE_TIMEOUT_MS);
    }

    _clearIdle() {
        if (this._idleTimer !== null) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }
}

/** Singleton — import this from anywhere. */
export const ocrService = new OcrService();
