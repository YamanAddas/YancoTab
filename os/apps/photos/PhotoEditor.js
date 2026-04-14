/**
 * PhotoEditor v2 — Interactive canvas-based image editor
 *
 * Modern web-app experience:
 *  - Zoom / Pan (scroll wheel, pinch, Space+drag, keyboard)
 *  - Interactive crop with 8 draggable handles
 *  - Annotations with click-to-select, drag-to-move, Delete to remove
 *  - Inline text editing (no prompt dialogs)
 *  - Live adjustment preview with CSS filters
 *  - 16 filter presets with thumbnail previews
 *  - Color picker, palette extractor, contrast checker
 *  - Export (PNG/JPEG/WebP), copy to clipboard, save to gallery
 *  - Before/After comparison slider
 *  - Full undo/redo (command pattern, 30-step)
 *  - Unified Pointer Events (mouse + touch)
 *  - Status bar with zoom, dimensions, cursor position
 *  - Keyboard shortcuts for every tool
 */
import { el } from '../../utils/dom.js';

// ─── Undo / Redo Stack ──────────────────────────────────
class UndoStack {
    constructor(limit = 30) {
        this._stack = [];
        this._index = -1;
        this._limit = limit;
    }
    push(state) {
        this._stack = this._stack.slice(0, this._index + 1);
        this._stack.push(state);
        if (this._stack.length > this._limit) this._stack.shift();
        this._index = this._stack.length - 1;
    }
    undo() { if (this._index > 0) { this._index--; return this._stack[this._index]; } return null; }
    redo() { if (this._index < this._stack.length - 1) { this._index++; return this._stack[this._index]; } return null; }
    current() { return this._stack[this._index] || null; }
    canUndo() { return this._index > 0; }
    canRedo() { return this._index < this._stack.length - 1; }
    clear() { this._stack = []; this._index = -1; }
}

// ─── Annotation Object ─────────────────────────────────
class Annotation {
    constructor(type, data) {
        this.id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        this.type = type;
        this.data = { ...data };
    }
}

// ─── Filter Presets ─────────────────────────────────────
const FILTER_PRESETS = [
    { id: 'none', name: 'Original', filter: '' },
    { id: 'grayscale', name: 'Grayscale', filter: 'grayscale(100%)' },
    { id: 'sepia', name: 'Sepia', filter: 'sepia(80%)' },
    { id: 'vintage', name: 'Vintage', filter: 'sepia(40%) contrast(90%) brightness(110%) saturate(80%)' },
    { id: 'warm', name: 'Warm', filter: 'sepia(20%) saturate(140%) brightness(105%)' },
    { id: 'cool', name: 'Cool', filter: 'saturate(80%) hue-rotate(20deg) brightness(105%)' },
    { id: 'dramatic', name: 'Dramatic', filter: 'contrast(140%) brightness(90%) saturate(120%)' },
    { id: 'fade', name: 'Fade', filter: 'contrast(80%) brightness(120%) saturate(60%)' },
    { id: 'vivid', name: 'Vivid', filter: 'contrast(115%) saturate(160%) brightness(105%)' },
    { id: 'noir', name: 'Noir', filter: 'grayscale(100%) contrast(140%) brightness(90%)' },
    { id: 'invert', name: 'Invert', filter: 'invert(100%)' },
    { id: 'blur', name: 'Blur', filter: 'blur(3px)' },
    { id: 'sharpen', name: 'Sharpen', filter: 'contrast(120%) brightness(105%)' },
    { id: 'bright', name: 'Bright', filter: 'brightness(130%)' },
    { id: 'dark', name: 'Dark', filter: 'brightness(70%) contrast(120%)' },
    { id: 'polaroid', name: 'Polaroid', filter: 'sepia(30%) contrast(90%) brightness(115%) saturate(85%)' },
];

// ─── Crop Presets ───────────────────────────────────────
const CROP_PRESETS = [
    { id: 'free', name: 'Free', ratio: null },
    { id: '1:1', name: '1:1', ratio: 1 },
    { id: '4:3', name: '4:3', ratio: 4 / 3 },
    { id: '3:2', name: '3:2', ratio: 3 / 2 },
    { id: '16:9', name: '16:9', ratio: 16 / 9 },
    { id: '9:16', name: '9:16', ratio: 9 / 16 },
    { id: '4:5', name: '4:5 IG', ratio: 4 / 5 },
    { id: '2:3', name: '2:3', ratio: 2 / 3 },
    { id: 'yt', name: 'YT Thumb', ratio: 1280 / 720 },
];

const ANNOTATION_COLORS = ['#ff4757', '#ff6b35', '#ffa502', '#2ed573', '#0a84ff', '#6b5cff', '#a855f7', '#ffffff', '#000000'];

// ═════════════════════════════════════════════════════════
//  PhotoEditor
// ═════════════════════════════════════════════════════════

export class PhotoEditor {
    constructor({ container, onSave, onBack }) {
        this.container = container;
        this.onSave = onSave;
        this.onBack = onBack;

        // Image
        this._img = null;
        this._filename = 'image.png';
        this._undo = new UndoStack(30);

        // Viewport transform
        this._zoom = 1;
        this._panX = 0;
        this._panY = 0;
        this._fitScale = 1;
        this._imgRect = null; // cached { x, y, w, h, scale }

        // Adjustments
        this._adj = { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0, hueRotate: 0, blur: 0 };
        this._filter = 'none';

        // Crop
        this._cropActive = false;
        this._cropRect = null;
        this._cropRatio = null;
        this._cropHandle = null;
        this._cropDragInit = null;

        // Annotations
        this._annotations = [];
        this._selectedAnn = null;
        this._drawTool = 'pen';
        this._drawColor = '#ff4757';
        this._drawSize = 3;
        this._stepCounter = 1;

        // Active sidebar tool
        this._sidebarTool = null;

        // Pointer interaction
        this._isPointerDown = false;
        this._dragStart = null;
        this._dragStartCanvas = null;
        this._lastMovePos = null;
        this._lastPointerPos = null;
        this._penPoints = [];
        this._textInput = null;

        // Pan
        this._spaceHeld = false;
        this._isPanning = false;
        this._panStartX = 0;
        this._panStartY = 0;
        this._panStartPanX = 0;
        this._panStartPanY = 0;

        // Pinch zoom
        this._activePointers = [];
        this._isPinching = false;
        this._pinchDist = 0;
        this._pinchZoom = 1;

        // Annotation drag
        this._isDraggingAnn = false;
        this._annDragStart = null;

        // Color picker
        this._pickedColors = [];
        this._pickingColor = false;

        // Render scheduling
        this._renderPending = false;

        // Canvas (set in _build)
        this._canvas = null;
        this._ctx = null;
        this._canvasWrap = null;

        // Bound handlers
        this._boundPointerDown = this._onPointerDown.bind(this);
        this._boundPointerMove = this._onPointerMove.bind(this);
        this._boundPointerUp = this._onPointerUp.bind(this);
        this._boundWheel = this._onWheel.bind(this);
        this._boundKeydown = this._onKeydown.bind(this);
        this._boundKeyup = this._onKeyup.bind(this);

        this._build();
    }

    // ═════════════════════════════════════════════════════
    //  UI BUILD
    // ═════════════════════════════════════════════════════

    _build() {
        this.container.innerHTML = '';

        // Header
        const header = el('div', { class: 'pe-header' }, [
            el('button', { class: 'pe-header__back', onclick: () => this.onBack?.() }, '\u2190 Back'),
            el('div', { class: 'pe-header__title' }, 'Photo Editor'),
            el('div', { class: 'pe-header__actions' }, [
                el('button', { class: 'pe-header__btn', title: 'Undo (Ctrl+Z)', onclick: () => this._doUndo() }, '\u21A9'),
                el('button', { class: 'pe-header__btn', title: 'Redo (Ctrl+Y)', onclick: () => this._doRedo() }, '\u21AA'),
                el('span', { class: 'pe-header__sep' }),
                el('button', { class: 'pe-header__btn', title: 'Zoom Out (\u2212)', onclick: () => this._zoomBy(0.8) }, '\u2212'),
                this._zoomLabel = el('button', { class: 'pe-header__btn pe-header__zoom-label', title: 'Fit to View (0)', onclick: () => this._fitToView() }, '100%'),
                el('button', { class: 'pe-header__btn', title: 'Zoom In (+)', onclick: () => this._zoomBy(1.25) }, '+'),
                el('span', { class: 'pe-header__sep' }),
                el('button', { class: 'pe-header__btn', title: 'Before/After', onclick: () => this._toggleCompare() }, '\u25E8'),
                el('button', { class: 'pe-header__btn pe-header__btn--primary', onclick: () => this._selectTool('export') }, 'Export'),
            ]),
        ]);

        // Canvas
        this._canvas = el('canvas', { class: 'pe-canvas' });
        this._ctx = this._canvas.getContext('2d');
        this._canvas.style.touchAction = 'none';
        this._canvasWrap = el('div', { class: 'pe-canvas-wrap' }, [this._canvas]);

        // Compare overlay
        this._compareOverlay = el('div', { class: 'pe-compare', hidden: true });

        // Sidebar
        this._sidebar = el('div', { class: 'pe-sidebar' });
        this._buildSidebar();

        // Tool panel
        this._toolPanel = el('div', { class: 'pe-tool-panel' });

        // Status bar
        this._statusBar = el('div', { class: 'pe-statusbar' });
        this._buildStatusBar();

        const workspace = el('div', { class: 'pe-workspace' }, [
            this._sidebar,
            el('div', { class: 'pe-main' }, [this._canvasWrap, this._compareOverlay]),
            this._toolPanel,
        ]);

        this.container.append(header, workspace, this._statusBar);

        // Pointer events on canvas
        this._canvas.addEventListener('pointerdown', this._boundPointerDown);
        this._canvas.addEventListener('pointermove', this._boundPointerMove);
        this._canvas.addEventListener('pointerup', this._boundPointerUp);
        this._canvas.addEventListener('pointerleave', this._boundPointerUp);
        this._canvas.addEventListener('wheel', this._boundWheel, { passive: false });
        document.addEventListener('keydown', this._boundKeydown);
        document.addEventListener('keyup', this._boundKeyup);

        // Responsive canvas sizing
        this._resizeObs = new ResizeObserver(() => this._scheduleRender());
        this._resizeObs.observe(this._canvasWrap);
    }

