/**
 * PhotoEditor — Full image editor with Canvas2D
 *
 * Features:
 *  - Crop (free + presets), Resize, Rotate/Flip
 *  - Brightness/Contrast/Saturation/Exposure/Sharpness adjustments
 *  - Filter presets (grayscale, sepia, vintage, etc.)
 *  - Annotations (arrows, shapes, text, pen, blur, step numbers, highlighter)
 *  - Color picker, palette extractor, contrast checker
 *  - Export (compress, format convert, copy to clipboard, download)
 *  - Before/After comparison slider
 *  - Full undo/redo (command pattern)
 */
import { el } from '../../utils/dom.js';

// ─── Undo/Redo Command Stack ─────────────────────────────
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
    undo() {
        if (this._index > 0) { this._index--; return this._stack[this._index]; }
        return null;
    }
    redo() {
        if (this._index < this._stack.length - 1) { this._index++; return this._stack[this._index]; }
        return null;
    }
    current() { return this._stack[this._index] || null; }
    canUndo() { return this._index > 0; }
    canRedo() { return this._index < this._stack.length - 1; }
    clear() { this._stack = []; this._index = -1; }
}

// ─── Annotation Objects ──────────────────────────────────
class Annotation {
    constructor(type, data) {
        this.id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        this.type = type;
        this.data = { ...data };
        this.selected = false;
    }
}

// ─── Filter Presets ──────────────────────────────────────
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

// ─── Crop Presets ────────────────────────────────────────
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

export class PhotoEditor {
    constructor({ container, onSave, onBack }) {
        this.container = container;
        this.onSave = onSave;
        this.onBack = onBack;

        this._originalImage = null;
        this._filename = 'image.png';
        this._undo = new UndoStack(30);

        // Current adjustments
        this._adjustments = {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            exposure: 0,
            temperature: 0,
            sharpness: 0,
            blur: 0,
            hueRotate: 0,
        };
        this._activeFilter = 'none';
        this._rotation = 0;
        this._flipH = false;
        this._flipV = false;

        // Crop state
        this._cropActive = false;
        this._cropRect = null;
        this._cropRatio = null;

        // Annotation state
        this._annotations = [];
        this._activeTool = null; // 'arrow' | 'rect' | 'ellipse' | 'text' | 'pen' | 'highlight' | 'blur-region' | 'step' | 'line'
        this._drawingAnnotation = null;
        this._annotationColor = '#ff4757';
        this._annotationSize = 3;
        this._stepCounter = 1;
        this._penPoints = [];

        // Color picker state
        this._pickedColors = [];

        // Canvas
        this._canvas = null;
        this._ctx = null;
        this._displayCanvas = null;
        this._displayCtx = null;

        // Interaction
        this._isDragging = false;
        this._dragStart = null;

        this._boundMouseDown = this._onMouseDown.bind(this);
        this._boundMouseMove = this._onMouseMove.bind(this);
        this._boundMouseUp = this._onMouseUp.bind(this);
        this._boundKeydown = this._onEditorKeydown.bind(this);

        this._build();
    }

    // ─── Build UI ─────────────────────────────────────────────

    _build() {
        this.container.innerHTML = '';

        // Editor header
        const header = el('div', { class: 'pe-header' }, [
            el('button', { class: 'pe-header__back', onclick: () => this.onBack?.() }, '\u2190 Gallery'),
            el('div', { class: 'pe-header__title' }, 'Image Editor'),
            el('div', { class: 'pe-header__actions' }, [
                el('button', {
                    class: 'pe-header__btn',
                    title: 'Undo (Ctrl+Z)',
                    onclick: () => this._doUndo(),
                }, '\u21A9'),
                el('button', {
                    class: 'pe-header__btn',
                    title: 'Redo (Ctrl+Y)',
                    onclick: () => this._doRedo(),
                }, '\u21AA'),
                el('button', {
                    class: 'pe-header__btn pe-header__btn--compare',
                    title: 'Before/After',
                    onclick: () => this._toggleCompare(),
                }, '\u25E8'),
                el('button', {
                    class: 'pe-header__btn pe-header__btn--primary',
                    onclick: () => this._showExportPanel(),
                }, 'Export'),
            ]),
        ]);

        // Canvas area
        this._displayCanvas = el('canvas', { class: 'pe-canvas' });
        this._displayCtx = this._displayCanvas.getContext('2d');
        this._canvasWrap = el('div', { class: 'pe-canvas-wrap' }, [this._displayCanvas]);

        // Compare slider
        this._compareOverlay = el('div', { class: 'pe-compare', hidden: true });

        // Tool sidebar
        this._sidebar = el('div', { class: 'pe-sidebar' });
        this._buildSidebar();

        // Tool options panel (dynamic)
        this._toolPanel = el('div', { class: 'pe-tool-panel' });

        const workspace = el('div', { class: 'pe-workspace' }, [
            this._sidebar,
            el('div', { class: 'pe-main' }, [
                this._canvasWrap,
                this._compareOverlay,
            ]),
            this._toolPanel,
        ]);

        this.container.append(header, workspace);

        // Bind canvas interactions
        this._displayCanvas.addEventListener('mousedown', this._boundMouseDown);
        this._displayCanvas.addEventListener('touchstart', this._boundMouseDown, { passive: false });
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('touchmove', this._boundMouseMove, { passive: false });
        window.addEventListener('mouseup', this._boundMouseUp);
        window.addEventListener('touchend', this._boundMouseUp);
        document.addEventListener('keydown', this._boundKeydown);
    }

    _buildSidebar() {
        const tools = [
            { id: 'crop', icon: '\u2702', label: 'Crop' },
            { id: 'resize', icon: '\u2922', label: 'Resize' },
            { id: 'rotate', icon: '\u21BB', label: 'Rotate' },
            { id: 'adjust', icon: '\u2600', label: 'Adjust' },
            { id: 'filters', icon: '\u2728', label: 'Filters' },
            { id: 'annotate', icon: '\u270F', label: 'Annotate' },
            { id: 'color', icon: '\uD83C\uDFA8', label: 'Colors' },
            { id: 'export', icon: '\uD83D\uDCBE', label: 'Export' },
        ];

        this._sidebar.innerHTML = '';
        for (const tool of tools) {
            const btn = el('button', {
                class: 'pe-sidebar__btn',
                'data-tool': tool.id,
                title: tool.label,
                onclick: () => this._selectTool(tool.id),
            }, [
                el('span', { class: 'pe-sidebar__icon' }, tool.icon),
                el('span', { class: 'pe-sidebar__label' }, tool.label),
            ]);
            this._sidebar.appendChild(btn);
        }
    }

