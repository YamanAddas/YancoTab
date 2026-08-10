import { el, setLiteralHtml } from '../../utils/dom.js';
import { WindowResizer } from './WindowResizer.js';

const CLOSE_ICON = `<svg viewBox="0 0 8 8" fill="none" stroke="#4a0002" stroke-width="1.4" stroke-linecap="round"><line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/></svg>`;
const EXPAND_ICON = `<svg viewBox="0 0 8 8" fill="none" stroke="#004a00" stroke-width="1.2" stroke-linecap="round"><polyline points="1,5 1,1 5,1"/><polyline points="7,3 7,7 3,7"/></svg>`;
const COLLAPSE_ICON = `<svg viewBox="0 0 8 8" fill="none" stroke="#004a00" stroke-width="1.2" stroke-linecap="round"><polyline points="3,1 3,3 1,3"/><polyline points="5,7 5,5 7,5"/></svg>`;
const MINIMIZE_ICON = `<svg viewBox="0 0 8 8" fill="none" stroke="#5c3a00" stroke-width="1.4" stroke-linecap="round"><line x1="1.5" y1="4" x2="6.5" y2="4"/></svg>`;

export class WindowChrome {
  /**
   * @param {string} appName
   * @param {HTMLElement} appRoot
   * @param {Function|object} callbacks — legacy single close callback, or:
   *   { onClose, onFocusRequest, onMinimize,
   *     onDragStart(e) → null | {width, height},  // restore size when snapped
   *     onDragMove(e), onDragEnd(e), onDragCancel() }
   *   The minimize button renders only when onMinimize is provided.
   */
  constructor(appName, appRoot, callbacks) {
    const cbs = typeof callbacks === 'function' ? { onClose: callbacks } : (callbacks || {});
    this._cbs = cbs;
    this._onClose = cbs.onClose || null;
    this._appName = appName;
    this._isFullscreen = false;
    this._restoreRect = null;
    this._dragging = false;
    this._dragOffset = { x: 0, y: 0 };
    this._lastPointerDown = 0;
    this._destroyed = false;

    // Bound handlers for cleanup
    this._onDragMove = this._onDragMove.bind(this);
    this._onDragEnd = this._onDragEnd.bind(this);
    this._onDragCancel = this._onDragCancel.bind(this);

    // Build DOM. The scrim is no longer per-window — the WindowManager
    // owns one shared scrim (two windows would stack two 0.4-alpha layers
    // into a near-black home screen).
    this._chrome = this._buildChrome(appName, appRoot);

    // Focus request: capture-phase so it fires before any app handler can
    // stopPropagation. WM raises + focuses; no-op when already focused.
    // focusin keeps WM focus in step with KEYBOARD focus — without it,
    // tabbing into a background window's input left Escape aimed at a
    // different window than the one being typed in.
    if (cbs.onFocusRequest) {
      this._chrome.addEventListener('pointerdown', () => cbs.onFocusRequest(), true);
      this._chrome.addEventListener('focusin', () => cbs.onFocusRequest());
    }
  }

  get chrome() { return this._chrome; }

  // ─── DOM Construction ──────────────────────────────────────

