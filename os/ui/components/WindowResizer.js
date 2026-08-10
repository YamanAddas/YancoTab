/**
 * WindowResizer.js — the 8-edge resize subsystem for a WindowChrome.
 *
 * Extracted from WindowChrome.js when the window-manager hooks pushed it
 * past the 500-line cap. Self-contained: owns its handles, listeners and
 * gesture state; WindowChrome only constructs and destroys it.
 */

import { el } from '../../utils/dom.js';

const MIN_W = 320;
const MIN_H = 240;
const EDGES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export class WindowResizer {
  /**
   * @param {HTMLElement} win — the .window-chrome root; handles are
   *   appended to it and inline left/top/width/height are written on it.
   * @param {object} opts
   * @param {() => boolean} opts.isBlocked — true while resizing must not
   *   start (fullscreen).
   * @param {() => void} [opts.onUserResize] — fired once when a resize
   *   gesture begins (the WM clears stale snap bookkeeping on it).
   */
  constructor(win, { isBlocked, onUserResize } = {}) {
    this._win = win;
    this._isBlocked = isBlocked || (() => false);
    this._onUserResize = onUserResize || null;
    this._resizing = false;
    this._edge = null;
    this._start = { x: 0, y: 0, l: 0, t: 0, w: 0, h: 0 };

    this._onMove = this._onMove.bind(this);
    this._onEnd = this._onEnd.bind(this);

    for (const edge of EDGES) {
      const handle = el('div', {
        class: `window-chrome__resize-handle window-chrome__resize-handle--${edge}`,
      });
      handle.dataset.edge = edge;
      handle.addEventListener('pointerdown', (e) => this._onStart(e));
      win.appendChild(handle);
    }
  }

  _onStart(e) {
    if (this._isBlocked() || e.button !== 0) return;
    this._resizing = true;
    this._edge = e.currentTarget.dataset.edge;
    // A manual resize invalidates any snapped-state bookkeeping the WM
    // holds — otherwise the next viewport resize would revert the user's
    // chosen size back to the half-snap rect.
    if (this._onUserResize) this._onUserResize();

    const rect = this._win.getBoundingClientRect();
    this._start = {
      x: e.clientX,
      y: e.clientY,
      l: rect.left,
      t: rect.top,
      w: rect.width,
      h: rect.height,
    };

    this._win.classList.add('window-chrome--resizing');
    document.addEventListener('pointermove', this._onMove);
    document.addEventListener('pointerup', this._onEnd);
    e.preventDefault();
    e.stopPropagation();
  }

  _onMove(e) {
    if (!this._resizing) return;
    const dx = e.clientX - this._start.x;
    const dy = e.clientY - this._start.y;
    const edge = this._edge;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let { l, t, w, h } = this._start;

    // East
    if (edge.includes('e')) {
      w = Math.max(MIN_W, Math.min(vw - l, this._start.w + dx));
    }
    // West
    if (edge.includes('w')) {
      const maxExpand = this._start.l + this._start.w - MIN_W;
      l = Math.max(0, Math.min(maxExpand, this._start.l + dx));
      w = this._start.l + this._start.w - l;
      if (w < MIN_W) { w = MIN_W; l = this._start.l + this._start.w - MIN_W; }
    }
    // South
    if (edge.includes('s')) {
      h = Math.max(MIN_H, Math.min(vh - t, this._start.h + dy));
    }
    // North
    if (edge.includes('n')) {
      const maxExpand = this._start.t + this._start.h - MIN_H;
      t = Math.max(0, Math.min(maxExpand, this._start.t + dy));
      h = this._start.t + this._start.h - t;
      if (h < MIN_H) { h = MIN_H; t = this._start.t + this._start.h - MIN_H; }
    }

    this._win.style.left = l + 'px';
    this._win.style.top = t + 'px';
    this._win.style.width = w + 'px';
    this._win.style.height = h + 'px';
  }

  _onEnd() {
    if (!this._resizing) return;
    this._resizing = false;
    this._edge = null;
    this._win.classList.remove('window-chrome--resizing');
    document.removeEventListener('pointermove', this._onMove);
    document.removeEventListener('pointerup', this._onEnd);
  }

  destroy() {
    document.removeEventListener('pointermove', this._onMove);
    document.removeEventListener('pointerup', this._onEnd);
    this._win = null;
    this._onUserResize = null;
  }
}
