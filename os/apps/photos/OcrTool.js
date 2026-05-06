/**
 * OcrTool — OCR panel + overlay for PhotoEditor.
 *
 * Extracted from PhotoEditor to keep it under the line-count cap.
 * Coordinates with the editor's viewport transform (_imgRect) to
 * position bounding-box overlays on top of the canvas.
 *
 * Usage in PhotoEditor:
 *   this._ocrTool = new OcrTool(this._canvasWrap, () => this._getOcrContext());
 *   // In _selectTool('ocr'):
 *   this._ocrTool.buildPanel(this._toolPanel);
 *   // In _scheduleRender:
 *   this._ocrTool.syncOverlay();
 *   // In destroy():
 *   this._ocrTool.destroy();
 */

import { el } from '../../utils/dom.js';
import { ocrService } from '../../services/ocrService.js';

// ── States ──
const STATE = { IDLE: 0, LOADING: 1, DONE: 2, ERROR: 3 };

export class OcrTool {
    /**
     * @param {HTMLElement} canvasWrap — container to append the overlay into
     * @param {() => { img: HTMLImageElement|null, imgRect: {x,y,w,h,scale}|null }} getContext
     */
    constructor(canvasWrap, getContext) {
        this._wrap = canvasWrap;
        this._getContext = getContext;

        this._state = STATE.IDLE;
        this._boxes = [];
        this._fullText = '';
        this._progress = 0;
        this._error = '';
        this._selectedBoxes = new Set();

        // DOM refs
        this._overlay = null;
        this._panel = null;
        this._progressBar = null;
        this._textArea = null;
        this._statusLabel = null;
    }

    // ── Public: panel in tool panel ──────────────────────

    buildPanel(toolPanel) {
        toolPanel.innerHTML = '';
        const panel = el('div', { class: 'pe-panel pe-ocr-panel' });

        panel.appendChild(el('div', { class: 'pe-panel__title' }, 'Text Recognition'));

        // Progress bar (hidden until running)
        this._progressBar = el('div', { class: 'pe-ocr-progress', hidden: true }, [
            el('div', { class: 'pe-ocr-progress__fill' }),
        ]);
        panel.appendChild(this._progressBar);

        // Status label
        this._statusLabel = el('div', { class: 'pe-ocr-status' });
        panel.appendChild(this._statusLabel);

        // Action buttons
        const actions = el('div', { class: 'pe-panel__actions pe-ocr-actions' });

        if (this._state === STATE.IDLE || this._state === STATE.ERROR) {
            actions.appendChild(el('button', {
                class: 'pe-btn pe-btn--primary',
                onclick: () => this._run(),
            }, 'Scan for Text'));
        }

        if (this._state === STATE.DONE && this._fullText) {
            actions.appendChild(el('button', {
                class: 'pe-btn pe-btn--primary',
                onclick: () => this._copyAll(),
            }, 'Copy All'));
            actions.appendChild(el('button', {
                class: 'pe-btn',
                onclick: () => this._copySelected(),
                title: 'Copy only selected words',
            }, 'Copy Selected'));
        }

        if (this._state === STATE.DONE || this._state === STATE.ERROR) {
            actions.appendChild(el('button', {
                class: 'pe-btn',
                onclick: () => this._reset(),
            }, 'Clear'));
        }

        panel.appendChild(actions);

        // Text output area
        if (this._state === STATE.DONE && this._fullText) {
            this._textArea = el('textarea', {
                class: 'pe-ocr-text',
                readonly: true,
                rows: 8,
                value: this._fullText,
                onclick: (e) => e.target.select(),
            });
            panel.appendChild(el('div', { class: 'pe-panel__subtitle' }, 'Recognized Text'));
            panel.appendChild(this._textArea);

            // Word count
            const words = this._fullText.split(/\s+/).filter(Boolean).length;
            panel.appendChild(el('div', { class: 'pe-ocr-meta' },
                `${this._boxes.length} words detected · ${words} unique words`
            ));
        }

        if (this._state === STATE.ERROR) {
            panel.appendChild(el('div', { class: 'pe-ocr-error' }, this._error));
        }

        this._updateStatus();
        toolPanel.appendChild(panel);
        this._panel = panel;

        // Create or show overlay
        this._ensureOverlay();
    }

    // ── Public: sync overlay position with viewport ─────

    syncOverlay() {
        if (!this._overlay || this._state !== STATE.DONE) return;
        const ctx = this._getContext();
        if (!ctx.imgRect) { this._overlay.hidden = true; return; }

        const { x, y, w, h, scale } = ctx.imgRect;
        const img = ctx.img;
        if (!img) return;

        // Position overlay exactly over the rendered image
        this._overlay.style.left = `${x}px`;
        this._overlay.style.top = `${y}px`;
        this._overlay.style.width = `${w}px`;
        this._overlay.style.height = `${h}px`;
        this._overlay.hidden = false;

        // Scale factors: box coords are in original image pixels
        const sx = w / img.naturalWidth;
        const sy = h / img.naturalHeight;

        // Update box positions
        const boxEls = this._overlay.querySelectorAll('.pe-ocr-box');
        boxEls.forEach((boxEl, i) => {
            const box = this._boxes[i];
            if (!box) return;
            const r = box.rect;
            boxEl.style.left = `${r.left * sx}px`;
            boxEl.style.top = `${r.top * sy}px`;
            boxEl.style.width = `${(r.right - r.left) * sx}px`;
            boxEl.style.height = `${(r.bottom - r.top) * sy}px`;
        });
    }