    // ─── Tool Selection ───────────────────────────────────────

    _selectTool(toolId) {
        // Update sidebar active state
        this._sidebar.querySelectorAll('.pe-sidebar__btn').forEach(b => {
            b.classList.toggle('is-active', b.dataset.tool === toolId);
        });

        // Cancel active crop
        if (toolId !== 'crop' && this._cropActive) {
            this._cancelCrop();
        }

        // Cancel active annotation tool
        if (toolId !== 'annotate') {
            this._activeTool = null;
        }

        this._toolPanel.innerHTML = '';
        this._toolPanel.hidden = false;

        switch (toolId) {
            case 'crop': this._buildCropPanel(); break;
            case 'resize': this._buildResizePanel(); break;
            case 'rotate': this._buildRotatePanel(); break;
            case 'adjust': this._buildAdjustPanel(); break;
            case 'filters': this._buildFilterPanel(); break;
            case 'annotate': this._buildAnnotatePanel(); break;
            case 'color': this._buildColorPanel(); break;
            case 'export': this._showExportPanel(); break;
        }
    }

    // ─── CROP Tool ────────────────────────────────────────────

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
        if (!this._originalImage) return;

        const w = this._originalImage.width;
        const h = this._originalImage.height;

        if (ratio) {
            const cropW = Math.min(w, h * ratio);
            const cropH = cropW / ratio;
            this._cropRect = {
                x: (w - cropW) / 2,
                y: (h - cropH) / 2,
                w: cropW,
                h: cropH,
            };
        } else {
            this._cropRect = { x: 0, y: 0, w, h };
        }

