import { el } from '../../utils/dom.js';

const MIN_W = 320;
const MIN_H = 240;

const CLOSE_ICON = `<svg viewBox="0 0 8 8" fill="none" stroke="#4a0002" stroke-width="1.4" stroke-linecap="round"><line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/></svg>`;
const EXPAND_ICON = `<svg viewBox="0 0 8 8" fill="none" stroke="#004a00" stroke-width="1.2" stroke-linecap="round"><polyline points="1,5 1,1 5,1"/><polyline points="7,3 7,7 3,7"/></svg>`;
const COLLAPSE_ICON = `<svg viewBox="0 0 8 8" fill="none" stroke="#004a00" stroke-width="1.2" stroke-linecap="round"><polyline points="3,1 3,3 1,3"/><polyline points="5,7 5,5 7,5"/></svg>`;

const EDGES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export class WindowChrome {
  constructor(appName, appRoot, onClose) {
    this._onClose = onClose;
    this._appName = appName;
    this._isFullscreen = false;
    this._restoreRect = null;
    this._dragging = false;
    this._resizing = false;
    this._resizeEdge = null;
    this._dragOffset = { x: 0, y: 0 };
    this._resizeStart = { x: 0, y: 0, l: 0, t: 0, w: 0, h: 0 };
    this._lastPointerDown = 0;
    this._destroyed = false;

    // Bound handlers for cleanup
    this._onDragMove = this._onDragMove.bind(this);
    this._onDragEnd = this._onDragEnd.bind(this);
    this._onResizeMove = this._onResizeMove.bind(this);
    this._onResizeEnd = this._onResizeEnd.bind(this);

    // Build DOM
    this._scrim = el('div', { class: 'window-chrome__scrim' });
    this._chrome = this._buildChrome(appName, appRoot);
  }

  get chrome() { return this._chrome; }
  get scrim() { return this._scrim; }

  // ─── DOM Construction ──────────────────────────────────────

  _buildChrome(appName, appRoot) {
    const win = el('div', { class: 'window-chrome' });

    // Title bar
    win.appendChild(this._buildTitleBar(appName));

    // Content area
    const content = el('div', { class: 'window-chrome__content' });
    content.appendChild(appRoot);
    win.appendChild(content);

    // Resize handles
    this._buildResizeHandles(win);

    return win;
  }

  _buildTitleBar(appName) {
    const titlebar = el('div', { class: 'window-chrome__titlebar' });

    // Traffic light buttons
    const traffic = el('div', { class: 'window-chrome__traffic' });

    // Close button
    const closeBtn = el('button', {
      class: 'window-chrome__btn-close',
      type: 'button',
      'aria-label': 'Close',
    });
    const closeIcon = el('span', { class: 'window-chrome__btn-icon' });
    closeIcon.innerHTML = CLOSE_ICON;
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._close();
    });

    // Fullscreen button
    const fsBtn = el('button', {
      class: 'window-chrome__btn-fullscreen',
      type: 'button',
      'aria-label': 'Toggle fullscreen',
    });
    this._fsBtnIcon = el('span', { class: 'window-chrome__btn-icon' });
    this._fsBtnIcon.innerHTML = EXPAND_ICON;
    fsBtn.appendChild(this._fsBtnIcon);
    fsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    fsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleFullscreen();
    });

    traffic.append(closeBtn, fsBtn);
    titlebar.appendChild(traffic);

    // Title text
    titlebar.appendChild(el('div', { class: 'window-chrome__title' }, appName));

    // Drag events on title bar
    titlebar.addEventListener('pointerdown', (e) => this._onDragStart(e));

    return titlebar;
  }

  _buildResizeHandles(win) {
    for (const edge of EDGES) {
      const handle = el('div', {
        class: `window-chrome__resize-handle window-chrome__resize-handle--${edge}`,
      });
      handle.dataset.edge = edge;
      handle.addEventListener('pointerdown', (e) => this._onResizeStart(e));
      win.appendChild(handle);
    }
  }

  // ─── Drag ──────────────────────────────────────────────────

  _onDragStart(e) {
    if (this._isFullscreen || e.button !== 0) return;

    // Double-click detection for fullscreen toggle
    const now = Date.now();
    if (now - this._lastPointerDown < 300) {
      this._toggleFullscreen();
      this._lastPointerDown = 0;
      return;
    }
    this._lastPointerDown = now;

    this._dragging = true;
    const rect = this._chrome.getBoundingClientRect();
    this._dragOffset.x = e.clientX - rect.left;
    this._dragOffset.y = e.clientY - rect.top;

    this._chrome.classList.add('window-chrome--dragging');
    this._chrome.setPointerCapture(e.pointerId);
    this._chrome.addEventListener('pointermove', this._onDragMove);
    this._chrome.addEventListener('pointerup', this._onDragEnd);
    e.preventDefault();
  }

  _onDragMove(e) {
    if (!this._dragging) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = this._chrome.offsetWidth;

    let newLeft = e.clientX - this._dragOffset.x;
    let newTop = e.clientY - this._dragOffset.y;

    // Clamp: at least 50px of title bar visible
    newLeft = Math.max(-w + 50, Math.min(vw - 50, newLeft));
    newTop = Math.max(0, Math.min(vh - 38, newTop));

    this._chrome.style.left = newLeft + 'px';
    this._chrome.style.top = newTop + 'px';
  }

  _onDragEnd(e) {
    if (!this._dragging) return;
    this._dragging = false;
    this._chrome.classList.remove('window-chrome--dragging');
    this._chrome.releasePointerCapture(e.pointerId);
    this._chrome.removeEventListener('pointermove', this._onDragMove);
    this._chrome.removeEventListener('pointerup', this._onDragEnd);
  }

  // ─── Resize ────────────────────────────────────────────────

  _onResizeStart(e) {
    if (this._isFullscreen || e.button !== 0) return;
    this._resizing = true;
    this._resizeEdge = e.currentTarget.dataset.edge;

    const rect = this._chrome.getBoundingClientRect();
    this._resizeStart = {
      x: e.clientX,
      y: e.clientY,
      l: rect.left,
      t: rect.top,
      w: rect.width,
      h: rect.height,
    };

    this._chrome.classList.add('window-chrome--resizing');
    document.addEventListener('pointermove', this._onResizeMove);
    document.addEventListener('pointerup', this._onResizeEnd);
    e.preventDefault();
    e.stopPropagation();
  }

  _onResizeMove(e) {
    if (!this._resizing) return;
    const dx = e.clientX - this._resizeStart.x;
    const dy = e.clientY - this._resizeStart.y;
    const edge = this._resizeEdge;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let { l, t, w, h } = this._resizeStart;

    // East
    if (edge.includes('e')) {
      w = Math.max(MIN_W, Math.min(vw - l, this._resizeStart.w + dx));
    }
    // West
    if (edge.includes('w')) {
      const newW = Math.max(MIN_W, this._resizeStart.w - dx);
      const maxExpand = this._resizeStart.l + this._resizeStart.w - MIN_W;
      l = Math.max(0, Math.min(maxExpand, this._resizeStart.l + dx));
      w = this._resizeStart.l + this._resizeStart.w - l;
      if (w < MIN_W) { w = MIN_W; l = this._resizeStart.l + this._resizeStart.w - MIN_W; }
    }
    // South
    if (edge.includes('s')) {
      h = Math.max(MIN_H, Math.min(vh - t, this._resizeStart.h + dy));
    }
    // North
    if (edge.includes('n')) {
      const maxExpand = this._resizeStart.t + this._resizeStart.h - MIN_H;
      t = Math.max(0, Math.min(maxExpand, this._resizeStart.t + dy));
      h = this._resizeStart.t + this._resizeStart.h - t;
      if (h < MIN_H) { h = MIN_H; t = this._resizeStart.t + this._resizeStart.h - MIN_H; }
    }

    this._chrome.style.left = l + 'px';
    this._chrome.style.top = t + 'px';
    this._chrome.style.width = w + 'px';
    this._chrome.style.height = h + 'px';
  }

  _onResizeEnd() {
    if (!this._resizing) return;
    this._resizing = false;
    this._resizeEdge = null;
    this._chrome.classList.remove('window-chrome--resizing');
    document.removeEventListener('pointermove', this._onResizeMove);
    document.removeEventListener('pointerup', this._onResizeEnd);
  }

  // ─── Fullscreen Toggle ─────────────────────────────────────

  _toggleFullscreen() {
    if (this._isFullscreen) this._exitFullscreen();
    else this._enterFullscreen();
  }

  _enterFullscreen() {
    const rect = this._chrome.getBoundingClientRect();
    this._restoreRect = {
      left: this._chrome.style.left || rect.left + 'px',
      top: this._chrome.style.top || rect.top + 'px',
      width: this._chrome.style.width || rect.width + 'px',
      height: this._chrome.style.height || rect.height + 'px',
    };
    this._isFullscreen = true;
    this._chrome.classList.add('window-chrome--fullscreen');
    this._fsBtnIcon.innerHTML = COLLAPSE_ICON;
  }

  _exitFullscreen() {
    this._isFullscreen = false;
    this._chrome.classList.remove('window-chrome--fullscreen');
    if (this._restoreRect) {
      this._chrome.style.left = this._restoreRect.left;
      this._chrome.style.top = this._restoreRect.top;
      this._chrome.style.width = this._restoreRect.width;
      this._chrome.style.height = this._restoreRect.height;
    }
    this._fsBtnIcon.innerHTML = EXPAND_ICON;
  }

  // ─── Close ─────────────────────────────────────────────────

  _close() {
    if (this._destroyed) return;
    this._chrome.classList.add('window-chrome--closing');
    this._scrim.style.opacity = '0';
    this._scrim.style.transition = 'opacity 0.25s var(--ease-out)';
    setTimeout(() => {
      if (this._onClose) this._onClose();
    }, 220);
  }

  // ─── Viewport Resize ──────────────────────────────────────

  onViewportResize() {
    if (this._isFullscreen || this._destroyed) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = this._chrome.getBoundingClientRect();

    // Clamp so window stays in viewport
    if (rect.right > vw) this._chrome.style.left = Math.max(0, vw - rect.width) + 'px';
    if (rect.bottom > vh) this._chrome.style.top = Math.max(0, vh - rect.height) + 'px';
    if (rect.width > vw) this._chrome.style.width = vw + 'px';
    if (rect.height > vh) this._chrome.style.height = vh + 'px';
  }

  // ─── Cleanup ───────────────────────────────────────────────

  destroy() {
    this._destroyed = true;
    document.removeEventListener('pointermove', this._onResizeMove);
    document.removeEventListener('pointerup', this._onResizeEnd);
    this._chrome.removeEventListener('pointermove', this._onDragMove);
    this._chrome.removeEventListener('pointerup', this._onDragEnd);
    this._chrome.remove();
    this._scrim.remove();
    this._chrome = null;
    this._scrim = null;
    this._onClose = null;
    this._fsBtnIcon = null;
  }
}