    // ── Public: cleanup ─────────────────────────────────

    destroy() {
        this._removeOverlay();
        this._panel = null;
        this._textArea = null;
        this._progressBar = null;
        this._statusLabel = null;
    }

    // ── OCR execution ───────────────────────────────────

    async _run() {
        const ctx = this._getContext();
        if (!ctx.img) return;

        this._state = STATE.LOADING;
        this._progress = 0;
        this._error = '';
        this._boxes = [];
        this._fullText = '';
        this._selectedBoxes.clear();
        this._rebuildPanel();

        try {
            const result = await ocrService.recognize(ctx.img, {
                unit: 'word',
                onProgress: (p) => {
                    this._progress = p;
                    this._updateProgress();
                },
            });

            this._boxes = result.boxes;
            this._fullText = result.text;
            this._state = STATE.DONE;
        } catch (err) {
            this._state = STATE.ERROR;
            this._error = err.message || 'OCR failed';
        }

        this._rebuildPanel();
    }

    _reset() {
        this._state = STATE.IDLE;
        this._boxes = [];
        this._fullText = '';
        this._progress = 0;
        this._error = '';
        this._selectedBoxes.clear();
        this._removeOverlay();
        this._rebuildPanel();
    }

    // ── Clipboard ───────────────────────────────────────

    async _copyAll() {
        if (!this._fullText) return;
        try {
            await navigator.clipboard.writeText(this._fullText);
            this._flash('Copied!');
        } catch {
            this._fallbackCopy(this._fullText);
        }
    }

    async _copySelected() {
        if (!this._selectedBoxes.size) {
            this._flash('Select words first');
            return;
        }
        const text = this._boxes
            .filter((_, i) => this._selectedBoxes.has(i))
            .map((b) => b.text)
            .join(' ');
        try {
            await navigator.clipboard.writeText(text);
            this._flash(`Copied ${this._selectedBoxes.size} words`);
        } catch {
            this._fallbackCopy(text);
        }
    }

    _fallbackCopy(text) {
        if (this._textArea) {
            this._textArea.value = text;
            this._textArea.select();
            document.execCommand('copy');
            this._flash('Copied!');
        }
    }

    _flash(msg) {
        if (!this._statusLabel) return;
        this._statusLabel.textContent = msg;
        setTimeout(() => this._updateStatus(), 1500);
    }

    // ── Overlay DOM ─────────────────────────────────────

    _ensureOverlay() {
        if (this._state !== STATE.DONE || !this._boxes.length) {
            this._removeOverlay();
            return;
        }
        this._removeOverlay();

        this._overlay = el('div', { class: 'pe-ocr-overlay' });
        this._overlay.hidden = true;

        for (let i = 0; i < this._boxes.length; i++) {
            const box = this._boxes[i];
            const boxEl = el('div', {
                class: 'pe-ocr-box',
                title: box.text,
                'data-idx': String(i),
                onclick: (e) => {
                    e.stopPropagation();
                    this._toggleBox(i, e.shiftKey);
                },
            });
            if (this._selectedBoxes.has(i)) boxEl.classList.add('is-selected');
            this._overlay.appendChild(boxEl);
        }

        this._wrap.appendChild(this._overlay);
        this.syncOverlay();
    }

    _removeOverlay() {
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
    }

    _toggleBox(idx, additive) {
        if (!additive) {
            const wasSelected = this._selectedBoxes.has(idx);
            this._selectedBoxes.clear();
            if (!wasSelected) this._selectedBoxes.add(idx);
        } else {
            if (this._selectedBoxes.has(idx)) {
                this._selectedBoxes.delete(idx);
            } else {
                this._selectedBoxes.add(idx);
            }
        }
        // Update visual state
        this._overlay?.querySelectorAll('.pe-ocr-box').forEach((el, i) => {
            el.classList.toggle('is-selected', this._selectedBoxes.has(i));
        });
    }

    // ── UI updates ──────────────────────────────────────

    _updateProgress() {
        if (!this._progressBar) return;
        this._progressBar.hidden = false;
        const fill = this._progressBar.querySelector('.pe-ocr-progress__fill');
        if (fill) fill.style.width = `${Math.round(this._progress * 100)}%`;
        this._updateStatus();
    }

    _updateStatus() {
        if (!this._statusLabel) return;
        switch (this._state) {
            case STATE.IDLE:
                this._statusLabel.textContent = 'Tap "Scan" to detect text in image';
                break;
            case STATE.LOADING:
                this._statusLabel.textContent = `Scanning… ${Math.round(this._progress * 100)}%`;
                break;
            case STATE.DONE:
                if (this._boxes.length) {
                    this._statusLabel.textContent = `Found ${this._boxes.length} words`;
                } else {
                    this._statusLabel.textContent = 'No text detected';
                }
                break;
            case STATE.ERROR:
                this._statusLabel.textContent = 'Error — try again';
                break;
        }
    }

    _rebuildPanel() {
        // Re-render the panel by calling buildPanel on the parent tool panel
        const parent = this._panel?.parentElement;
        if (parent) this.buildPanel(parent);
    }
}
