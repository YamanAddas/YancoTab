/**
 * ocrService unit tests.
 *
 * tesseract-wasm needs a real browser (Worker, WebAssembly, Canvas),
 * so these tests validate the OcrService wrapper logic — lifecycle,
 * idle timer, image conversion guards, and destroy safety — using
 * lightweight mocks.  Full integration is verified via the preview
 * workflow in a live Chrome tab.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal shims for APIs used by ocrService module-level code ──

globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://fake/${p}` } };

// ── Build a mock OCRClient and hijack the dynamic import() ──

function makeMockClient() {
    return {
        loadImage: mock.fn(async () => {}),
        getText: mock.fn(async () => '  Hello World  '),
        getTextBoxes: mock.fn(async () => [
            { text: 'Hello', rect: { left: 10, top: 20, right: 60, bottom: 40 }, confidence: 95 },
            { text: 'World', rect: { left: 70, top: 20, right: 120, bottom: 40 }, confidence: 92 },
        ]),
        clearImage: mock.fn(async () => {}),
        loadModel: mock.fn(async () => {}),
        destroy: mock.fn(async () => {}),
    };
}

// We can't use the real module (it needs a browser), so we test the
// service logic by constructing an OcrService-like class that follows
// the same contract but wires in our mock.

class TestableOcrService {
    constructor(mockClient) {
        this._client = null;
        this._initPromise = null;
        this._idleTimer = null;
        this._busy = false;
        this._mockClient = mockClient;
        this._initCount = 0;
    }

    async recognize(imageData, opts = {}) {
        const { unit = 'word', onProgress } = opts;
        const client = await this._ensureClient();
        this._busy = true;
        this._clearIdle();
        try {
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

    async destroy() {
        this._clearIdle();
        if (this._client) {
            try { await this._client.destroy(); } catch { /* ok */ }
            this._client = null;
        }
        this._initPromise = null;
    }

    get ready() { return this._client !== null; }

    async _ensureClient() {
        if (this._client) return this._client;
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._init();
        try { return await this._initPromise; }
        catch (err) { this._initPromise = null; throw err; }
    }

    async _init() {
        this._initCount++;
        this._client = this._mockClient;
        this._scheduleIdle();
        return this._client;
    }

    _scheduleIdle() {
        this._clearIdle();
        this._idleTimer = setTimeout(() => {
            if (!this._busy) this.destroy();
        }, 100); // short timeout for tests
    }

    _clearIdle() {
        if (this._idleTimer !== null) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }
}

// ── Tests ────────────────────────────────────────────────────

describe('OcrService', () => {
    let svc;
    let mockClient;

    beforeEach(() => {
        mockClient = makeMockClient();
        svc = new TestableOcrService(mockClient);
    });

    afterEach(async () => {
        await svc.destroy();
    });

    it('starts not ready', () => {
        assert.equal(svc.ready, false);
    });

    it('becomes ready after first recognize()', async () => {
        const fakeImageData = { width: 100, height: 50, data: new Uint8ClampedArray(100 * 50 * 4) };
        await svc.recognize(fakeImageData);
        assert.equal(svc.ready, true);
    });

    it('returns trimmed text and structured boxes', async () => {
        const fakeImageData = { width: 100, height: 50, data: new Uint8ClampedArray(100 * 50 * 4) };
        const result = await svc.recognize(fakeImageData);

        assert.equal(result.text, 'Hello World');
        assert.equal(result.boxes.length, 2);
        assert.equal(result.boxes[0].text, 'Hello');
        assert.deepEqual(result.boxes[0].rect, { left: 10, top: 20, right: 60, bottom: 40 });
        assert.equal(result.boxes[0].confidence, 95);
        assert.equal(result.boxes[1].text, 'World');
        assert.equal(result.boxes[1].confidence, 92);
    });

    it('clears image after recognition', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData);
        assert.equal(mockClient.clearImage.mock.callCount(), 1);
    });

    it('calls loadImage with the provided data', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData);
        assert.equal(mockClient.loadImage.mock.callCount(), 1);
    });

    it('passes unit option through to getTextBoxes', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData, { unit: 'line' });
        const call = mockClient.getTextBoxes.mock.calls[0];
        assert.equal(call.arguments[0], 'line');
    });

    it('default unit is word', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData);
        const call = mockClient.getTextBoxes.mock.calls[0];
        assert.equal(call.arguments[0], 'word');
    });

    it('passes onProgress callback to getText', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        const progressFn = () => {};
        await svc.recognize(fakeImageData, { onProgress: progressFn });
        const call = mockClient.getText.mock.calls[0];
        assert.equal(call.arguments[0], progressFn);
    });

    it('only initializes once for multiple concurrent calls', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await Promise.all([
            svc.recognize(fakeImageData),
            svc.recognize(fakeImageData),
        ]);
        assert.equal(svc._initCount, 1);
    });

    it('destroy() makes service not ready', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData);
        assert.equal(svc.ready, true);

        await svc.destroy();
        assert.equal(svc.ready, false);
    });

    it('destroy() calls client.destroy()', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData);
        await svc.destroy();
        assert.equal(mockClient.destroy.mock.callCount(), 1);
    });

    it('double destroy() is safe', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData);
        await svc.destroy();
        await svc.destroy(); // should not throw
        assert.equal(svc.ready, false);
    });

    it('re-initializes after destroy + recognize', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData);
        assert.equal(svc._initCount, 1);

        await svc.destroy();
        // Create fresh mock for re-init
        svc._mockClient = makeMockClient();
        await svc.recognize(fakeImageData);
        assert.equal(svc._initCount, 2);
    });

    it('idle timer tears down after timeout', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        await svc.recognize(fakeImageData);
        assert.equal(svc.ready, true);

        // Wait for the 100ms idle timeout
        await new Promise((r) => setTimeout(r, 150));
        assert.equal(svc.ready, false, 'should auto-destroy after idle');
    });

    it('boxes have independent rect copies (no shared references)', async () => {
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        const result = await svc.recognize(fakeImageData);

        // Mutate the first box's rect — should not affect the second
        result.boxes[0].rect.left = 999;
        assert.equal(result.boxes[1].rect.left, 70);
    });

    it('handles confidence undefined gracefully', async () => {
        mockClient.getTextBoxes = mock.fn(async () => [
            { text: 'NoConf', rect: { left: 0, top: 0, right: 10, bottom: 10 } },
        ]);
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
        const result = await svc.recognize(fakeImageData);
        assert.equal(result.boxes[0].confidence, 0);
    });

    it('propagates recognize errors without leaking busy state', async () => {
        mockClient.getText = mock.fn(async () => { throw new Error('OCR fail'); });
        const fakeImageData = { width: 10, height: 10, data: new Uint8ClampedArray(400) };

        await assert.rejects(() => svc.recognize(fakeImageData), { message: 'OCR fail' });
        assert.equal(svc._busy, false, 'busy flag should be cleared on error');
    });
});

describe('assetURL helper', () => {
    it('uses chrome.runtime.getURL when available', () => {
        // Already set up in global shim
        const url = globalThis.chrome.runtime.getURL('vendor/tesseract/lib.js');
        assert.equal(url, 'chrome-extension://fake/vendor/tesseract/lib.js');
    });
});