    _buildSidebar() {
        const tools = [
            { id: 'move', icon: '\u271B', label: 'Move' },
            { id: 'crop', icon: '\u2702', label: 'Crop' },
            { id: 'transform', icon: '\u21BB', label: 'Transform' },
            { id: 'adjust', icon: '\u2600', label: 'Adjust' },
            { id: 'filters', icon: '\u2728', label: 'Filters' },
            { id: 'draw', icon: '\u270F', label: 'Draw' },
            { id: 'color', icon: '\uD83C\uDFA8', label: 'Colors' },
            { id: 'export', icon: '\uD83D\uDCBE', label: 'Export' },
        ];
        this._sidebar.innerHTML = '';
        for (const t of tools) {
            this._sidebar.appendChild(el('button', {
                class: 'pe-sidebar__btn',
                'data-tool': t.id,
                title: t.label,
                onclick: () => this._selectTool(t.id),
            }, [
                el('span', { class: 'pe-sidebar__icon' }, t.icon),
                el('span', { class: 'pe-sidebar__label' }, t.label),
            ]));
        }
    }

    _buildStatusBar() {
        this._statusZoom = el('span', { class: 'pe-statusbar__item' }, '100%');
        this._statusDims = el('span', { class: 'pe-statusbar__item' }, '');
        this._statusCursor = el('span', { class: 'pe-statusbar__item' }, '');
        this._statusTool = el('span', { class: 'pe-statusbar__item' }, '');
        this._statusBar.innerHTML = '';
        this._statusBar.append(
            this._statusZoom,
            el('span', { class: 'pe-statusbar__sep' }, '\u00B7'),
            this._statusDims,
            el('span', { class: 'pe-statusbar__sep' }, '\u00B7'),
            this._statusCursor,
            el('span', { class: 'pe-statusbar__flex' }),
            this._statusTool,
        );
    }

    // ═════════════════════════════════════════════════════
    //  TOOL SELECTION
    // ═════════════════════════════════════════════════════

    _selectTool(toolId) {
        this._sidebarTool = toolId;

        this._sidebar.querySelectorAll('.pe-sidebar__btn').forEach(b => {
            b.classList.toggle('is-active', b.dataset.tool === toolId);
        });

        if (toolId !== 'crop' && this._cropActive) this._cancelCrop();
        if (toolId !== 'move') this._deselectAnnotation();
        this._pickingColor = false;

        this._toolPanel.innerHTML = '';
        this._toolPanel.hidden = false;

        switch (toolId) {
            case 'move':      this._toolPanel.hidden = true; break;
            case 'crop':      this._buildCropPanel(); break;
            case 'transform': this._buildTransformPanel(); break;
            case 'adjust':    this._buildAdjustPanel(); break;
            case 'filters':   this._buildFilterPanel(); break;
            case 'draw':      this._buildDrawPanel(); break;
            case 'color':     this._buildColorPanel(); break;
            case 'export':    this._showExportPanel(); break;
        }
        this._updateCursor();
        this._scheduleRender();
    }

    // ═════════════════════════════════════════════════════
    //  CROP TOOL
    // ═════════════════════════════════════════════════════