        this._render();
    }

    _applyCrop() {
        if (!this._cropRect || !this._originalImage) return;

        const { x, y, w, h } = this._cropRect;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.round(w);
        tempCanvas.height = Math.round(h);
        const tempCtx = tempCanvas.getContext('2d');

        // Apply current transforms first
        this._drawToContext(tempCtx, tempCanvas.width, tempCanvas.height, x, y, w, h);

        const newImg = new Image();
        newImg.onload = () => {
            this._originalImage = newImg;
            this._cropActive = false;
            this._cropRect = null;
            this._resetAdjustments();
            this._pushUndo();
            this._render();
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    _cancelCrop() {
        this._cropActive = false;
        this._cropRect = null;
        this._render();
    }

    // ─── RESIZE Tool ──────────────────────────────────────────

    _buildResizePanel() {
        if (!this._originalImage) return;
        const w = this._originalImage.width;
        const h = this._originalImage.height;
        let lockRatio = true;
        let newW = w, newH = h;

        const widthInput = el('input', {
            class: 'pe-input', type: 'number', value: String(w), min: '1', max: '10000',
            oninput: (e) => {
                newW = parseInt(e.target.value) || w;
                if (lockRatio) {
                    newH = Math.round(newW * (h / w));
                    heightInput.value = String(newH);
                }
            },
        });
        const heightInput = el('input', {
            class: 'pe-input', type: 'number', value: String(h), min: '1', max: '10000',
            oninput: (e) => {
                newH = parseInt(e.target.value) || h;
                if (lockRatio) {
                    newW = Math.round(newH * (w / h));
                    widthInput.value = String(newW);
                }
            },
        });

        const lockBtn = el('button', {
            class: 'pe-lock-btn is-locked',
            onclick: () => {
                lockRatio = !lockRatio;
                lockBtn.classList.toggle('is-locked', lockRatio);
                lockBtn.textContent = lockRatio ? '\uD83D\uDD12' : '\uD83D\uDD13';
            },
        }, '\uD83D\uDD12');

        const presets = [
            { label: '1920\u00D71080', w: 1920, h: 1080 },
            { label: '1280\u00D7720', w: 1280, h: 720 },
            { label: '800\u00D7600', w: 800, h: 600 },
            { label: '512\u00D7512', w: 512, h: 512 },
            { label: '256\u00D7256', w: 256, h: 256 },
            { label: '50%', w: Math.round(w / 2), h: Math.round(h / 2) },
            { label: '25%', w: Math.round(w / 4), h: Math.round(h / 4) },
        ];

        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Resize'),
            el('div', { class: 'pe-panel__subtitle' }, `Current: ${w}\u00D7${h}`),
            el('div', { class: 'pe-resize-inputs' }, [
                el('label', { class: 'pe-label' }, ['W', widthInput]),
                lockBtn,
                el('label', { class: 'pe-label' }, ['H', heightInput]),
            ]),
            el('div', { class: 'pe-resize-presets' },
                presets.map(p =>
                    el('button', {
                        class: 'pe-preset-btn',
                        onclick: () => {
                            newW = p.w; newH = p.h;
                            widthInput.value = String(p.w);
                            heightInput.value = String(p.h);
                        },
                    }, p.label)
                )
            ),
            el('div', { class: 'pe-panel__actions' }, [
                el('button', {
                    class: 'pe-btn pe-btn--primary',
                    onclick: () => this._applyResize(newW, newH),
                }, 'Apply'),
            ]),
        ]);
        this._toolPanel.appendChild(panel);
    }

    _applyResize(newW, newH) {
        if (!this._originalImage || newW < 1 || newH < 1) return;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = newW;
        tempCanvas.height = newH;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(this._originalImage, 0, 0, newW, newH);

        const newImg = new Image();
        newImg.onload = () => {
            this._originalImage = newImg;
            this._pushUndo();
            this._render();
            this._selectTool('resize'); // Refresh panel
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    // ─── ROTATE Tool ──────────────────────────────────────────

    _buildRotatePanel() {
        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Rotate & Flip'),
            el('div', { class: 'pe-rotate-grid' }, [
                el('button', { class: 'pe-btn', onclick: () => this._applyRotate(-90) }, '\u21B6 90\u00B0'),
                el('button', { class: 'pe-btn', onclick: () => this._applyRotate(90) }, '\u21B7 90\u00B0'),
                el('button', { class: 'pe-btn', onclick: () => this._applyRotate(180) }, '180\u00B0'),
                el('button', { class: 'pe-btn', onclick: () => this._applyFlip('h') }, '\u2194 Flip H'),
                el('button', { class: 'pe-btn', onclick: () => this._applyFlip('v') }, '\u2195 Flip V'),
            ]),
        ]);
        this._toolPanel.appendChild(panel);
    }

    _applyRotate(degrees) {
        if (!this._originalImage) return;
        const rad = (degrees * Math.PI) / 180;
        const img = this._originalImage;

        const sin = Math.abs(Math.sin(rad));
        const cos = Math.abs(Math.cos(rad));
        const newW = Math.round(img.width * cos + img.height * sin);
        const newH = Math.round(img.width * sin + img.height * cos);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = newW;
        tempCanvas.height = newH;
        const ctx = tempCanvas.getContext('2d');
        ctx.translate(newW / 2, newH / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        const newImg = new Image();
        newImg.onload = () => {
            this._originalImage = newImg;
            this._pushUndo();
            this._render();
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    _applyFlip(dir) {
        if (!this._originalImage) return;
        const img = this._originalImage;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d');

        if (dir === 'h') {
            ctx.translate(img.width, 0);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(0, img.height);
            ctx.scale(1, -1);
        }
        ctx.drawImage(img, 0, 0);

        const newImg = new Image();
        newImg.onload = () => {
            this._originalImage = newImg;
            this._pushUndo();
            this._render();
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    // ─── ADJUST Tool ──────────────────────────────────────────

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
                el('button', { class: 'pe-btn', onclick: () => this._resetAdjustments() }, 'Reset All'),
                el('button', { class: 'pe-btn pe-btn--primary', onclick: () => this._bakeAdjustments() }, 'Apply'),
            ]),
        ]);
        this._toolPanel.appendChild(panel);
    }

    _createSlider({ key, label, min, max, def, unit }) {
        const valueLabel = el('span', { class: 'pe-slider__value' }, `${this._adjustments[key]}${unit}`);

        const range = el('input', {
            class: 'pe-slider__range',
            type: 'range',
            min: String(min),
            max: String(max),
            value: String(this._adjustments[key]),
            oninput: (e) => {
                this._adjustments[key] = parseFloat(e.target.value);
                valueLabel.textContent = `${this._adjustments[key]}${unit}`;
                this._render();
            },
        });

        const resetBtn = el('button', {
            class: 'pe-slider__reset',
            title: 'Reset',
            onclick: () => {
                this._adjustments[key] = def;
                range.value = String(def);
                valueLabel.textContent = `${def}${unit}`;
                this._render();
            },
        }, '\u21BA');

        return el('div', { class: 'pe-slider' }, [
            el('div', { class: 'pe-slider__header' }, [
                el('span', { class: 'pe-slider__label' }, label),
                valueLabel,
                resetBtn,
            ]),
            range,
        ]);
    }

    _resetAdjustments() {
        this._adjustments = {
            brightness: 100, contrast: 100, saturation: 100,
            exposure: 0, temperature: 0, sharpness: 0, blur: 0, hueRotate: 0,
        };
        this._activeFilter = 'none';
        this._render();
    }

    _bakeAdjustments() {
        // Burn current adjustments into the image
        if (!this._originalImage) return;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this._originalImage.width;
        tempCanvas.height = this._originalImage.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.filter = this._buildFilterString();
        ctx.drawImage(this._originalImage, 0, 0);

        const newImg = new Image();
        newImg.onload = () => {
            this._originalImage = newImg;
            this._resetAdjustments();
            this._pushUndo();
            this._render();
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    // ─── FILTER Presets ───────────────────────────────────────

    _buildFilterPanel() {
        const grid = el('div', { class: 'pe-filter-grid' });
        for (const preset of FILTER_PRESETS) {
            const thumb = el('div', {
                class: `pe-filter-thumb${this._activeFilter === preset.id ? ' is-active' : ''}`,
                onclick: () => {
                    this._activeFilter = preset.id;
                    this._render();
                    this._buildFilterPanel(); // Refresh to update active state
                },
            }, [
                el('div', {
                    class: 'pe-filter-thumb__preview',
                    style: { filter: preset.filter || 'none' },
                }),
                el('span', { class: 'pe-filter-thumb__name' }, preset.name),
            ]);

            // Set preview image as background
            if (this._originalImage) {
                const prevDiv = thumb.querySelector('.pe-filter-thumb__preview');
                prevDiv.style.backgroundImage = `url(${this._originalImage.src})`;
            }

            grid.appendChild(thumb);
        }

        this._toolPanel.innerHTML = '';
        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Filters'),
            grid,
            el('div', { class: 'pe-panel__actions' }, [
                el('button', { class: 'pe-btn pe-btn--primary', onclick: () => this._bakeFilter() }, 'Apply Filter'),
            ]),
        ]);
        this._toolPanel.appendChild(panel);
    }

    _bakeFilter() {
        if (!this._originalImage || this._activeFilter === 'none') return;
        const preset = FILTER_PRESETS.find(f => f.id === this._activeFilter);
        if (!preset) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this._originalImage.width;
        tempCanvas.height = this._originalImage.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.filter = preset.filter;
        ctx.drawImage(this._originalImage, 0, 0);

        const newImg = new Image();
        newImg.onload = () => {
            this._originalImage = newImg;
            this._activeFilter = 'none';
            this._pushUndo();
            this._render();
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    // ─── ANNOTATE Tool ────────────────────────────────────────

    _buildAnnotatePanel() {
        const tools = [
            { id: 'arrow', icon: '\u2197', label: 'Arrow' },
            { id: 'line', icon: '\u2500', label: 'Line' },
            { id: 'rect', icon: '\u25AD', label: 'Rectangle' },
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
                    class: `pe-ann-color${this._annotationColor === c ? ' is-active' : ''}`,
                    style: { background: c },
                    onclick: () => {
                        this._annotationColor = c;
                        this._buildAnnotatePanel();
                    },
                })
            )
        );

        const sizeSlider = el('input', {
            class: 'pe-slider__range',
            type: 'range', min: '1', max: '20', value: String(this._annotationSize),
            oninput: (e) => { this._annotationSize = parseInt(e.target.value); },
        });

        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Annotate'),
            el('div', { class: 'pe-ann-tools' },
                tools.map(t =>
                    el('button', {
                        class: `pe-ann-tool-btn${this._activeTool === t.id ? ' is-active' : ''}`,
                        onclick: () => {
                            this._activeTool = this._activeTool === t.id ? null : t.id;
                            this._buildAnnotatePanel();
                        },
                    }, [
                        el('span', { class: 'pe-ann-tool-btn__icon' }, t.icon),
                        el('span', { class: 'pe-ann-tool-btn__label' }, t.label),
                    ])
                )
            ),
            el('div', { class: 'pe-panel__subtitle' }, 'Color'),
            colorPalette,
            el('div', { class: 'pe-panel__subtitle' }, 'Size'),
            sizeSlider,
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
        this._render();
    }

    _bakeAnnotations() {
        if (!this._originalImage || this._annotations.length === 0) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this._originalImage.width;
        tempCanvas.height = this._originalImage.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(this._originalImage, 0, 0);
        this._drawAnnotations(ctx, 1); // scale=1 for full resolution

        const newImg = new Image();
        newImg.onload = () => {
            this._originalImage = newImg;
            this._annotations = [];
            this._stepCounter = 1;
            this._pushUndo();
            this._render();
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    // ─── COLOR Tools ──────────────────────────────────────────

    _buildColorPanel() {
        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Color Tools'),

            // Eyedropper
            el('div', { class: 'pe-color-section' }, [
                el('div', { class: 'pe-panel__subtitle' }, 'Color Picker'),
                el('div', { class: 'pe-color-hint' }, 'Click on the image to pick a color'),
                el('button', {
                    class: `pe-btn${this._activeTool === 'eyedropper' ? ' is-active' : ''}`,
                    onclick: () => {
                        this._activeTool = this._activeTool === 'eyedropper' ? null : 'eyedropper';
                        this._buildColorPanel();
                    },
                }, '\uD83D\uDD0D Pick from Image'),
                this._buildEyedropperBtn(),
            ]),

            // Picked colors
            this._pickedColors.length > 0 ? el('div', { class: 'pe-color-section' }, [
                el('div', { class: 'pe-panel__subtitle' }, 'Picked Colors'),
                el('div', { class: 'pe-picked-colors' },
                    this._pickedColors.map(c => this._createColorSwatch(c))
                ),
            ]) : null,

            // Palette extractor
            el('div', { class: 'pe-color-section' }, [
                el('div', { class: 'pe-panel__subtitle' }, 'Palette Extractor'),
                el('button', {
                    class: 'pe-btn',
                    onclick: () => this._extractPalette(),
                }, 'Extract Palette'),
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
                    const dropper = new window.EyeDropper();
                    const result = await dropper.open();
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
            class: 'pe-color-swatch',
            style: { background: hex },
            title: hex,
            onclick: () => {
                navigator.clipboard?.writeText(hex).catch(() => {});
            },
        }, [
            el('span', { class: 'pe-color-swatch__label' }, hex),
        ]);
    }

    _extractPalette() {
        if (!this._originalImage) return;
        const canvas = document.createElement('canvas');
        const size = 100; // Sample at reduced size for speed
        const scale = Math.min(size / this._originalImage.width, size / this._originalImage.height);
        canvas.width = Math.round(this._originalImage.width * scale);
        canvas.height = Math.round(this._originalImage.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this._originalImage, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const colors = this._quantizeColors(imageData.data, 8);

        const resultEl = this._toolPanel.querySelector('#pe-palette-result');
        if (resultEl) {
            resultEl.innerHTML = '';
            const row = el('div', { class: 'pe-palette-row' });
            for (const c of colors) {
                const hex = `#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`;
                row.appendChild(this._createColorSwatch(hex));
            }
            resultEl.appendChild(row);

            // Copy all button
            const allHex = colors.map(c => `#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`);
            resultEl.appendChild(el('button', {
                class: 'pe-btn pe-btn--sm',
                onclick: () => navigator.clipboard?.writeText(allHex.join(', ')).catch(() => {}),
            }, 'Copy All'));
        }
    }

    _quantizeColors(pixels, count) {
        // Simple median-cut color quantization
        const colorMap = new Map();
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 128) continue; // Skip transparent
            // Bucket to reduce granularity
            const r = Math.round(pixels[i] / 16) * 16;
            const g = Math.round(pixels[i + 1] / 16) * 16;
            const b = Math.round(pixels[i + 2] / 16) * 16;
            const key = `${r},${g},${b}`;
            colorMap.set(key, (colorMap.get(key) || 0) + 1);
        }

        const sorted = [...colorMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, count * 3);

        // Remove too-similar colors
        const result = [];
        for (const [key] of sorted) {
            const [r, g, b] = key.split(',').map(Number);
            const tooClose = result.some(([rr, gg, bb]) =>
                Math.abs(r - rr) + Math.abs(g - gg) + Math.abs(b - bb) < 60
            );
            if (!tooClose) {
                result.push([r, g, b]);
                if (result.length >= count) break;
            }
        }
        return result;
    }

    _buildContrastChecker() {
        let fg = '#ffffff', bg = '#000000';

        const update = () => {
            const ratio = this._getContrastRatio(fg, bg);
            const aa = ratio >= 4.5;
            const aaa = ratio >= 7;
            resultEl.innerHTML = '';
            resultEl.append(
                el('div', { class: 'pe-contrast-ratio' }, `${ratio.toFixed(2)}:1`),
                el('div', { class: `pe-contrast-badge ${aa ? 'is-pass' : 'is-fail'}` }, `AA ${aa ? 'Pass' : 'Fail'}`),
                el('div', { class: `pe-contrast-badge ${aaa ? 'is-pass' : 'is-fail'}` }, `AAA ${aaa ? 'Pass' : 'Fail'}`),
            );
            previewEl.style.background = bg;
            previewEl.style.color = fg;
            previewEl.textContent = 'Sample Text Aa';
        };

        const fgInput = el('input', { class: 'pe-color-input', type: 'color', value: fg, oninput: (e) => { fg = e.target.value; update(); } });
        const bgInput = el('input', { class: 'pe-color-input', type: 'color', value: bg, oninput: (e) => { bg = e.target.value; update(); } });
        const resultEl = el('div', { class: 'pe-contrast-result' });
        const previewEl = el('div', { class: 'pe-contrast-preview', style: { background: bg, color: fg, padding: '8px 12px', borderRadius: '6px', textAlign: 'center', fontWeight: '600' } }, 'Sample Text Aa');

        const wrap = el('div', { class: 'pe-contrast-wrap' }, [
            el('div', { class: 'pe-contrast-inputs' }, [
                el('label', { class: 'pe-label' }, ['FG', fgInput]),
                el('label', { class: 'pe-label' }, ['BG', bgInput]),
            ]),
            previewEl,
            resultEl,
        ]);

        setTimeout(update, 0);
        return wrap;
    }

    _getContrastRatio(fg, bg) {
        const lum = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
        };
        const l1 = lum(fg), l2 = lum(bg);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    // ─── EXPORT Panel ─────────────────────────────────────────

    _showExportPanel() {
        if (!this._originalImage) return;

        let format = 'png', quality = 92;
        const img = this._originalImage;

        const sizeLabel = el('div', { class: 'pe-export-size' }, '');

        const updateSize = () => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            tempCanvas.toBlob((blob) => {
                if (blob) sizeLabel.textContent = `Estimated: ${this._formatSize(blob.size)}`;
            }, `image/${format === 'jpg' ? 'jpeg' : format}`, quality / 100);
        };

        const qualitySlider = el('input', {
            class: 'pe-slider__range',
            type: 'range', min: '10', max: '100', value: String(quality),
            oninput: (e) => { quality = parseInt(e.target.value); qualityLabel.textContent = `${quality}%`; updateSize(); },
        });
        const qualityLabel = el('span', { class: 'pe-slider__value' }, `${quality}%`);

        const formatSelect = el('select', {
            class: 'pe-select',
            onchange: (e) => { format = e.target.value; updateSize(); },
        }, [
            el('option', { value: 'png' }, 'PNG'),
            el('option', { value: 'jpg' }, 'JPEG'),
            el('option', { value: 'webp' }, 'WebP'),
        ]);

        const stripExif = el('label', { class: 'pe-checkbox-label' }, [
            el('input', { type: 'checkbox', checked: 'true', class: 'pe-checkbox' }),
            'Strip metadata',
        ]);

        const panel = el('div', { class: 'pe-panel' }, [
            el('div', { class: 'pe-panel__title' }, 'Export'),
            el('div', { class: 'pe-panel__subtitle' }, `${img.width}\u00D7${img.height}`),
            el('div', { class: 'pe-export-row' }, [
                el('label', { class: 'pe-label' }, ['Format', formatSelect]),
            ]),
            el('div', { class: 'pe-slider' }, [
                el('div', { class: 'pe-slider__header' }, [
                    el('span', { class: 'pe-slider__label' }, 'Quality'),
                    qualityLabel,
                ]),
                qualitySlider,
            ]),
            sizeLabel,
            stripExif,
            el('div', { class: 'pe-export-actions' }, [
                el('button', {
                    class: 'pe-btn pe-btn--primary pe-btn--lg',
                    onclick: () => this._doExport(format, quality),
                }, '\u2B07 Download'),
                el('button', {
                    class: 'pe-btn pe-btn--lg',
                    onclick: () => this._copyToClipboard(format, quality),
                }, '\uD83D\uDCCB Copy'),
                el('button', {
                    class: 'pe-btn pe-btn--lg',
                    onclick: () => this._saveToGallery(format, quality),
                }, '\uD83D\uDCBE Save'),
            ]),
        ]);

        this._toolPanel.innerHTML = '';
        this._toolPanel.appendChild(panel);
        setTimeout(updateSize, 50);
    }

    _getExportCanvas(format, quality) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this._originalImage.width;
        tempCanvas.height = this._originalImage.height;
        const ctx = tempCanvas.getContext('2d');

        // Apply adjustments
        ctx.filter = this._buildFilterString();
        ctx.drawImage(this._originalImage, 0, 0);
        ctx.filter = 'none';

        // Draw annotations
        this._drawAnnotations(ctx, 1);

        return tempCanvas;
    }

    _doExport(format, quality) {
        const canvas = this._getExportCanvas(format, quality);
        const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
        canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ext = format === 'jpg' ? 'jpeg' : format;
            a.download = this._filename.replace(/\.[^.]+$/, '') + `.${ext}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, mimeType, quality / 100);
    }

    async _copyToClipboard(format, quality) {
        const canvas = this._getExportCanvas(format, quality);
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (blob) {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob }),
                ]);
            }
        } catch (e) {
            console.warn('[PhotoEditor] Clipboard write failed:', e);
        }
    }

    _saveToGallery(format, quality) {
        const canvas = this._getExportCanvas(format, quality);
        const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
        canvas.toBlob((blob) => {
            if (blob) this.onSave?.(blob, this._filename);
        }, mimeType, quality / 100);
    }

    // ─── Before/After Compare ─────────────────────────────────

    _toggleCompare() {
        const vis = !this._compareOverlay.hidden;
        this._compareOverlay.hidden = vis;
        if (!vis && this._originalImage) {
            this._compareOverlay.innerHTML = '';
            // Show original
            const origCanvas = document.createElement('canvas');
            origCanvas.width = this._displayCanvas.width;
            origCanvas.height = this._displayCanvas.height;
            origCanvas.className = 'pe-compare__original';
            const ctx = origCanvas.getContext('2d');

            // Get first undo state (the original)
            const firstState = this._undo._stack[0];
            if (firstState) {
                const origImg = new Image();
                origImg.onload = () => {
                    const scale = Math.min(origCanvas.width / origImg.width, origCanvas.height / origImg.height);
                    const w = origImg.width * scale;
                    const h = origImg.height * scale;
                    ctx.drawImage(origImg, (origCanvas.width - w) / 2, (origCanvas.height - h) / 2, w, h);
                };
                origImg.src = firstState;
            }

            const slider = el('div', { class: 'pe-compare__slider' });
            const label = el('div', { class: 'pe-compare__label' }, 'Original');

            this._compareOverlay.append(origCanvas, slider, label);

            // Drag slider
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

            // Start at 50%
            origCanvas.style.clipPath = 'inset(0 50% 0 0)';
            slider.style.left = '50%';
        }
    }

    // ─── Canvas Rendering ─────────────────────────────────────

    _render() {
        if (!this._originalImage) return;

        const wrap = this._canvasWrap;
        const maxW = wrap.clientWidth || 800;
        const maxH = wrap.clientHeight || 600;
        const img = this._originalImage;

        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        this._displayCanvas.width = w;
        this._displayCanvas.height = h;
        this._displayScale = scale;

        const ctx = this._displayCtx;
        ctx.clearRect(0, 0, w, h);

        // Apply adjustments via CSS filter
        ctx.filter = this._buildFilterString();
        ctx.drawImage(img, 0, 0, w, h);
        ctx.filter = 'none';

        // Draw annotations
        this._drawAnnotations(ctx, scale);

        // Draw crop overlay
        if (this._cropActive && this._cropRect) {
            this._drawCropOverlay(ctx, scale);
        }

        // Cursor for active tool
        if (this._activeTool === 'eyedropper') {
            this._displayCanvas.style.cursor = 'crosshair';
        } else if (this._activeTool) {
            this._displayCanvas.style.cursor = 'crosshair';
        } else {
            this._displayCanvas.style.cursor = 'default';
        }
    }

    _buildFilterString() {
        const a = this._adjustments;
        let filter = '';
        if (a.brightness !== 100) filter += `brightness(${a.brightness}%) `;
        if (a.contrast !== 100) filter += `contrast(${a.contrast}%) `;
        if (a.saturation !== 100) filter += `saturate(${a.saturation}%) `;
        if (a.hueRotate !== 0) filter += `hue-rotate(${a.hueRotate}deg) `;
        if (a.blur > 0) filter += `blur(${a.blur}px) `;
        if (a.exposure !== 0) filter += `brightness(${100 + a.exposure}%) `;

        // Apply filter preset
        if (this._activeFilter !== 'none') {
            const preset = FILTER_PRESETS.find(f => f.id === this._activeFilter);
            if (preset?.filter) filter += preset.filter + ' ';
        }

        return filter.trim() || 'none';
    }

    _drawCropOverlay(ctx, scale) {
        const { x, y, w, h } = this._cropRect;
        const sx = x * scale, sy = y * scale, sw = w * scale, sh = h * scale;

        // Darken outside crop area
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, this._displayCanvas.width, sy);
        ctx.fillRect(0, sy, sx, sh);
        ctx.fillRect(sx + sw, sy, this._displayCanvas.width - sx - sw, sh);
        ctx.fillRect(0, sy + sh, this._displayCanvas.width, this._displayCanvas.height - sy - sh);

        // Crop border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, sw, sh);

        // Rule of thirds grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(sx + (sw * i) / 3, sy);
            ctx.lineTo(sx + (sw * i) / 3, sy + sh);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx, sy + (sh * i) / 3);
            ctx.lineTo(sx + sw, sy + (sh * i) / 3);
            ctx.stroke();
        }

        // Corner handles
        const hs = 10;
        ctx.fillStyle = '#fff';
        const corners = [
            [sx, sy], [sx + sw, sy],
            [sx, sy + sh], [sx + sw, sy + sh],
        ];
        for (const [cx, cy] of corners) {
            ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
        }
    }

    _drawAnnotations(ctx, scale) {
        for (const ann of this._annotations) {
            const d = ann.data;
            ctx.save();

            switch (ann.type) {
                case 'arrow': {
                    const x1 = d.x1 * scale, y1 = d.y1 * scale;
                    const x2 = d.x2 * scale, y2 = d.y2 * scale;
                    ctx.strokeStyle = d.color;
                    ctx.lineWidth = d.size * scale;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();

                    // Arrowhead
                    const angle = Math.atan2(y2 - y1, x2 - x1);
                    const headLen = 15 * scale;
                    ctx.fillStyle = d.color;
                    ctx.beginPath();
                    ctx.moveTo(x2, y2);
                    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
                    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
                    ctx.closePath();
                    ctx.fill();
                    break;
                }
                case 'line': {
                    const x1 = d.x1 * scale, y1 = d.y1 * scale;
                    const x2 = d.x2 * scale, y2 = d.y2 * scale;
                    ctx.strokeStyle = d.color;
                    ctx.lineWidth = d.size * scale;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                    break;
                }
                case 'rect': {
                    const x = d.x * scale, y = d.y * scale, w = d.w * scale, h = d.h * scale;
                    ctx.strokeStyle = d.color;
                    ctx.lineWidth = d.size * scale;
                    ctx.strokeRect(x, y, w, h);
                    break;
                }
                case 'ellipse': {
                    const cx = (d.x + d.w / 2) * scale;
                    const cy = (d.y + d.h / 2) * scale;
                    const rx = (Math.abs(d.w) / 2) * scale;
                    const ry = (Math.abs(d.h) / 2) * scale;
                    ctx.strokeStyle = d.color;
                    ctx.lineWidth = d.size * scale;
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                }
                case 'text': {
                    const fontSize = Math.max(14, d.size * 6) * scale;
                    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                    ctx.fillStyle = d.color;
                    ctx.fillText(d.text, d.x * scale, d.y * scale);
                    break;
                }
                case 'pen': {
                    if (d.points && d.points.length > 1) {
                        ctx.strokeStyle = d.color;
                        ctx.lineWidth = d.size * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(d.points[0].x * scale, d.points[0].y * scale);
                        for (let i = 1; i < d.points.length; i++) {
                            ctx.lineTo(d.points[i].x * scale, d.points[i].y * scale);
                        }
                        ctx.stroke();
                    }
                    break;
                }
                case 'highlight': {
                    if (d.points && d.points.length > 1) {
                        ctx.strokeStyle = d.color;
                        ctx.globalAlpha = 0.35;
                        ctx.lineWidth = d.size * 4 * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(d.points[0].x * scale, d.points[0].y * scale);
                        for (let i = 1; i < d.points.length; i++) {
                            ctx.lineTo(d.points[i].x * scale, d.points[i].y * scale);
                        }
                        ctx.stroke();
                    }
                    break;
                }
                case 'blur-region': {
                    const bx = d.x * scale, by = d.y * scale, bw = d.w * scale, bh = d.h * scale;
                    // Pixelate effect
                    const pixelSize = 10;
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = Math.abs(bw);
                    tempCanvas.height = Math.abs(bh);
                    const tCtx = tempCanvas.getContext('2d');
                    tCtx.drawImage(this._displayCanvas, Math.min(bx, bx + bw), Math.min(by, by + bh), Math.abs(bw), Math.abs(bh), 0, 0, Math.abs(bw), Math.abs(bh));
                    // Downscale then upscale for pixelation
                    const small = document.createElement('canvas');
                    const sw2 = Math.max(1, Math.abs(bw) / pixelSize);
                    const sh2 = Math.max(1, Math.abs(bh) / pixelSize);
                    small.width = sw2;
                    small.height = sh2;
                    const sCtx = small.getContext('2d');
                    sCtx.imageSmoothingEnabled = false;
                    sCtx.drawImage(tempCanvas, 0, 0, sw2, sh2);
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(small, 0, 0, sw2, sh2, Math.min(bx, bx + bw), Math.min(by, by + bh), Math.abs(bw), Math.abs(bh));
                    ctx.imageSmoothingEnabled = true;
                    break;
                }
                case 'step': {
                    const r = 16 * scale;
                    const cx = d.x * scale, cy = d.y * scale;
                    ctx.fillStyle = d.color;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${r * 1.1}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(d.number), cx, cy);
                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'alphabetic';
                    break;
                }
            }
            ctx.restore();
        }
    }

    // ─── Mouse/Touch Interaction ──────────────────────────────

    _getCanvasPos(e) {
        const rect = this._displayCanvas.getBoundingClientRect();
        const clientX = e.touches?.[0]?.clientX ?? e.clientX;
        const clientY = e.touches?.[0]?.clientY ?? e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        // Convert to image coordinates
        const imgX = x / (this._displayScale || 1);
        const imgY = y / (this._displayScale || 1);
        return { x: imgX, y: imgY, canvasX: x, canvasY: y };
    }

    _onMouseDown(e) {
        if (e.type === 'touchstart') e.preventDefault();
        const pos = this._getCanvasPos(e);
        this._isDragging = true;
        this._dragStart = pos;

        // Color picker
        if (this._activeTool === 'eyedropper') {
            this._pickColorAt(pos);
            return;
        }

        // Crop drag
        if (this._cropActive && this._cropRect) {
            this._cropDragStart = { ...this._cropRect };
            return;
        }

        // Annotation tools
        if (this._activeTool === 'pen' || this._activeTool === 'highlight') {
            this._penPoints = [{ x: pos.x, y: pos.y }];
            return;
        }

        if (this._activeTool === 'text') {
            const text = prompt('Enter text:');
            if (text) {
                this._annotations.push(new Annotation('text', {
                    x: pos.x, y: pos.y,
                    text,
                    color: this._annotationColor,
                    size: this._annotationSize,
                }));
                this._render();
            }
            this._isDragging = false;
            return;
        }

        if (this._activeTool === 'step') {
            this._annotations.push(new Annotation('step', {
                x: pos.x, y: pos.y,
                number: this._stepCounter++,
                color: this._annotationColor,
            }));
            this._render();
            this._isDragging = false;
            return;
        }
    }

    _onMouseMove(e) {
        if (!this._isDragging || !this._dragStart) return;
        if (e.type === 'touchmove') e.preventDefault();
        const pos = this._getCanvasPos(e);

        // Crop drag
        if (this._cropActive && this._cropRect && this._cropDragStart) {
            const dx = pos.x - this._dragStart.x;
            const dy = pos.y - this._dragStart.y;
            this._cropRect.x = Math.max(0, this._cropDragStart.x + dx);
            this._cropRect.y = Math.max(0, this._cropDragStart.y + dy);
            // Clamp
            if (this._originalImage) {
                this._cropRect.x = Math.min(this._cropRect.x, this._originalImage.width - this._cropRect.w);
                this._cropRect.y = Math.min(this._cropRect.y, this._originalImage.height - this._cropRect.h);
            }
            this._render();
            return;
        }

        // Pen/highlight
        if (this._activeTool === 'pen' || this._activeTool === 'highlight') {
            this._penPoints.push({ x: pos.x, y: pos.y });
            // Live preview
            this._render();
            const ctx = this._displayCtx;
            const scale = this._displayScale || 1;
            ctx.save();
            ctx.strokeStyle = this._annotationColor;
            ctx.lineWidth = this._annotationSize * (this._activeTool === 'highlight' ? 4 : 1) * scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (this._activeTool === 'highlight') ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(this._penPoints[0].x * scale, this._penPoints[0].y * scale);
            for (const p of this._penPoints) {
                ctx.lineTo(p.x * scale, p.y * scale);
            }
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Drawing shapes (arrow, rect, ellipse, line, blur-region)
        if (this._activeTool && ['arrow', 'line', 'rect', 'ellipse', 'blur-region'].includes(this._activeTool)) {
            this._render();
            const ctx = this._displayCtx;
            const scale = this._displayScale || 1;
            ctx.save();

            const x1 = this._dragStart.x, y1 = this._dragStart.y;
            const x2 = pos.x, y2 = pos.y;

            if (this._activeTool === 'arrow' || this._activeTool === 'line') {
                ctx.strokeStyle = this._annotationColor;
                ctx.lineWidth = this._annotationSize * scale;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x1 * scale, y1 * scale);
                ctx.lineTo(x2 * scale, y2 * scale);
                ctx.stroke();

                if (this._activeTool === 'arrow') {
                    const angle = Math.atan2((y2 - y1) * scale, (x2 - x1) * scale);
                    const headLen = 15 * scale;
                    ctx.fillStyle = this._annotationColor;
                    ctx.beginPath();
                    ctx.moveTo(x2 * scale, y2 * scale);
                    ctx.lineTo(x2 * scale - headLen * Math.cos(angle - 0.4), y2 * scale - headLen * Math.sin(angle - 0.4));
                    ctx.lineTo(x2 * scale - headLen * Math.cos(angle + 0.4), y2 * scale - headLen * Math.sin(angle + 0.4));
                    ctx.closePath();
                    ctx.fill();
                }
            } else if (this._activeTool === 'rect' || this._activeTool === 'blur-region') {
                if (this._activeTool === 'blur-region') {
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                    ctx.setLineDash([5, 5]);
                } else {
                    ctx.strokeStyle = this._annotationColor;
                }
                ctx.lineWidth = this._annotationSize * scale;
                ctx.strokeRect(x1 * scale, y1 * scale, (x2 - x1) * scale, (y2 - y1) * scale);
            } else if (this._activeTool === 'ellipse') {
                const cx = ((x1 + x2) / 2) * scale;
                const cy = ((y1 + y2) / 2) * scale;
                const rx = (Math.abs(x2 - x1) / 2) * scale;
                const ry = (Math.abs(y2 - y1) / 2) * scale;
                ctx.strokeStyle = this._annotationColor;
                ctx.lineWidth = this._annotationSize * scale;
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    _onMouseUp(e) {
        if (!this._isDragging) return;
        this._isDragging = false;

        const pos = this._getCanvasPos(e);

        // Crop drag done
        if (this._cropActive) {
            this._cropDragStart = null;
            return;
        }

        // Pen/highlight done
        if ((this._activeTool === 'pen' || this._activeTool === 'highlight') && this._penPoints.length > 1) {
            this._annotations.push(new Annotation(this._activeTool, {
                points: [...this._penPoints],
                color: this._annotationColor,
                size: this._annotationSize,
            }));
            this._penPoints = [];
            this._render();
            return;
        }

        // Shape annotation done
        if (this._activeTool && this._dragStart && ['arrow', 'line', 'rect', 'ellipse', 'blur-region'].includes(this._activeTool)) {
            const x1 = this._dragStart.x, y1 = this._dragStart.y;
            const x2 = pos.x, y2 = pos.y;

            // Skip tiny drags
            if (Math.abs(x2 - x1) < 3 && Math.abs(y2 - y1) < 3) {
                this._dragStart = null;
                return;
            }

            if (this._activeTool === 'arrow' || this._activeTool === 'line') {
                this._annotations.push(new Annotation(this._activeTool, {
                    x1, y1, x2, y2,
                    color: this._annotationColor,
                    size: this._annotationSize,
                }));
            } else {
                this._annotations.push(new Annotation(this._activeTool, {
                    x: Math.min(x1, x2), y: Math.min(y1, y2),
                    w: x2 - x1, h: y2 - y1,
                    color: this._annotationColor,
                    size: this._annotationSize,
                }));
            }
            this._render();
        }

        this._dragStart = null;
    }

    _pickColorAt(pos) {
        const scale = this._displayScale || 1;
        const cx = Math.round(pos.x * scale);
        const cy = Math.round(pos.y * scale);
        const pixel = this._displayCtx.getImageData(cx, cy, 1, 1).data;
        const hex = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
        this._pickedColors.unshift(hex);
        if (this._pickedColors.length > 12) this._pickedColors.pop();

        // Copy to clipboard
        navigator.clipboard?.writeText(hex).catch(() => {});

        // Refresh color panel if visible
        if (this._toolPanel.querySelector('.pe-color-section')) {
            this._buildColorPanel();
        }
        this._isDragging = false;
    }

    // ─── Keyboard ─────────────────────────────────────────────

    _onEditorKeydown(e) {
        // Only handle if editor is visible
        if (this.container.hidden) return;

        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key === 'z') { e.preventDefault(); this._doUndo(); }
        if (ctrl && e.key === 'y') { e.preventDefault(); this._doRedo(); }
        if (ctrl && e.key === 's') { e.preventDefault(); this._showExportPanel(); }
        if (ctrl && e.key === 'c' && !window.getSelection()?.toString()) {
            e.preventDefault();
            this._copyToClipboard('png', 92);
        }
        if (e.key === 'Delete' && this._annotations.length > 0) {
            this._annotations.pop();
            this._render();
        }
        if (e.key === 'Escape') {
            if (this._cropActive) this._cancelCrop();
            else if (this._activeTool) { this._activeTool = null; this._render(); }
        }
    }

    // ─── Undo/Redo ────────────────────────────────────────────

    _pushUndo() {
        if (this._originalImage) {
            this._undo.push(this._originalImage.src);
        }
    }

    _doUndo() {
        const state = this._undo.undo();
        if (state) this._loadImageFromSrc(state);
    }

    _doRedo() {
        const state = this._undo.redo();
        if (state) this._loadImageFromSrc(state);
    }

    _loadImageFromSrc(src) {
        const img = new Image();
        img.onload = () => {
            this._originalImage = img;
            this._render();
        };
        img.src = src;
    }

    // ─── Drawing Helpers ──────────────────────────────────────

    _drawToContext(ctx, width, height, srcX, srcY, srcW, srcH) {
        ctx.filter = this._buildFilterString();
        ctx.drawImage(this._originalImage, srcX, srcY, srcW, srcH, 0, 0, width, height);
        ctx.filter = 'none';
    }

    // ─── Public API ───────────────────────────────────────────

    loadFromDataUrl(dataUrl, name) {
        this._filename = name || 'image.png';
        const img = new Image();
        img.onload = () => {
            this._originalImage = img;
            this._pushUndo();
            this._render();
        };
        img.src = dataUrl;
    }

    showEmpty() {
        this._canvasWrap.innerHTML = '';
        this._canvasWrap.appendChild(
            el('div', { class: 'pe-empty' }, [
                el('div', { class: 'pe-empty__icon' }, '\uD83D\uDDBC\uFE0F'),
                el('div', { class: 'pe-empty__text' }, 'Paste an image (Ctrl+V) or drag & drop to start editing'),
            ])
        );
    }

    destroy() {
        this._displayCanvas?.removeEventListener('mousedown', this._boundMouseDown);
        this._displayCanvas?.removeEventListener('touchstart', this._boundMouseDown);
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('touchmove', this._boundMouseMove);
        window.removeEventListener('mouseup', this._boundMouseUp);
        window.removeEventListener('touchend', this._boundMouseUp);
        document.removeEventListener('keydown', this._boundKeydown);
        this._undo.clear();
        this._originalImage = null;
    }

    _formatSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0, size = bytes;
        while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
        return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
    }
}