  _buildChrome(appName, appRoot) {
    // tabindex -1: programmatically focusable so the window manager can
    // hand keyboard focus somewhere sane when the focused window closes
    // or minimizes (otherwise focus silently drops to <body>).
    const win = el('div', { class: 'window-chrome', tabindex: '-1' });

    // Title bar
    win.appendChild(this._buildTitleBar(appName));

    // Content area
    const content = el('div', { class: 'window-chrome__content' });
    content.appendChild(appRoot);
    win.appendChild(content);

    // Resize handles — self-contained subsystem, see WindowResizer.js
    this._resizer = new WindowResizer(win, {
      isBlocked: () => this._isFullscreen,
      onUserResize: this._cbs.onUserResize || null,
    });

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
    setLiteralHtml(closeIcon, CLOSE_ICON);
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
    setLiteralHtml(this._fsBtnIcon, EXPAND_ICON);
    fsBtn.appendChild(this._fsBtnIcon);
    fsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    fsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleFullscreen();
    });

    // Minimize button — only when the window manager provides a handler
    // (compact mode and legacy callers get the original two-button set).
    if (this._cbs.onMinimize) {
      const minBtn = el('button', {
        class: 'window-chrome__btn-minimize',
        type: 'button',
        'aria-label': 'Minimize',
      });
      const minIcon = el('span', { class: 'window-chrome__btn-icon' });
      setLiteralHtml(minIcon, MINIMIZE_ICON);
      minBtn.appendChild(minIcon);
      minBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._cbs.onMinimize();
      });
      traffic.append(closeBtn, minBtn, fsBtn);
    } else {
      traffic.append(closeBtn, fsBtn);
    }
    titlebar.appendChild(traffic);

    // Title text
    titlebar.appendChild(el('div', { class: 'window-chrome__title' }, appName));

    // Drag events on title bar
    titlebar.addEventListener('pointerdown', (e) => this._onDragStart(e));

    return titlebar;
  }

  // ─── Drag ──────────────────────────────────────────────────

  _onDragStart(e) {
    if (e.button !== 0) return;
    // Fullscreen: legacy callers get an inert titlebar (as before). With a
    // WM attached, dragging un-maximizes and the drag continues — this is
    // what makes top-snap/maximize reversible by drag.
    if (this._isFullscreen && !this._cbs.onDragStart) return;

    // Double-click detection for fullscreen toggle
    const now = Date.now();
    if (now - this._lastPointerDown < 300) {
      this._toggleFullscreen();
      this._lastPointerDown = 0;
      return;
    }
    this._lastPointerDown = now;

    const rect = this._chrome.getBoundingClientRect();
    this._dragOffset.x = e.clientX - rect.left;
    this._dragOffset.y = e.clientY - rect.top;

    // Un-snap / un-maximize is DEFERRED until real movement (6px): a
    // plain click on the titlebar of a snapped or maximized window must
    // focus it, not move it. The WM's onDragStart (which clears its snap
    // bookkeeping) is equally deferred, for the same reason.
    this._dragPending = { x: e.clientX, y: e.clientY };
    this._dragging = true;

    this._chrome.classList.add('window-chrome--dragging');
    // Capture can throw on a pointer that was released between events
    // (and on synthetic events); an uncaught throw here would strand the
    // --dragging class with no listeners attached.
    try { this._chrome.setPointerCapture(e.pointerId); } catch { /* uncapturable */ }
    this._chrome.addEventListener('pointermove', this._onDragMove);
    this._chrome.addEventListener('pointerup', this._onDragEnd);
    this._chrome.addEventListener('pointercancel', this._onDragCancel);
    e.preventDefault();
  }

  _onDragMove(e) {
    if (!this._dragging) return;
    if (this._dragPending) {
      const dx = e.clientX - this._dragPending.x;
      const dy = e.clientY - this._dragPending.y;
      if (Math.hypot(dx, dy) < 6) return; // still a click, not a drag
      this._beginRealDrag(e);
    }
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

    if (this._cbs.onDragMove) this._cbs.onDragMove(e);
  }

  /**
   * First real movement of a drag: NOW exit fullscreen / apply the WM's
   * restore size, rescaling the horizontal grab point proportionally so
   * the titlebar stays under the pointer (Windows-style unsnap).
   */
  _beginRealDrag(e) {
    this._dragPending = null;
    let offsetX = this._dragOffset.x;
    let offsetY = this._dragOffset.y;

    if (this._isFullscreen) {
      const w = this._chrome.offsetWidth;
      const ratio = w > 0 ? offsetX / w : 0.5;
      this._exitFullscreen();
      offsetX = ratio * this._chrome.offsetWidth;
      offsetY = Math.min(offsetY, 19);
    }

    const restore = this._cbs.onDragStart ? this._cbs.onDragStart(e) : null;
    if (restore && Number.isFinite(restore.width) && restore.width > 0) {
      const curW = this._chrome.offsetWidth;
      const ratio = curW > 0 ? offsetX / curW : 0.5;
      this._chrome.style.width = restore.width + 'px';
      this._chrome.style.height = restore.height + 'px';
      offsetX = ratio * restore.width;
    }

    this._dragOffset.x = offsetX;
    this._dragOffset.y = offsetY;
  }

  _onDragEnd(e) {
    if (!this._dragging) return;
    const wasClick = Boolean(this._dragPending);
    this._teardownDrag(e);
    // A click that never crossed the drag threshold moved nothing and
    // must not run the WM's snap logic.
    if (!wasClick && this._cbs.onDragEnd) this._cbs.onDragEnd(e);
  }

  _onDragCancel(e) {
    // Without this, a mid-drag pointercancel stranded the --dragging class
    // (pre-existing bug: only pointerup was handled).
    if (!this._dragging) return;
    this._teardownDrag(e);
    if (this._cbs.onDragCancel) this._cbs.onDragCancel();
  }

  _teardownDrag(e) {
    this._dragging = false;
    this._dragPending = null;
    this._chrome.classList.remove('window-chrome--dragging');
    try { this._chrome.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    this._chrome.removeEventListener('pointermove', this._onDragMove);
    this._chrome.removeEventListener('pointerup', this._onDragEnd);
    this._chrome.removeEventListener('pointercancel', this._onDragCancel);
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
    setLiteralHtml(this._fsBtnIcon, COLLAPSE_ICON);
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
    setLiteralHtml(this._fsBtnIcon, EXPAND_ICON);
  }

  // ─── Close ─────────────────────────────────────────────────

  _close() {
    if (this._destroyed) return;
    this._chrome.classList.add('window-chrome--closing');
    setTimeout(() => {
      if (this._onClose) this._onClose();
    }, 220);
  }

  // ─── Window-Manager API ───────────────────────────────────

  get isFullscreen() { return this._isFullscreen; }

  setFocused(focused) {
    if (this._destroyed) return;
    this._chrome.classList.toggle('window-chrome--focused', Boolean(focused));
  }

  /** Move keyboard focus onto the window (root has tabindex=-1). */
  takeKeyboardFocus() {
    if (this._destroyed) return;
    try { this._chrome.focus({ preventScroll: true }); } catch { /* detached */ }
  }

  setZ(z) {
    if (this._destroyed) return;
    this._chrome.style.zIndex = String(z);
  }

  setMinimized(minimized) {
    if (this._destroyed) return;
    const c = this._chrome.classList;
    if (minimized) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (reduced) { c.add('window-chrome--minimized'); return; }
      c.add('window-chrome--minimizing');
      setTimeout(() => {
        if (this._destroyed) return;
        if (c.contains('window-chrome--minimizing')) {
          c.remove('window-chrome--minimizing');
          c.add('window-chrome--minimized');
        }
      }, 200);
    } else {
      c.remove('window-chrome--minimizing', 'window-chrome--minimized');
      // Canvas apps measure on resize; a restore from display:none is the
      // same situation as a resize for them.
      window.dispatchEvent(new Event('resize'));
    }
  }

  /**
   * Current rect from offset* — NOT getBoundingClientRect, because the
   * windowOpen scale animation makes gBCR wrong for its first 350ms.
   */
  getRect() {
    if (this._destroyed) return { left: 0, top: 0, width: 0, height: 0 };
    return {
      left: this._chrome.offsetLeft,
      top: this._chrome.offsetTop,
      width: this._chrome.offsetWidth,
      height: this._chrome.offsetHeight,
    };
  }

  setRect({ left, top, width, height }) {
    if (this._destroyed) return;
    if (this._isFullscreen) {
      this._isFullscreen = false;
      this._chrome.classList.remove('window-chrome--fullscreen');
      setLiteralHtml(this._fsBtnIcon, EXPAND_ICON);
    }
    if (Number.isFinite(left)) this._chrome.style.left = left + 'px';
    if (Number.isFinite(top)) this._chrome.style.top = top + 'px';
    if (Number.isFinite(width)) this._chrome.style.width = width + 'px';
    if (Number.isFinite(height)) this._chrome.style.height = height + 'px';
  }

  maximize() {
    if (this._destroyed || this._isFullscreen) return;
    this._enterFullscreen();
  }

  // ─── Viewport Resize ──────────────────────────────────────

  onViewportResize() {
    this.clampToViewport();
  }

  clampToViewport() {
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
    this._resizer?.destroy();
    this._resizer = null;
    this._chrome.removeEventListener('pointermove', this._onDragMove);
    this._chrome.removeEventListener('pointerup', this._onDragEnd);
    this._chrome.removeEventListener('pointercancel', this._onDragCancel);
    this._chrome.remove();
    this._chrome = null;
    this._onClose = null;
    this._cbs = {};
    this._fsBtnIcon = null;
  }
}