    _buildCropPanel() {
        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Crop'),
            el('div', { class: 'pe-crop-presets' },
                CROP_PRESETS.map(p =>
                    el('button', {
                        class: `pe-preset-btn${this._cropRatio === p.ratio && (p.id !== 'free' || this._cropRatio === null) ? ' is-active' : ''}`,
                        onclick: () => this._startCrop(p.ratio),
                    }, p.name)
                )
            ),
            el('div', { class: 'pe-panel__hint' }, 'Drag handles to resize \u00B7 Drag inside to move'),
            el('div', { class: 'pe-panel__actions' }, [
                el('button', { class: 'pe-btn pe-btn--primary', onclick: () => this._applyCrop() }, 'Apply Crop'),
                el('button', { class: 'pe-btn', onclick: () => this._cancelCrop() }, 'Cancel'),
            ]),
        ]);
        this._toolPanel.appendChild(panel);
        this._startCrop(null);
    }

    _startCrop(ratio) {
        this._cropActive = true;
        this._cropRatio = ratio;
        if (!this._img) return;
        const w = this._img.width, h = this._img.height;
        if (ratio) {
            const cropW = Math.min(w, h * ratio);
            const cropH = cropW / ratio;
            this._cropRect = { x: (w - cropW) / 2, y: (h - cropH) / 2, w: cropW, h: cropH };
        } else {
            this._cropRect = { x: 0, y: 0, w, h };
        }
        this._scheduleRender();
    }

    _getCropHandlePositions() {
        const c = this._cropRect;
        if (!c) return [];
        return [
            { id: 'nw', x: c.x, y: c.y },
            { id: 'n', x: c.x + c.w / 2, y: c.y },
            { id: 'ne', x: c.x + c.w, y: c.y },
            { id: 'w', x: c.x, y: c.y + c.h / 2 },
            { id: 'e', x: c.x + c.w, y: c.y + c.h / 2 },
            { id: 'sw', x: c.x, y: c.y + c.h },
            { id: 's', x: c.x + c.w / 2, y: c.y + c.h },
            { id: 'se', x: c.x + c.w, y: c.y + c.h },
        ];
    }

    _hitTestCropHandle(imgX, imgY) {
        if (!this._cropRect || !this._imgRect) return null;
        const radius = 14 / this._imgRect.scale;
        for (const h of this._getCropHandlePositions()) {
            if (Math.abs(imgX - h.x) < radius && Math.abs(imgY - h.y) < radius) return h.id;
        }
        const c = this._cropRect;
        if (imgX >= c.x && imgX <= c.x + c.w && imgY >= c.y && imgY <= c.y + c.h) return 'move';
        return null;
    }

    _updateCropDrag(imgX, imgY) {
        if (!this._cropDragInit || !this._cropHandle || !this._dragStart) return;
        const init = this._cropDragInit;
        const dx = imgX - this._dragStart.imgX;
        const dy = imgY - this._dragStart.imgY;
        const cr = { ...init };

        switch (this._cropHandle) {
            case 'nw': cr.x = init.x + dx; cr.y = init.y + dy; cr.w = init.w - dx; cr.h = init.h - dy; break;
            case 'n':  cr.y = init.y + dy; cr.h = init.h - dy; break;
            case 'ne': cr.y = init.y + dy; cr.w = init.w + dx; cr.h = init.h - dy; break;
            case 'w':  cr.x = init.x + dx; cr.w = init.w - dx; break;
            case 'e':  cr.w = init.w + dx; break;
            case 'sw': cr.x = init.x + dx; cr.w = init.w - dx; cr.h = init.h + dy; break;
            case 's':  cr.h = init.h + dy; break;
            case 'se': cr.w = init.w + dx; cr.h = init.h + dy; break;
            case 'move': cr.x = init.x + dx; cr.y = init.y + dy; break;
        }

        // Normalize
        if (cr.w < 0) { cr.x += cr.w; cr.w = -cr.w; }
        if (cr.h < 0) { cr.y += cr.h; cr.h = -cr.h; }
        cr.w = Math.max(20, cr.w);
        cr.h = Math.max(20, cr.h);

        // Ratio constraint
        if (this._cropRatio && this._cropHandle !== 'move') {
            if (['n', 's'].includes(this._cropHandle)) {
                cr.w = cr.h * this._cropRatio;
            } else {
                cr.h = cr.w / this._cropRatio;
            }
        }

        // Clamp to image
        cr.x = Math.max(0, cr.x);
        cr.y = Math.max(0, cr.y);
        if (cr.x + cr.w > this._img.width) {
            if (this._cropHandle === 'move') cr.x = this._img.width - cr.w;
            else cr.w = this._img.width - cr.x;
        }
        if (cr.y + cr.h > this._img.height) {
            if (this._cropHandle === 'move') cr.y = this._img.height - cr.h;
            else cr.h = this._img.height - cr.y;
        }

        this._cropRect = cr;
    }

    _applyCrop() {
        if (!this._cropRect || !this._img) return;
        const { x, y, w, h } = this._cropRect;
        const tc = document.createElement('canvas');
        tc.width = Math.round(w);
        tc.height = Math.round(h);
        const tctx = tc.getContext('2d');
        tctx.filter = this._buildFilterString();
        tctx.drawImage(this._img, x, y, w, h, 0, 0, tc.width, tc.height);
        tctx.filter = 'none';

        const newImg = new Image();
        newImg.onload = () => {
            this._img = newImg;
            this._cropActive = false;
            this._cropRect = null;
            this._resetAdjustments();
            this._pushUndo();
            this._fitToView();
        };
        newImg.src = tc.toDataURL('image/png');
    }

    _cancelCrop() {
        this._cropActive = false;
        this._cropRect = null;
        this._cropHandle = null;
        this._scheduleRender();
    }

    // ═════════════════════════════════════════════════════
    //  TRANSFORM TOOL (Resize + Rotate + Flip)
    // ═════════════════════════════════════════════════════

    _buildTransformPanel() {
        if (!this._img) return;
        const w = this._img.width, h = this._img.height;
        let lockRatio = true, newW = w, newH = h;

        const widthInput = el('input', {
            class: 'pe-input', type: 'number', value: String(w), min: '1', max: '10000',
            oninput: (e) => { newW = parseInt(e.target.value) || w; if (lockRatio) { newH = Math.round(newW * (h / w)); heightInput.value = String(newH); } },
        });
        const heightInput = el('input', {
            class: 'pe-input', type: 'number', value: String(h), min: '1', max: '10000',
            oninput: (e) => { newH = parseInt(e.target.value) || h; if (lockRatio) { newW = Math.round(newH * (w / h)); widthInput.value = String(newW); } },
        });
        const lockBtn = el('button', {
            class: 'pe-lock-btn is-locked',
            onclick: () => { lockRatio = !lockRatio; lockBtn.classList.toggle('is-locked', lockRatio); lockBtn.textContent = lockRatio ? '\uD83D\uDD12' : '\uD83D\uDD13'; },
        }, '\uD83D\uDD12');

        const presets = [
            { label: '1920\u00D71080', w: 1920, h: 1080 },
            { label: '1280\u00D7720', w: 1280, h: 720 },
            { label: '800\u00D7600', w: 800, h: 600 },
            { label: '512\u00D7512', w: 512, h: 512 },
            { label: '50%', w: Math.round(w / 2), h: Math.round(h / 2) },
            { label: '25%', w: Math.round(w / 4), h: Math.round(h / 4) },
        ];

        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Transform'),
            el('div', { class: 'pe-panel__subtitle' }, `Size: ${w}\u00D7${h}`),
            el('div', { class: 'pe-resize-inputs' }, [
                el('label', { class: 'pe-label' }, ['W', widthInput]),
                lockBtn,
                el('label', { class: 'pe-label' }, ['H', heightInput]),
            ]),
            el('div', { class: 'pe-resize-presets' },
                presets.map(p => el('button', {
                    class: 'pe-preset-btn',
                    onclick: () => { newW = p.w; newH = p.h; widthInput.value = String(p.w); heightInput.value = String(p.h); },
                }, p.label))
            ),
            el('div', { class: 'pe-panel__actions' }, [
                el('button', { class: 'pe-btn pe-btn--primary', onclick: () => this._applyResize(newW, newH) }, 'Resize'),
            ]),
            el('div', { class: 'pe-panel__subtitle', style: { marginTop: '12px' } }, 'Rotate & Flip'),
            el('div', { class: 'pe-rotate-grid' }, [
                el('button', { class: 'pe-btn', onclick: () => this._applyRotate(-90) }, '\u21B6 90\u00B0'),
                el('button', { class: 'pe-btn', onclick: () => this._applyRotate(90) }, '\u21B7 90\u00B0'),
                el('button', { class: 'pe-btn', onclick: () => this._applyRotate(180) }, '180\u00B0'),
                el('button', { class: 'pe-btn', onclick: () => this._applyFlip('h') }, '\u2194 Flip H'),
                el('button', { class: 'pe-btn', onclick: () => this._applyFlip('v') }, '\u2195 Flip V'),
            ]),
        ]);
        this._toolPanel.innerHTML = '';
        this._toolPanel.appendChild(panel);
    }

    _applyResize(nw, nh) {
        if (!this._img || nw < 1 || nh < 1) return;
        const tc = document.createElement('canvas');
        tc.width = nw; tc.height = nh;
        tc.getContext('2d').drawImage(this._img, 0, 0, nw, nh);
        const img = new Image();
        img.onload = () => { this._img = img; this._pushUndo(); this._fitToView(); this._selectTool('transform'); };
        img.src = tc.toDataURL('image/png');
    }

    _applyRotate(deg) {
        if (!this._img) return;
        const rad = (deg * Math.PI) / 180;
        const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
        const nw = Math.round(this._img.width * cos + this._img.height * sin);
        const nh = Math.round(this._img.width * sin + this._img.height * cos);
        const tc = document.createElement('canvas');
        tc.width = nw; tc.height = nh;
        const ctx = tc.getContext('2d');
        ctx.translate(nw / 2, nh / 2);
        ctx.rotate(rad);
        ctx.drawImage(this._img, -this._img.width / 2, -this._img.height / 2);
        const img = new Image();
        img.onload = () => { this._img = img; this._pushUndo(); this._fitToView(); };
        img.src = tc.toDataURL('image/png');
    }

    _applyFlip(dir) {
        if (!this._img) return;
        const tc = document.createElement('canvas');
        tc.width = this._img.width; tc.height = this._img.height;
        const ctx = tc.getContext('2d');
        if (dir === 'h') { ctx.translate(tc.width, 0); ctx.scale(-1, 1); }
        else { ctx.translate(0, tc.height); ctx.scale(1, -1); }
        ctx.drawImage(this._img, 0, 0);
        const img = new Image();
        img.onload = () => { this._img = img; this._pushUndo(); this._scheduleRender(); };
        img.src = tc.toDataURL('image/png');
    }

    // ═════════════════════════════════════════════════════
    //  ADJUST TOOL
    // ═════════════════════════════════════════════════════

    _buildAdjustPanel() {
        const sliders = [
            { key: 'brightness', label: 'Brightness', min: 0, max: 200, def: 100, unit: '%' },
            { key: 'contrast', label: 'Contrast', min: 0, max: 200, def: 100, unit: '%' },
            { key: 'saturation', label: 'Saturation', min: 0, max: 200, def: 100, unit: '%' },
            { key: 'exposure', label: 'Exposure', min: -100, max: 100, def: 0, unit: '' },
            { key: 'temperature', label: 'Temperature', min: -100, max: 100, def: 0, unit: '' },
            { key: 'hueRotate', label: 'Hue', min: 0, max: 360, def: 0, unit: '\u00B0' },
            { key: 'blur', label: 'Blur', min: 0, max: 20, def: 0, unit: 'px' },
        ];
        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Adjustments'),
            ...sliders.map(s => this._createSlider(s)),
            el('div', { class: 'pe-panel__actions' }, [
                el('button', { class: 'pe-btn', onclick: () => { this._resetAdjustments(); this._buildAdjustPanel(); } }, 'Reset All'),
                el('button', { class: 'pe-btn pe-btn--primary', onclick: () => this._bakeAdjustments() }, 'Apply'),
            ]),
        ]);
        this._toolPanel.innerHTML = '';
        this._toolPanel.appendChild(panel);
    }

    _createSlider({ key, label, min, max, def, unit }) {
        const valueLabel = el('span', { class: 'pe-slider__value' }, `${this._adj[key]}${unit}`);
        const range = el('input', {
            class: 'pe-slider__range', type: 'range', min: String(min), max: String(max), value: String(this._adj[key]),
            oninput: (e) => { this._adj[key] = parseFloat(e.target.value); valueLabel.textContent = `${this._adj[key]}${unit}`; this._scheduleRender(); },
        });
        const resetBtn = el('button', {
            class: 'pe-slider__reset', title: 'Reset',
            onclick: () => { this._adj[key] = def; range.value = String(def); valueLabel.textContent = `${def}${unit}`; this._scheduleRender(); },
        }, '\u21BA');
        return el('div', { class: 'pe-slider' }, [
            el('div', { class: 'pe-slider__header' }, [el('span', { class: 'pe-slider__label' }, label), valueLabel, resetBtn]),
            range,
        ]);
    }

    _resetAdjustments() {
        this._adj = { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0, hueRotate: 0, blur: 0 };
        this._filter = 'none';
        this._scheduleRender();
    }

    _bakeAdjustments() {
        if (!this._img) return;
        const tc = document.createElement('canvas');
        tc.width = this._img.width; tc.height = this._img.height;
        const ctx = tc.getContext('2d');
        ctx.filter = this._buildFilterString();
        ctx.drawImage(this._img, 0, 0);
        const img = new Image();
        img.onload = () => { this._img = img; this._resetAdjustments(); this._pushUndo(); this._scheduleRender(); };
        img.src = tc.toDataURL('image/png');
    }

    // ═════════════════════════════════════════════════════
    //  FILTER PRESETS
    // ═════════════════════════════════════════════════════

    _buildFilterPanel() {
        const grid = el('div', { class: 'pe-filter-grid' });
        for (const preset of FILTER_PRESETS) {
            const thumb = el('div', {
                class: `pe-filter-thumb${this._filter === preset.id ? ' is-active' : ''}`,
                onclick: () => { this._filter = preset.id; this._scheduleRender(); this._buildFilterPanel(); },
            }, [
                el('div', { class: 'pe-filter-thumb__preview', style: { filter: preset.filter || 'none' } }),
                el('span', { class: 'pe-filter-thumb__name' }, preset.name),
            ]);
            if (this._img) {
                thumb.querySelector('.pe-filter-thumb__preview').style.backgroundImage = `url(${this._img.src})`;
            }
            grid.appendChild(thumb);
        }
        this._toolPanel.innerHTML = '';
        this._toolPanel.appendChild(el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Filters'),
            grid,
            el('div', { class: 'pe-panel__actions' }, [
                el('button', { class: 'pe-btn pe-btn--primary', onclick: () => this._bakeFilter() }, 'Apply Filter'),
            ]),
        ]));
    }

    _bakeFilter() {
        if (!this._img || this._filter === 'none') return;
        const preset = FILTER_PRESETS.find(f => f.id === this._filter);
        if (!preset) return;
        const tc = document.createElement('canvas');
        tc.width = this._img.width; tc.height = this._img.height;
        const ctx = tc.getContext('2d');
        ctx.filter = preset.filter;
        ctx.drawImage(this._img, 0, 0);
        const img = new Image();
        img.onload = () => { this._img = img; this._filter = 'none'; this._pushUndo(); this._scheduleRender(); };
        img.src = tc.toDataURL('image/png');
    }

    // ═════════════════════════════════════════════════════
    //  DRAW TOOL (Annotations)
    // ═════════════════════════════════════════════════════

    _buildDrawPanel() {
        const tools = [
            { id: 'arrow', icon: '\u2197', label: 'Arrow' },
            { id: 'line', icon: '\u2500', label: 'Line' },
            { id: 'rect', icon: '\u25AD', label: 'Rect' },
            { id: 'ellipse', icon: '\u25CB', label: 'Ellipse' },
            { id: 'text', icon: 'T', label: 'Text' },
            { id: 'pen', icon: '\u270E', label: 'Pen' },
            { id: 'highlight', icon: '\uD83D\uDD8D', label: 'Highlight' },
            { id: 'blur-region', icon: '\u2B1C', label: 'Blur' },
            { id: 'step', icon: '#', label: 'Step' },
        ];

        const colorPalette = el('div', { class: 'pe-ann-colors' },
            ANNOTATION_COLORS.map(c =>
                el('button', {
                    class: `pe-ann-color${this._drawColor === c ? ' is-active' : ''}`,
                    style: { background: c },
                    onclick: () => { this._drawColor = c; this._buildDrawPanel(); },
                })
            )
        );

        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Draw'),
            el('div', { class: 'pe-ann-tools' },
                tools.map(t => el('button', {
                    class: `pe-ann-tool-btn${this._drawTool === t.id ? ' is-active' : ''}`,
                    onclick: () => { this._drawTool = t.id; this._buildDrawPanel(); this._updateCursor(); },
                }, [
                    el('span', { class: 'pe-ann-tool-btn__icon' }, t.icon),
                    el('span', { class: 'pe-ann-tool-btn__label' }, t.label),
                ]))
            ),
            el('div', { class: 'pe-panel__subtitle' }, 'Color'),
            colorPalette,
            el('div', { class: 'pe-panel__subtitle' }, 'Size'),
            el('input', {
                class: 'pe-slider__range', type: 'range', min: '1', max: '20',
                value: String(this._drawSize),
                oninput: (e) => { this._drawSize = parseInt(e.target.value); },
            }),
            el('div', { class: 'pe-panel__actions' }, [
                el('button', { class: 'pe-btn', onclick: () => this._clearAnnotations() }, 'Clear All'),
                el('button', { class: 'pe-btn pe-btn--primary', onclick: () => this._bakeAnnotations() }, 'Apply'),
            ]),
        ]);
        this._toolPanel.innerHTML = '';
        this._toolPanel.appendChild(panel);
    }

    _clearAnnotations() {
        this._annotations = [];
        this._stepCounter = 1;
        this._selectedAnn = null;
        this._scheduleRender();
    }

    _bakeAnnotations() {
        if (!this._img || this._annotations.length === 0) return;
        const tc = document.createElement('canvas');
        tc.width = this._img.width; tc.height = this._img.height;
        const ctx = tc.getContext('2d');
        ctx.drawImage(this._img, 0, 0);
        this._drawAnnotations(ctx, { x: 0, y: 0, w: this._img.width, h: this._img.height, scale: 1 });
        const img = new Image();
        img.onload = () => {
            this._img = img;
            this._annotations = [];
            this._stepCounter = 1;
            this._selectedAnn = null;
            this._pushUndo();
            this._scheduleRender();
        };
        img.src = tc.toDataURL('image/png');
    }

    // ═════════════════════════════════════════════════════
    //  COLOR TOOLS
    // ═════════════════════════════════════════════════════

    _buildColorPanel() {
        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Color Tools'),
            // Eyedropper
            el('div', { class: 'pe-color-section' }, [
                el('div', { class: 'pe-panel__subtitle' }, 'Color Picker'),
                el('button', {
                    class: `pe-btn${this._pickingColor ? ' is-active' : ''}`,
                    onclick: () => { this._pickingColor = !this._pickingColor; this._updateCursor(); this._buildColorPanel(); },
                }, '\uD83D\uDD0D Pick from Image'),
                this._buildEyedropperBtn(),
            ]),
            // Picked colors
            this._pickedColors.length > 0 ? el('div', { class: 'pe-color-section' }, [
                el('div', { class: 'pe-panel__subtitle' }, 'Picked Colors'),
                el('div', { class: 'pe-picked-colors' }, this._pickedColors.map(c => this._createColorSwatch(c))),
            ]) : null,
            // Palette extractor
            el('div', { class: 'pe-color-section' }, [
                el('div', { class: 'pe-panel__subtitle' }, 'Palette Extractor'),
                el('button', { class: 'pe-btn', onclick: () => this._extractPalette() }, 'Extract Palette'),
                el('div', { class: 'pe-palette-result', id: 'pe-palette-result' }),
            ]),
            // Contrast checker
            el('div', { class: 'pe-color-section' }, [
                el('div', { class: 'pe-panel__subtitle' }, 'Contrast Checker'),
                this._buildContrastChecker(),
            ]),
        ].filter(Boolean));
        this._toolPanel.innerHTML = '';
        this._toolPanel.appendChild(panel);
    }

    _buildEyedropperBtn() {
        if (!window.EyeDropper) return el('span');
        return el('button', {
            class: 'pe-btn',
            onclick: async () => {
                try {
                    const result = await new window.EyeDropper().open();
                    if (result?.sRGBHex) {
                        this._pickedColors.unshift(result.sRGBHex);
                        if (this._pickedColors.length > 12) this._pickedColors.pop();
                        this._buildColorPanel();
                    }
                } catch {}
            },
        }, '\uD83D\uDCA7 Pick from Screen');
    }

    _createColorSwatch(hex) {
        return el('div', {
            class: 'pe-color-swatch', style: { background: hex }, title: `${hex} — click to copy`,
            onclick: () => navigator.clipboard?.writeText(hex).catch(() => {}),
        }, [el('span', { class: 'pe-color-swatch__label' }, hex)]);
    }

    _extractPalette() {
        if (!this._img) return;
        const c = document.createElement('canvas');
        const sz = 100;
        const s = Math.min(sz / this._img.width, sz / this._img.height);
        c.width = Math.round(this._img.width * s);
        c.height = Math.round(this._img.height * s);
        c.getContext('2d').drawImage(this._img, 0, 0, c.width, c.height);
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const colors = this._quantizeColors(data, 8);
        const resultEl = this._toolPanel.querySelector('#pe-palette-result');
        if (resultEl) {
            resultEl.innerHTML = '';
            const row = el('div', { class: 'pe-palette-row' });
            const hexArr = [];
            for (const [r, g, b] of colors) {
                const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                row.appendChild(this._createColorSwatch(hex));
                hexArr.push(hex);
            }
            resultEl.appendChild(row);
            resultEl.appendChild(el('button', {
                class: 'pe-btn pe-btn--sm',
                onclick: () => navigator.clipboard?.writeText(hexArr.join(', ')).catch(() => {}),
            }, 'Copy All'));
        }
    }

    _quantizeColors(pixels, count) {
        const map = new Map();
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 128) continue;
            const r = Math.round(pixels[i] / 16) * 16;
            const g = Math.round(pixels[i + 1] / 16) * 16;
            const b = Math.round(pixels[i + 2] / 16) * 16;
            const key = `${r},${g},${b}`;
            map.set(key, (map.get(key) || 0) + 1);
        }
        const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, count * 3);
        const result = [];
        for (const [key] of sorted) {
            const [r, g, b] = key.split(',').map(Number);
            if (!result.some(([rr, gg, bb]) => Math.abs(r - rr) + Math.abs(g - gg) + Math.abs(b - bb) < 60)) {
                result.push([r, g, b]);
                if (result.length >= count) break;
            }
        }
        return result;
    }

    _buildContrastChecker() {
        let fg = '#ffffff', bg = '#000000';
        const resultEl = el('div', { class: 'pe-contrast-result' });
        const previewEl = el('div', { class: 'pe-contrast-preview', style: { background: bg, color: fg, padding: '8px 12px', borderRadius: '6px', textAlign: 'center', fontWeight: '600' } }, 'Sample Text Aa');
        const update = () => {
            const ratio = this._getContrastRatio(fg, bg);
            const aa = ratio >= 4.5, aaa = ratio >= 7;
            resultEl.innerHTML = '';
            resultEl.append(
                el('div', { class: 'pe-contrast-ratio' }, `${ratio.toFixed(2)}:1`),
                el('div', { class: `pe-contrast-badge ${aa ? 'is-pass' : 'is-fail'}` }, `AA ${aa ? 'Pass' : 'Fail'}`),
                el('div', { class: `pe-contrast-badge ${aaa ? 'is-pass' : 'is-fail'}` }, `AAA ${aaa ? 'Pass' : 'Fail'}`),
            );
            previewEl.style.background = bg;
            previewEl.style.color = fg;
        };
        const fgInput = el('input', { class: 'pe-color-input', type: 'color', value: fg, oninput: (e) => { fg = e.target.value; update(); } });
        const bgInput = el('input', { class: 'pe-color-input', type: 'color', value: bg, oninput: (e) => { bg = e.target.value; update(); } });
        setTimeout(update, 0);
        return el('div', { class: 'pe-contrast-wrap' }, [
            el('div', { class: 'pe-contrast-inputs' }, [
                el('label', { class: 'pe-label' }, ['FG', fgInput]),
                el('label', { class: 'pe-label' }, ['BG', bgInput]),
            ]),
            previewEl, resultEl,
        ]);
    }

    _getContrastRatio(fg, bg) {
        const lum = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            const lin = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        const l1 = lum(fg), l2 = lum(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    // ═════════════════════════════════════════════════════
    //  EXPORT
    // ═════════════════════════════════════════════════════

    _showExportPanel() {
        if (!this._img) return;
        let format = 'png', quality = 92;
        const img = this._img;
        const sizeLabel = el('div', { class: 'pe-export-size' }, '');
        const qualityLabel = el('span', { class: 'pe-slider__value' }, `${quality}%`);

        const updateSize = () => {
            const tc = document.createElement('canvas');
            tc.width = img.width; tc.height = img.height;
            tc.getContext('2d').drawImage(img, 0, 0);
            tc.toBlob(blob => { if (blob) sizeLabel.textContent = `Estimated: ${this._formatSize(blob.size)}`; },
                `image/${format === 'jpg' ? 'jpeg' : format}`, quality / 100);
        };

        const formatSelect = el('select', {
            class: 'pe-select',
            onchange: (e) => { format = e.target.value; updateSize(); },
        }, [el('option', { value: 'png' }, 'PNG'), el('option', { value: 'jpg' }, 'JPEG'), el('option', { value: 'webp' }, 'WebP')]);

        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Export'),
            el('div', { class: 'pe-panel__subtitle' }, `${img.width}\u00D7${img.height}`),
            el('div', { class: 'pe-export-row' }, [el('label', { class: 'pe-label' }, ['Format', formatSelect])]),
            el('div', { class: 'pe-slider' }, [
                el('div', { class: 'pe-slider__header' }, [el('span', { class: 'pe-slider__label' }, 'Quality'), qualityLabel]),
                el('input', {
                    class: 'pe-slider__range', type: 'range', min: '10', max: '100', value: String(quality),
                    oninput: (e) => { quality = parseInt(e.target.value); qualityLabel.textContent = `${quality}%`; updateSize(); },
                }),
            ]),
            sizeLabel,
            el('div', { class: 'pe-export-actions' }, [
                el('button', { class: 'pe-btn pe-btn--primary pe-btn--lg', onclick: () => this._doExport(format, quality) }, '\u2B07 Download'),
                el('button', { class: 'pe-btn pe-btn--lg', onclick: () => this._copyToClipboard(format, quality) }, '\uD83D\uDCCB Copy'),
                el('button', { class: 'pe-btn pe-btn--lg', onclick: () => this._saveToGallery(format, quality) }, '\uD83D\uDCBE Save'),
            ]),
        ]);
        this._toolPanel.innerHTML = '';
        this._toolPanel.appendChild(panel);
        setTimeout(updateSize, 50);
    }

    _getExportCanvas() {
        const tc = document.createElement('canvas');
        tc.width = this._img.width; tc.height = this._img.height;
        const ctx = tc.getContext('2d');
        ctx.filter = this._buildFilterString();
        ctx.drawImage(this._img, 0, 0);
        ctx.filter = 'none';
        this._drawAnnotations(ctx, { x: 0, y: 0, w: this._img.width, h: this._img.height, scale: 1 });
        return tc;
    }

    _doExport(format, quality) {
        const canvas = this._getExportCanvas();
        const mime = `image/${format === 'jpg' ? 'jpeg' : format}`;
        canvas.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this._filename.replace(/\.[^.]+$/, '') + `.${format === 'jpg' ? 'jpeg' : format}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, mime, quality / 100);
    }

    async _copyToClipboard() {
        const canvas = this._getExportCanvas();
        try {
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            if (blob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } catch (e) { console.warn('[PhotoEditor] Clipboard write failed:', e); }
    }

    _saveToGallery(format, quality) {
        const canvas = this._getExportCanvas();
        canvas.toBlob(blob => { if (blob) this.onSave?.(blob, this._filename); },
            `image/${format === 'jpg' ? 'jpeg' : format}`, quality / 100);
    }

    // ═════════════════════════════════════════════════════
    //  CANVAS & TRANSFORM
    // ═════════════════════════════════════════════════════

    _scheduleRender() {
        if (this._renderPending) return;
        this._renderPending = true;
        requestAnimationFrame(() => { this._renderPending = false; this._render(); });
    }

    _render() {
        if (!this._img || !this._canvasWrap || !this._canvas) return;

        const cw = this._canvasWrap.clientWidth;
        const ch = this._canvasWrap.clientHeight;
        if (cw < 1 || ch < 1) return;

        if (this._canvas.width !== cw || this._canvas.height !== ch) {
            this._canvas.width = cw;
            this._canvas.height = ch;
        }

        const ctx = this._ctx;
        const img = this._img;

        // Dark workspace background
        ctx.fillStyle = '#12121a';
        ctx.fillRect(0, 0, cw, ch);

        // Calculate image position with zoom/pan
        this._fitScale = Math.min((cw - 24) / img.width, (ch - 24) / img.height, 1);
        const scale = this._fitScale * this._zoom;
        const iw = img.width * scale;
        const ih = img.height * scale;
        const ix = (cw - iw) / 2 + this._panX;
        const iy = (ch - ih) / 2 + this._panY;
        this._imgRect = { x: ix, y: iy, w: iw, h: ih, scale };

        // Checkerboard (transparency indicator)
        this._drawCheckerboard(ctx, ix, iy, iw, ih);

        // Draw image with live adjustments
        ctx.save();
        ctx.filter = this._buildFilterString();
        ctx.drawImage(img, ix, iy, iw, ih);
        ctx.restore();

        // Draw committed annotations
        this._drawAnnotations(ctx);

        // Draw in-progress drawing
        if (this._isPointerDown && this._sidebarTool === 'draw' && this._dragStart) {
            this._drawInProgress(ctx);
        }

        // Crop overlay with handles
        if (this._cropActive && this._cropRect) {
            this._drawCropOverlay(ctx);
        }

        // Selection handles on selected annotation
        if (this._selectedAnn) {
            this._drawSelectionHandles(ctx);
        }

        // Update status bar
        this._updateStatusBar();
    }

    _drawCheckerboard(ctx, x, y, w, h) {
        const sz = 8;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        for (let row = Math.floor(y / sz); row * sz < y + h; row++) {
            for (let col = Math.floor(x / sz); col * sz < x + w; col++) {
                ctx.fillStyle = (col + row) % 2 === 0 ? '#2a2a3a' : '#222233';
                ctx.fillRect(col * sz, row * sz, sz, sz);
            }
        }
        ctx.restore();
    }

    _buildFilterString() {
        const a = this._adj;
        let f = '';
        if (a.brightness !== 100) f += `brightness(${a.brightness}%) `;
        if (a.contrast !== 100) f += `contrast(${a.contrast}%) `;
        if (a.saturation !== 100) f += `saturate(${a.saturation}%) `;
        if (a.hueRotate !== 0) f += `hue-rotate(${a.hueRotate}deg) `;
        if (a.blur > 0) f += `blur(${a.blur}px) `;
        if (a.exposure !== 0) f += `brightness(${100 + a.exposure}%) `;
        if (this._filter !== 'none') {
            const preset = FILTER_PRESETS.find(p => p.id === this._filter);
            if (preset?.filter) f += preset.filter + ' ';
        }
        return f.trim() || 'none';
    }

    _canvasToImage(cx, cy) {
        const r = this._imgRect;
        if (!r) return { x: 0, y: 0 };
        return { x: (cx - r.x) / r.scale, y: (cy - r.y) / r.scale };
    }

    _imageToCanvas(ix, iy) {
        const r = this._imgRect;
        if (!r) return { x: 0, y: 0 };
        return { x: ix * r.scale + r.x, y: iy * r.scale + r.y };
    }

    _getPointerPos(e) {
        const rect = this._canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const img = this._canvasToImage(cx, cy);
        return { cx, cy, imgX: img.x, imgY: img.y };
    }

    // ═════════════════════════════════════════════════════
    //  ZOOM & PAN
    // ═════════════════════════════════════════════════════

    _onWheel(e) {
        e.preventDefault();
        if (!this._img) return;
        const pos = this._getPointerPos(e);
        this._zoomTo(this._zoom * (e.deltaY > 0 ? 0.9 : 1.1), pos.cx, pos.cy);
    }

    _zoomTo(newZoom, cx, cy) {
        newZoom = Math.max(0.1, Math.min(20, newZoom));
        if (!this._img) return;

        // Keep the point under cursor stable
        const oldScale = this._fitScale * this._zoom;
        const cw = this._canvas.width, ch = this._canvas.height;
        const oldIx = (cw - this._img.width * oldScale) / 2 + this._panX;
        const oldIy = (ch - this._img.height * oldScale) / 2 + this._panY;
        const imgX = (cx - oldIx) / oldScale;
        const imgY = (cy - oldIy) / oldScale;

        this._zoom = newZoom;
        const newScale = this._fitScale * this._zoom;
        const newIw = this._img.width * newScale;
        const newIh = this._img.height * newScale;
        this._panX = cx - imgX * newScale - (cw - newIw) / 2;
        this._panY = cy - imgY * newScale - (ch - newIh) / 2;

        this._scheduleRender();
    }

    _zoomBy(factor) {
        if (!this._canvas) return;
        this._zoomTo(this._zoom * factor, this._canvas.width / 2, this._canvas.height / 2);
    }

    _fitToView() {
        this._zoom = 1;
        this._panX = 0;
        this._panY = 0;
        this._scheduleRender();
    }

    // ═════════════════════════════════════════════════════
    //  POINTER EVENTS
    // ═════════════════════════════════════════════════════

    _onPointerDown(e) {
        e.preventDefault();

        // Track for pinch zoom
        this._activePointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
        if (this._activePointers.length >= 2) {
            this._isPinching = true;
            this._pinchDist = this._calcPinchDist();
            this._pinchZoom = this._zoom;
            this._isPointerDown = false;
            return;
        }

        this._canvas.setPointerCapture(e.pointerId);
        this._isPointerDown = true;
        const pos = this._getPointerPos(e);
        this._dragStart = { imgX: pos.imgX, imgY: pos.imgY };
        this._dragStartCanvas = { cx: pos.cx, cy: pos.cy };
        this._lastMovePos = null;

        // Pan: space held or middle button
        if (this._spaceHeld || e.button === 1) {
            this._isPanning = true;
            this._panStartX = pos.cx; this._panStartY = pos.cy;
            this._panStartPanX = this._panX; this._panStartPanY = this._panY;
            return;
        }

        const tool = this._sidebarTool;

        // Crop handle
        if (tool === 'crop' && this._cropActive && this._cropRect) {
            const handle = this._hitTestCropHandle(pos.imgX, pos.imgY);
            if (handle) {
                this._cropHandle = handle;
                this._cropDragInit = { ...this._cropRect };
                return;
            }
        }

        // Move tool: select annotation or pan
        if (tool === 'move') {
            const hit = this._hitTestAnnotation(pos.imgX, pos.imgY);
            if (hit) {
                this._selectAnnotation(hit);
                this._isDraggingAnn = true;
                this._annDragStart = { imgX: pos.imgX, imgY: pos.imgY };
                return;
            }
            this._deselectAnnotation();
            this._isPanning = true;
            this._panStartX = pos.cx; this._panStartY = pos.cy;
            this._panStartPanX = this._panX; this._panStartPanY = this._panY;
            return;
        }

        // Color picker
        if (this._pickingColor) {
            this._pickColorAt(pos.cx, pos.cy);
            this._isPointerDown = false;
            return;
        }

        // Draw tools
        if (tool === 'draw') {
            if (this._drawTool === 'text') {
                this._startTextInput(pos.imgX, pos.imgY);
                this._isPointerDown = false;
                return;
            }
            if (this._drawTool === 'step') {
                this._annotations.push(new Annotation('step', { x: pos.imgX, y: pos.imgY, number: this._stepCounter++, color: this._drawColor }));
                this._scheduleRender();
                this._isPointerDown = false;
                return;
            }
            if (this._drawTool === 'pen' || this._drawTool === 'highlight') {
                this._penPoints = [{ x: pos.imgX, y: pos.imgY }];
                return;
            }
            // Shape tools start — preview on move
            return;
        }
    }

    _onPointerMove(e) {
        // Update pinch tracking
        const idx = this._activePointers.findIndex(p => p.id === e.pointerId);
        if (idx >= 0) { this._activePointers[idx].x = e.clientX; this._activePointers[idx].y = e.clientY; }

        if (this._isPinching && this._activePointers.length >= 2) {
            const dist = this._calcPinchDist();
            this._zoom = Math.max(0.1, Math.min(20, this._pinchZoom * dist / this._pinchDist));
            this._scheduleRender();
            return;
        }

        const pos = this._getPointerPos(e);
        this._lastPointerPos = pos;

        if (!this._isPointerDown) {
            this._updateCursor();
            return;
        }

        // Pan
        if (this._isPanning) {
            this._panX = this._panStartPanX + (pos.cx - this._panStartX);
            this._panY = this._panStartPanY + (pos.cy - this._panStartY);
            this._scheduleRender();
            return;
        }

        // Crop drag
        if (this._cropHandle && this._cropActive) {
            this._updateCropDrag(pos.imgX, pos.imgY);
            this._scheduleRender();
            return;
        }

        // Annotation drag
        if (this._isDraggingAnn && this._selectedAnn) {
            const dx = pos.imgX - this._annDragStart.imgX;
            const dy = pos.imgY - this._annDragStart.imgY;
            this._moveAnnotation(this._selectedAnn, dx, dy);
            this._annDragStart = { imgX: pos.imgX, imgY: pos.imgY };
            this._scheduleRender();
            return;
        }

        // Draw tool
        if (this._sidebarTool === 'draw' && this._dragStart) {
            this._lastMovePos = { imgX: pos.imgX, imgY: pos.imgY };
            if (this._drawTool === 'pen' || this._drawTool === 'highlight') {
                this._penPoints.push({ x: pos.imgX, y: pos.imgY });
            }
            this._scheduleRender();
        }
    }

    _onPointerUp(e) {
        this._activePointers = this._activePointers.filter(p => p.id !== e.pointerId);
        if (this._isPinching && this._activePointers.length < 2) this._isPinching = false;
        if (!this._isPointerDown) return;
        this._isPointerDown = false;
        try { this._canvas.releasePointerCapture(e.pointerId); } catch {}

        const pos = this._getPointerPos(e);

        if (this._isPanning) { this._isPanning = false; return; }
        if (this._cropHandle) { this._cropHandle = null; this._cropDragInit = null; return; }
        if (this._isDraggingAnn) { this._isDraggingAnn = false; this._annDragStart = null; return; }

        // Finalize drawing
        if (this._sidebarTool === 'draw' && this._dragStart) {
            if ((this._drawTool === 'pen' || this._drawTool === 'highlight') && this._penPoints.length > 1) {
                this._annotations.push(new Annotation(this._drawTool, { points: [...this._penPoints], color: this._drawColor, size: this._drawSize }));
                this._penPoints = [];
                this._scheduleRender();
            }

            if (['arrow', 'line', 'rect', 'ellipse', 'blur-region'].includes(this._drawTool) && this._lastMovePos) {
                const x1 = this._dragStart.imgX, y1 = this._dragStart.imgY;
                const x2 = this._lastMovePos.imgX, y2 = this._lastMovePos.imgY;
                if (Math.abs(x2 - x1) > 3 || Math.abs(y2 - y1) > 3) {
                    if (this._drawTool === 'arrow' || this._drawTool === 'line') {
                        this._annotations.push(new Annotation(this._drawTool, { x1, y1, x2, y2, color: this._drawColor, size: this._drawSize }));
                    } else {
                        this._annotations.push(new Annotation(this._drawTool, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: x2 - x1, h: y2 - y1, color: this._drawColor, size: this._drawSize }));
                    }
                }
                this._lastMovePos = null;
                this._scheduleRender();
            }
        }

        this._dragStart = null;
        this._dragStartCanvas = null;
    }

    _calcPinchDist() {
        if (this._activePointers.length < 2) return 1;
        const [a, b] = this._activePointers;
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    // ═════════════════════════════════════════════════════
    //  CANVAS OVERLAYS
    // ═════════════════════════════════════════════════════

    _drawCropOverlay(ctx) {
        const r = this._imgRect;
        const c = this._cropRect;
        const cx = c.x * r.scale + r.x, cy = c.y * r.scale + r.y;
        const cw = c.w * r.scale, ch = c.h * r.scale;

        // Dim outside area
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(r.x, r.y, r.w, cy - r.y);
        ctx.fillRect(r.x, cy, cx - r.x, ch);
        ctx.fillRect(cx + cw, cy, (r.x + r.w) - (cx + cw), ch);
        ctx.fillRect(r.x, cy + ch, r.w, (r.y + r.h) - (cy + ch));

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cw, ch);

        // Rule of thirds
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 2; i++) {
            ctx.beginPath(); ctx.moveTo(cx + cw * i / 3, cy); ctx.lineTo(cx + cw * i / 3, cy + ch); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy + ch * i / 3); ctx.lineTo(cx + cw, cy + ch * i / 3); ctx.stroke();
        }

        // 8 resize handles
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#0a84ff';
        ctx.lineWidth = 1.5;
        const hs = 8, ehs = 6;
        // Corners
        for (const [hx, hy] of [[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]]) {
            ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
            ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
        // Edges
        for (const [hx, hy] of [[cx + cw / 2, cy], [cx + cw / 2, cy + ch], [cx, cy + ch / 2], [cx + cw, cy + ch / 2]]) {
            ctx.fillRect(hx - ehs / 2, hy - ehs / 2, ehs, ehs);
            ctx.strokeRect(hx - ehs / 2, hy - ehs / 2, ehs, ehs);
        }
    }

    _drawSelectionHandles(ctx) {
        const bounds = this._getAnnotationBounds(this._selectedAnn);
        if (!bounds) return;
        const tl = this._imageToCanvas(bounds.x, bounds.y);
        const br = this._imageToCanvas(bounds.x + bounds.w, bounds.y + bounds.h);
        const x = tl.x - 4, y = tl.y - 4, w = br.x - tl.x + 8, h = br.y - tl.y + 8;

        ctx.strokeStyle = '#0a84ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        const hs = 7;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#0a84ff';
        ctx.lineWidth = 1.5;
        for (const [hx, hy] of [[x, y], [x + w - hs, y], [x, y + h - hs], [x + w - hs, y + h - hs]]) {
            ctx.fillRect(hx, hy, hs, hs);
            ctx.strokeRect(hx, hy, hs, hs);
        }
    }

    _drawInProgress(ctx) {
        const r = this._imgRect;
        if (!r || !this._dragStart) return;

        if ((this._drawTool === 'pen' || this._drawTool === 'highlight') && this._penPoints.length > 1) {
            ctx.save();
            ctx.strokeStyle = this._drawColor;
            ctx.lineWidth = this._drawSize * (this._drawTool === 'highlight' ? 4 : 1) * r.scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (this._drawTool === 'highlight') ctx.globalAlpha = 0.35;
            ctx.beginPath();
            const p0 = this._imageToCanvas(this._penPoints[0].x, this._penPoints[0].y);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < this._penPoints.length; i++) {
                const p = this._imageToCanvas(this._penPoints[i].x, this._penPoints[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (!this._lastMovePos) return;
        const start = this._imageToCanvas(this._dragStart.imgX, this._dragStart.imgY);
        const end = this._imageToCanvas(this._lastMovePos.imgX, this._lastMovePos.imgY);

        ctx.save();
        if (this._drawTool === 'arrow' || this._drawTool === 'line') {
            ctx.strokeStyle = this._drawColor;
            ctx.lineWidth = this._drawSize * r.scale;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
            if (this._drawTool === 'arrow') {
                const angle = Math.atan2(end.y - start.y, end.x - start.x);
                const hl = 15 * r.scale;
                ctx.fillStyle = this._drawColor;
                ctx.beginPath(); ctx.moveTo(end.x, end.y);
                ctx.lineTo(end.x - hl * Math.cos(angle - 0.4), end.y - hl * Math.sin(angle - 0.4));
                ctx.lineTo(end.x - hl * Math.cos(angle + 0.4), end.y - hl * Math.sin(angle + 0.4));
                ctx.closePath(); ctx.fill();
            }
        } else if (this._drawTool === 'rect') {
            ctx.strokeStyle = this._drawColor;
            ctx.lineWidth = this._drawSize * r.scale;
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (this._drawTool === 'blur-region') {
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = this._drawSize * r.scale;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (this._drawTool === 'ellipse') {
            const ecx = (start.x + end.x) / 2, ecy = (start.y + end.y) / 2;
            const rx = Math.abs(end.x - start.x) / 2, ry = Math.abs(end.y - start.y) / 2;
            ctx.strokeStyle = this._drawColor;
            ctx.lineWidth = this._drawSize * r.scale;
            ctx.beginPath(); ctx.ellipse(ecx, ecy, rx || 1, ry || 1, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }

    // ═════════════════════════════════════════════════════
    //  DRAW ANNOTATIONS
    // ═════════════════════════════════════════════════════

    _drawAnnotations(ctx, transform) {
        const t = transform || this._imgRect;
        if (!t) return;
        const toC = (ix, iy) => ({ x: ix * t.scale + t.x, y: iy * t.scale + t.y });

        for (const ann of this._annotations) {
            const d = ann.data;
            ctx.save();

            switch (ann.type) {
                case 'arrow': {
                    const p1 = toC(d.x1, d.y1), p2 = toC(d.x2, d.y2);
                    ctx.strokeStyle = d.color; ctx.lineWidth = d.size * t.scale; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    const hl = 15 * t.scale;
                    ctx.fillStyle = d.color;
                    ctx.beginPath(); ctx.moveTo(p2.x, p2.y);
                    ctx.lineTo(p2.x - hl * Math.cos(angle - 0.4), p2.y - hl * Math.sin(angle - 0.4));
                    ctx.lineTo(p2.x - hl * Math.cos(angle + 0.4), p2.y - hl * Math.sin(angle + 0.4));
                    ctx.closePath(); ctx.fill();
                    break;
                }
                case 'line': {
                    const p1 = toC(d.x1, d.y1), p2 = toC(d.x2, d.y2);
                    ctx.strokeStyle = d.color; ctx.lineWidth = d.size * t.scale; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    break;
                }
                case 'rect': {
                    const p = toC(d.x, d.y);
                    ctx.strokeStyle = d.color; ctx.lineWidth = d.size * t.scale;
                    ctx.strokeRect(p.x, p.y, d.w * t.scale, d.h * t.scale);
                    break;
                }
                case 'ellipse': {
                    const center = toC(d.x + d.w / 2, d.y + d.h / 2);
                    ctx.strokeStyle = d.color; ctx.lineWidth = d.size * t.scale;
                    ctx.beginPath();
                    ctx.ellipse(center.x, center.y, Math.abs(d.w) / 2 * t.scale || 1, Math.abs(d.h) / 2 * t.scale || 1, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                }
                case 'text': {
                    const p = toC(d.x, d.y);
                    const fs = Math.max(14, d.size * 6) * t.scale;
                    ctx.font = `bold ${fs}px Inter, system-ui, sans-serif`;
                    ctx.fillStyle = d.color;
                    ctx.fillText(d.text, p.x, p.y);
                    break;
                }
                case 'pen':
                case 'highlight': {
                    if (d.points?.length > 1) {
                        ctx.strokeStyle = d.color;
                        ctx.lineWidth = d.size * (ann.type === 'highlight' ? 4 : 1) * t.scale;
                        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                        if (ann.type === 'highlight') ctx.globalAlpha = 0.35;
                        ctx.beginPath();
                        const p0 = toC(d.points[0].x, d.points[0].y);
                        ctx.moveTo(p0.x, p0.y);
                        for (let i = 1; i < d.points.length; i++) {
                            const p = toC(d.points[i].x, d.points[i].y);
                            ctx.lineTo(p.x, p.y);
                        }
                        ctx.stroke();
                    }
                    break;
                }
                case 'blur-region': {
                    const tl = toC(Math.min(d.x, d.x + d.w), Math.min(d.y, d.y + d.h));
                    const bw = Math.abs(d.w) * t.scale, bh = Math.abs(d.h) * t.scale;
                    if (bw < 2 || bh < 2) break;
                    try {
                        const imgData = ctx.getImageData(tl.x, tl.y, bw, bh);
                        const tmp = document.createElement('canvas');
                        tmp.width = bw; tmp.height = bh;
                        tmp.getContext('2d').putImageData(imgData, 0, 0);
                        const pxSz = 10;
                        const sw = Math.max(1, bw / pxSz), sh = Math.max(1, bh / pxSz);
                        const small = document.createElement('canvas');
                        small.width = sw; small.height = sh;
                        small.getContext('2d').drawImage(tmp, 0, 0, sw, sh);
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(small, 0, 0, sw, sh, tl.x, tl.y, bw, bh);
                        ctx.imageSmoothingEnabled = true;
                    } catch {}
                    break;
                }
                case 'step': {
                    const p = toC(d.x, d.y);
                    const radius = 16 * t.scale;
                    ctx.fillStyle = d.color;
                    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${radius * 1.1}px Inter, system-ui, sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(String(d.number), p.x, p.y);
                    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
                    break;
                }
            }
            ctx.restore();
        }
    }

    // ═════════════════════════════════════════════════════
    //  INLINE TEXT INPUT
    // ═════════════════════════════════════════════════════

    _startTextInput(imgX, imgY) {
        if (this._textInput) this._textInput.remove();
        const cp = this._imageToCanvas(imgX, imgY);
        const fontSize = Math.max(14, this._drawSize * 6) * (this._imgRect?.scale || 1);

        const ta = document.createElement('textarea');
        ta.className = 'pe-text-input';
        ta.style.cssText = `position:absolute;left:${cp.x}px;top:${cp.y}px;color:${this._drawColor};font-size:${fontSize}px;font-family:Inter,system-ui,sans-serif;font-weight:bold;background:rgba(0,0,0,0.4);border:2px solid ${this._drawColor};border-radius:4px;padding:4px 6px;outline:none;resize:both;min-width:60px;min-height:30px;z-index:10;`;
        ta.placeholder = 'Type here...';

        this._canvasWrap.appendChild(ta);
        requestAnimationFrame(() => ta.focus());

        const commit = () => {
            const text = ta.value.trim();
            if (text) {
                this._annotations.push(new Annotation('text', {
                    x: imgX, y: imgY + fontSize / (this._imgRect?.scale || 1),
                    text, color: this._drawColor, size: this._drawSize,
                }));
                this._scheduleRender();
            }
            ta.remove();
            this._textInput = null;
        };

        ta.addEventListener('blur', commit);
        ta.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { ta.value = ''; ta.blur(); }
        });

        this._textInput = ta;
    }

    // ═════════════════════════════════════════════════════
    //  ANNOTATION SELECTION & MOVEMENT
    // ═════════════════════════════════════════════════════

    _hitTestAnnotation(imgX, imgY) {
        for (let i = this._annotations.length - 1; i >= 0; i--) {
            const ann = this._annotations[i];
            const d = ann.data;
            switch (ann.type) {
                case 'rect': case 'blur-region': {
                    const x = Math.min(d.x, d.x + d.w), y = Math.min(d.y, d.y + d.h);
                    if (imgX >= x && imgX <= x + Math.abs(d.w) && imgY >= y && imgY <= y + Math.abs(d.h)) return ann;
                    break;
                }
                case 'ellipse': {
                    const ecx = d.x + d.w / 2, ecy = d.y + d.h / 2;
                    const rx = Math.abs(d.w) / 2, ry = Math.abs(d.h) / 2;
                    if (rx > 0 && ry > 0 && ((imgX - ecx) / rx) ** 2 + ((imgY - ecy) / ry) ** 2 <= 1) return ann;
                    break;
                }
                case 'arrow': case 'line': {
                    if (this._ptLineDist(imgX, imgY, d.x1, d.y1, d.x2, d.y2) < 10) return ann;
                    break;
                }
                case 'pen': case 'highlight': {
                    if (d.points?.length > 1) {
                        for (let j = 1; j < d.points.length; j++) {
                            if (this._ptLineDist(imgX, imgY, d.points[j - 1].x, d.points[j - 1].y, d.points[j].x, d.points[j].y) < 10) return ann;
                        }
                    }
                    break;
                }
                case 'text': {
                    const fs = Math.max(14, d.size * 6);
                    const tw = d.text.length * fs * 0.6;
                    if (imgX >= d.x && imgX <= d.x + tw && imgY >= d.y - fs && imgY <= d.y) return ann;
                    break;
                }
                case 'step': {
                    if (Math.hypot(imgX - d.x, imgY - d.y) < 20) return ann;
                    break;
                }
            }
        }
        return null;
    }

    _ptLineDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    _selectAnnotation(ann) { this._selectedAnn = ann; this._scheduleRender(); }
    _deselectAnnotation() { this._selectedAnn = null; this._isDraggingAnn = false; this._scheduleRender(); }

    _getAnnotationBounds(ann) {
        const d = ann.data;
        switch (ann.type) {
            case 'rect': case 'ellipse': case 'blur-region':
                return { x: Math.min(d.x, d.x + d.w), y: Math.min(d.y, d.y + d.h), w: Math.abs(d.w), h: Math.abs(d.h) };
            case 'arrow': case 'line':
                return { x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2), w: Math.abs(d.x2 - d.x1), h: Math.abs(d.y2 - d.y1) };
            case 'pen': case 'highlight': {
                if (!d.points?.length) return null;
                let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
                for (const p of d.points) { mnX = Math.min(mnX, p.x); mnY = Math.min(mnY, p.y); mxX = Math.max(mxX, p.x); mxY = Math.max(mxY, p.y); }
                return { x: mnX, y: mnY, w: mxX - mnX, h: mxY - mnY };
            }
            case 'text': { const fs = Math.max(14, d.size * 6); return { x: d.x, y: d.y - fs, w: d.text.length * fs * 0.6, h: fs * 1.3 }; }
            case 'step': return { x: d.x - 16, y: d.y - 16, w: 32, h: 32 };
            default: return null;
        }
    }

    _moveAnnotation(ann, dx, dy) {
        const d = ann.data;
        switch (ann.type) {
            case 'rect': case 'ellipse': case 'blur-region': d.x += dx; d.y += dy; break;
            case 'arrow': case 'line': d.x1 += dx; d.y1 += dy; d.x2 += dx; d.y2 += dy; break;
            case 'pen': case 'highlight': d.points?.forEach(p => { p.x += dx; p.y += dy; }); break;
            case 'text': case 'step': d.x += dx; d.y += dy; break;
        }
    }

    // ═════════════════════════════════════════════════════
    //  COLOR PICKER
    // ═════════════════════════════════════════════════════

    _pickColorAt(cx, cy) {
        if (!this._ctx) return;
        const pixel = this._ctx.getImageData(cx, cy, 1, 1).data;
        const hex = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
        this._pickedColors.unshift(hex);
        if (this._pickedColors.length > 12) this._pickedColors.pop();
        navigator.clipboard?.writeText(hex).catch(() => {});
        if (this._sidebarTool === 'color') this._buildColorPanel();
    }

    // ═════════════════════════════════════════════════════
    //  BEFORE / AFTER COMPARE
    // ═════════════════════════════════════════════════════

    _toggleCompare() {
        const vis = !this._compareOverlay.hidden;
        this._compareOverlay.hidden = vis;
        if (!vis && this._img) {
            this._compareOverlay.innerHTML = '';
            const origCanvas = document.createElement('canvas');
            origCanvas.width = this._canvas.width;
            origCanvas.height = this._canvas.height;
            origCanvas.className = 'pe-compare__original';
            const ctx = origCanvas.getContext('2d');

            const firstState = this._undo._stack[0];
            if (firstState) {
                const origImg = new Image();
                origImg.onload = () => {
                    const r = this._imgRect;
                    if (r) { ctx.fillStyle = '#12121a'; ctx.fillRect(0, 0, origCanvas.width, origCanvas.height); ctx.drawImage(origImg, r.x, r.y, r.w, r.h); }
                };
                origImg.src = firstState;
            }

            const slider = el('div', { class: 'pe-compare__slider' });
            const label = el('div', { class: 'pe-compare__label' }, 'Original');
            this._compareOverlay.append(origCanvas, slider, label);

            let dragging = false;
            const onMove = (e) => {
                if (!dragging) return;
                const rect = this._compareOverlay.getBoundingClientRect();
                const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
                const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
                origCanvas.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
                slider.style.left = `${pct}%`;
            };
            slider.addEventListener('mousedown', () => { dragging = true; });
            slider.addEventListener('touchstart', () => { dragging = true; });
            window.addEventListener('mousemove', onMove);
            window.addEventListener('touchmove', onMove);
            window.addEventListener('mouseup', () => { dragging = false; });
            window.addEventListener('touchend', () => { dragging = false; });
            origCanvas.style.clipPath = 'inset(0 50% 0 0)';
            slider.style.left = '50%';
        }
    }

    // ═════════════════════════════════════════════════════
    //  UNDO / REDO
    // ═════════════════════════════════════════════════════

    _pushUndo() { if (this._img) this._undo.push(this._img.src); }

    _doUndo() {
        const s = this._undo.undo();
        if (s) this._loadImageFromSrc(s);
    }

    _doRedo() {
        const s = this._undo.redo();
        if (s) this._loadImageFromSrc(s);
    }

    _loadImageFromSrc(src) {
        const img = new Image();
        img.onload = () => { this._img = img; this._scheduleRender(); };
        img.src = src;
    }

    // ═════════════════════════════════════════════════════
    //  KEYBOARD
    // ═════════════════════════════════════════════════════

    _onKeydown(e) {
        if (this.container.hidden) return;
        if (this._textInput) return;

        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key === 'z') { e.preventDefault(); this._doUndo(); return; }
        if (ctrl && e.key === 'y') { e.preventDefault(); this._doRedo(); return; }
        if (ctrl && e.key === 's') { e.preventDefault(); this._selectTool('export'); return; }
        if (ctrl && e.key === 'c' && !window.getSelection()?.toString()) { e.preventDefault(); this._copyToClipboard(); return; }

        if (e.key === ' ' && !e.repeat) { e.preventDefault(); this._spaceHeld = true; this._updateCursor(); return; }

        if (!ctrl) {
            switch (e.key.toLowerCase()) {
                case 'v': this._selectTool('move'); return;
                case 'c': if (!this._cropActive) this._selectTool('crop'); return;
                case 'a': this._selectTool('adjust'); return;
                case 'f': this._selectTool('filters'); return;
                case 'd': this._selectTool('draw'); return;
                case 'e': this._selectTool('export'); return;
                case 't': this._selectTool('draw'); this._drawTool = 'text'; this._buildDrawPanel(); return;
            }
        }

        if (e.key === '+' || e.key === '=') { this._zoomBy(1.25); return; }
        if (e.key === '-') { this._zoomBy(0.8); return; }
        if (e.key === '0') { this._fitToView(); return; }
        if (e.key === '1') { this._zoomTo(1 / this._fitScale, (this._canvas?.width || 800) / 2, (this._canvas?.height || 600) / 2); return; }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this._selectedAnn) {
                this._annotations = this._annotations.filter(a => a !== this._selectedAnn);
                this._deselectAnnotation();
                return;
            }
            if (this._annotations.length > 0 && this._sidebarTool === 'draw') {
                this._annotations.pop();
                this._scheduleRender();
                return;
            }
        }

        if (e.key === 'Escape') {
            if (this._cropActive) { this._cancelCrop(); return; }
            if (this._selectedAnn) { this._deselectAnnotation(); return; }
        }
    }

    _onKeyup(e) {
        if (e.key === ' ') { this._spaceHeld = false; this._updateCursor(); }
    }

    // ═════════════════════════════════════════════════════
    //  STATUS BAR & CURSOR
    // ═════════════════════════════════════════════════════

    _updateStatusBar() {
        if (!this._img) return;
        const zoom = Math.round(this._zoom * 100);
        if (this._statusZoom) this._statusZoom.textContent = `${zoom}%`;
        if (this._zoomLabel) this._zoomLabel.textContent = `${zoom}%`;
        if (this._statusDims) this._statusDims.textContent = `${this._img.width} \u00D7 ${this._img.height}`;

        if (this._statusCursor && this._lastPointerPos) {
            const x = Math.round(this._lastPointerPos.imgX);
            const y = Math.round(this._lastPointerPos.imgY);
            this._statusCursor.textContent = (x >= 0 && y >= 0 && x <= this._img.width && y <= this._img.height) ? `${x}, ${y}` : '';
        }

        if (this._statusTool) {
            const names = { move: 'Move', crop: 'Crop', transform: 'Transform', adjust: 'Adjust', filters: 'Filters', draw: 'Draw', color: 'Colors', export: 'Export' };
            let txt = names[this._sidebarTool] || '';
            if (this._sidebarTool === 'draw') {
                const sub = { pen: 'Pen', arrow: 'Arrow', line: 'Line', rect: 'Rect', ellipse: 'Ellipse', text: 'Text', highlight: 'Highlight', 'blur-region': 'Blur', step: 'Step' };
                txt += ` \u203A ${sub[this._drawTool] || ''}`;
            }
            this._statusTool.textContent = txt;
        }
    }

    _updateCursor() {
        if (!this._canvas) return;
        if (this._spaceHeld || this._isPanning) {
            this._canvas.style.cursor = this._isPanning ? 'grabbing' : 'grab';
            return;
        }
        const tool = this._sidebarTool;
        if (tool === 'move') {
            if (this._lastPointerPos) {
                const hit = this._hitTestAnnotation(this._lastPointerPos.imgX, this._lastPointerPos.imgY);
                this._canvas.style.cursor = hit ? 'move' : 'grab';
            } else {
                this._canvas.style.cursor = 'grab';
            }
            return;
        }
        if (tool === 'crop' && this._cropActive && this._lastPointerPos) {
            const handle = this._hitTestCropHandle(this._lastPointerPos.imgX, this._lastPointerPos.imgY);
            const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize', move: 'move' };
            this._canvas.style.cursor = cursors[handle] || 'crosshair';
            return;
        }
        if (tool === 'draw' || this._pickingColor) { this._canvas.style.cursor = 'crosshair'; return; }
        this._canvas.style.cursor = 'default';
    }

    // ═════════════════════════════════════════════════════
    //  PUBLIC API
    // ═════════════════════════════════════════════════════

    loadFromDataUrl(dataUrl, name) {
        this._filename = name || 'image.png';

        // Rebuild canvas if removed by showEmpty
        if (!this._canvas) {
            this._canvas = el('canvas', { class: 'pe-canvas' });
            this._ctx = this._canvas.getContext('2d');
            this._canvas.style.touchAction = 'none';
            this._canvasWrap.innerHTML = '';
            this._canvasWrap.appendChild(this._canvas);
            this._canvas.addEventListener('pointerdown', this._boundPointerDown);
            this._canvas.addEventListener('pointermove', this._boundPointerMove);
            this._canvas.addEventListener('pointerup', this._boundPointerUp);
            this._canvas.addEventListener('pointerleave', this._boundPointerUp);
            this._canvas.addEventListener('wheel', this._boundWheel, { passive: false });
        }

        const img = new Image();
        img.onload = () => {
            this._img = img;
            this._zoom = 1; this._panX = 0; this._panY = 0;
            this._annotations = []; this._selectedAnn = null;
            this._stepCounter = 1;
            this._cropActive = false; this._cropRect = null;
            this._resetAdjustments();
            this._pushUndo();
            this._scheduleRender();
            this._selectTool('move');
        };
        img.src = dataUrl;
    }

    showEmpty() {
        this._canvasWrap.innerHTML = '';
        this._canvas = null;
        this._ctx = null;
        this._canvasWrap.appendChild(
            el('div', { class: 'pe-empty' }, [
                el('div', { class: 'pe-empty__icon' }, '\uD83D\uDDBC\uFE0F'),
                el('div', { class: 'pe-empty__text' }, 'Paste an image (Ctrl+V) or drag & drop to start editing'),
            ])
        );
    }

    destroy() {
        this._canvas?.removeEventListener('pointerdown', this._boundPointerDown);
        this._canvas?.removeEventListener('pointermove', this._boundPointerMove);
        this._canvas?.removeEventListener('pointerup', this._boundPointerUp);
        this._canvas?.removeEventListener('pointerleave', this._boundPointerUp);
        this._canvas?.removeEventListener('wheel', this._boundWheel);
        document.removeEventListener('keydown', this._boundKeydown);
        document.removeEventListener('keyup', this._boundKeyup);
        this._resizeObs?.disconnect();
        if (this._textInput) this._textInput.remove();
        this._undo.clear();
        this._img = null;
    }

    // ═════════════════════════════════════════════════════
    //  HELPERS
    // ═════════════════════════════════════════════════════

    _formatSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0, size = bytes;
        while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
        return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
    }
}
