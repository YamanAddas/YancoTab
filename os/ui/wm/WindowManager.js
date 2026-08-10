/**
 * WindowManager.js — Desktop Window Mode (PRODUCTION_PLAN §4.6).
 *
 * Owns every WindowChrome on screen: concurrent windows, z-order, focus,
 * minimize/restore, cascade placement, and edge-snap. All ordering and
 * geometry *decisions* live in the pure wmCore module (tested); this file
 * only applies them to the DOM.
 *
 * Modes:
 *   multi   — WM_MEDIA_QUERY matches (≥1024px + fine pointer). Up to
 *             WINDOW_CAP concurrent windows.
 *   compact — small screens / coarse pointers. At most one visible
 *             window; opening another closes the previous process
 *             (today's UX, minus the old invisible-process leak).
 *
 * The shell hands over its app layer and a two-call adapter for the
 * home↔app chrome transitions it still owns (grid dim, dock hide, search
 * disable). body.in-app means "≥1 non-minimized window".
 */

import { el } from '../../utils/dom.js';
import {
  createWmState, openWindow, closeWindow, activate, minimize,
  minimizeAll, compactEnforce, visiblePids, zOf, cascadeOffset,
  hitTestSnap, snapRect, WM_MEDIA_QUERY,
} from './wmCore.js';
import { WindowChrome } from '../components/WindowChrome.js';

const Z_BASE = 10;

export class WindowManager {
  constructor(kernel, { layer, shellAdapter }) {
    this.kernel = kernel;
    this.layer = layer;
    this.adapter = shellAdapter;
    this.state = createWmState();
    this.entries = new Map(); // pid → { pid, appId, name, app, chrome, snap }
    this._mql = window.matchMedia(WM_MEDIA_QUERY);
    this._armedZone = null;
    this._inAppMode = false;
  }

  init() {
    // Shared scrim + snap preview live at the bottom of the layer; window
    // chromes are appended after them so they always paint on top.
    this._scrim = el('div', { class: 'wm-scrim' });
    this._preview = el('div', { class: 'wm-snap-preview', hidden: true });
    this.layer.append(this._scrim, this._preview);

    document.body.classList.toggle('wm-multi', this._mql.matches);
    this._mql.addEventListener('change', () => this._onGateChange());

    this.kernel.on('process:started', (d) => this._onStarted(d));
    this.kernel.on('process:stopped', (d) => this._onStopped(d));
    this.kernel.on('process:reused', (d) => this._onReused(d));
  }

  // ─── Read API (shell compatibility surface) ────────────────

  get focusedPid() { return this.state.focused; }
  get windowCount() { return this.state.order.length; }
  get visibleCount() { return visiblePids(this.state).length; }
  get isMulti() { return this._mql.matches; }

  // ─── Commands ──────────────────────────────────────────────

  focus(pid) {
    if (!this.entries.has(pid)) return;
    const wasMinimized = this.state.minimized.includes(pid);
    this._apply(activate(this.state, pid));
    if (wasMinimized) {
      // Compact mode keeps its single-visible invariant: restoring one
      // window sends the previously visible one away (by closing it —
      // compact restore mirrors compact open).
      if (!this.isMulti) {
        for (const other of visiblePids(this.state)) {
          if (other !== pid) this._closePid(other);
        }
      }
      const entry = this.entries.get(pid);
      // Just became visible again — its rect may predate a viewport
      // shrink (display:none windows cannot be clamped in place).
      entry?.chrome.clampToViewport();
      try { entry?.app?.onSignal?.('resume'); } catch { /* app's problem */ }
    }
  }

  minimize(pid) {
    const entry = this.entries.get(pid);
    if (!entry || this.state.minimized.includes(pid)) return;
    this._apply(minimize(this.state, pid));
    try { entry.app?.onSignal?.('pause'); } catch { /* app's problem */ }
  }

  restore(pid) { this.focus(pid); }

  minimizeAll() {
    for (const pid of visiblePids(this.state)) {
      try { this.entries.get(pid)?.app?.onSignal?.('pause'); } catch { /* ignore */ }
    }
    this._apply(minimizeAll(this.state));
  }

  /** Home button: multi = show desktop (minimize), compact = close. */
  showDesktop() {
    if (this.isMulti) {
      this.minimizeAll();
    } else {
      for (const pid of visiblePids(this.state)) this._closePid(pid);
    }
  }

  closeFocused() {
    if (this.state.focused != null) this._closePid(this.state.focused);
  }

  handleViewportResize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const entry of this.entries.values()) {
      // Minimized: display:none makes every measurement zero — clamping
      // happens on restore instead. Fullscreen: geometry is class-driven;
      // re-applying a stale snap rect here would yank the window out of
      // fullscreen.
      if (this.state.minimized.includes(entry.pid)) continue;
      if (entry.chrome.isFullscreen) continue;
      if (entry.snap) {
        const rect = snapRect(entry.snap.zone, vw, vh);
        if (rect) entry.chrome.setRect(rect);
      } else {
        entry.chrome.clampToViewport();
      }
    }
  }

  // ─── Lifecycle handlers ────────────────────────────────────

  _onStarted({ pid, appId, app }) {
    const result = openWindow(this.state, pid);
    if (!result.ok) {
      this.kernel.emit('toast', {
        message: 'Window limit reached — close a window first',
        type: 'warning',
      });
      this.kernel.processManager.kill(pid);
      return;
    }

    const appName = app.metadata?.name || 'App';
    const content = this._vetRoot(app, appId, appName);

    let chrome;
    try {
      chrome = new WindowChrome(appName, content, {
        onClose: () => {
          // The close animation defers the actual kill by ~220ms; mark
          // the process so a relaunch during the fade spawns fresh
          // instead of focusing a window committed to dying.
          this.kernel.processManager.markClosing(pid);
          app.close();
        },
        onFocusRequest: () => {
          if (this.state.focused !== pid) this.focus(pid);
        },
        onMinimize: () => this.minimize(pid),
        onDragStart: () => this._onWinDragStart(pid),
        onDragMove: (e) => this._onWinDragMove(e),
        onDragEnd: (e) => this._onWinDragEnd(pid, e),
        onDragCancel: () => this._hidePreview(),
        onUserResize: () => {
          const entry = this.entries.get(pid);
          if (entry) entry.snap = null;
        },
      });
    } catch (e) {
      console.error('[WM] Failed to mount WindowChrome for', appName, ':', e);
      this.kernel.emit('toast', { message: `Couldn't open ${appName}`, type: 'error' });
      try { app.close(); } catch { /* ignore */ }
      return;
    }

    // Compact mode: one visible window. Close what was visible before
    // admitting the newcomer (its process would otherwise idle unseen).
    const previouslyVisible = this.isMulti ? [] : visiblePids(this.state);

    this.entries.set(pid, { pid, appId, name: appName, app, chrome, snap: null });
    this.layer.appendChild(chrome.chrome);

    this._apply(result.state);

    // Cascade AFTER mount so per-app :has() CSS defaults have applied.
    // offsetLeft/Top are used-value pixels, immune to the windowOpen
    // scale animation (gBCR lies for its first 350ms). Width/height are
    // never written here — they stay CSS-driven until the user acts.
    if (this.isMulti && result.cascadeSlot > 0) {
      const { dx, dy } = cascadeOffset(result.cascadeSlot);
      const c = chrome.chrome;
      chrome.setRect({ left: c.offsetLeft + dx, top: c.offsetTop + dy });
      chrome.clampToViewport();
    }

    for (const old of previouslyVisible) this._closePid(old);
  }

  _onStopped({ pid } = {}) {
    const entry = this.entries.get(pid);
    if (!entry) return; // not ours (cap-denied teardown, killed during init)
    entry.chrome.destroy();
    this.entries.delete(pid);
    this._apply(closeWindow(this.state, pid));
  }

  _onReused({ pid } = {}) {
    if (!this.entries.has(pid)) return;
    this.focus(pid);
  }

  _onGateChange() {
    const multi = this._mql.matches;
    document.body.classList.toggle('wm-multi', multi);
    if (!multi) {
      // Desktop → compact (often a transient resize, e.g. devtools):
      // minimize everything except the focused window. Nothing is killed —
      // destroying work on an accidental resize is unacceptable.
      const { state, toMinimize } = compactEnforce(this.state);
      for (const pid of toMinimize) {
        try { this.entries.get(pid)?.app?.onSignal?.('pause'); } catch { /* ignore */ }
      }
      this._apply(state);
    }
    this.handleViewportResize();
  }

  // ─── Snap ──────────────────────────────────────────────────

  _onWinDragStart(pid) {
    const entry = this.entries.get(pid);
    if (!entry || !entry.snap) return null;
    const prev = entry.snap.prevRect;
    entry.snap = null;
    return prev ? { width: prev.width, height: prev.height } : null;
  }

  _onWinDragMove(e) {
    if (!this.isMulti) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const zone = hitTestSnap(e.clientX, e.clientY, vw, vh);
    if (zone === this._armedZone) return;
    this._armedZone = zone;
    if (!zone) { this._hidePreview(); return; }
    const rect = zone === 'top'
      ? { left: 0, top: 0, width: vw, height: vh }
      : snapRect(zone, vw, vh);
    const p = this._preview;
    p.style.left = rect.left + 'px';
    p.style.top = rect.top + 'px';
    p.style.width = rect.width + 'px';
    p.style.height = rect.height + 'px';
    p.style.zIndex = String(Z_BASE + 2 * (this.state.order.length - 1) - 1);
    p.hidden = false;
  }

  _onWinDragEnd(pid, e) {
    const zone = this._armedZone;
    this._hidePreview();
    if (!zone || !this.isMulti) return;
    const entry = this.entries.get(pid);
    if (!entry) return;
    if (zone === 'top') {
      // Maximize via the chrome's own fullscreen path — it stores its own
      // restore rect, and drag-away un-maximizes through the same door.
      entry.chrome.maximize();
      return;
    }
    const rect = snapRect(zone, window.innerWidth, window.innerHeight);
    entry.snap = { zone, prevRect: entry.chrome.getRect() };
    entry.chrome.setRect(rect);
  }

  _hidePreview() {
    this._armedZone = null;
    this._preview.hidden = true;
  }

  // ─── Internals ─────────────────────────────────────────────

  _closePid(pid) {
    const pm = this.kernel.processManager;
    if (!pm.closeProcess(pid)) pm.kill(pid);
  }

  /** Crash guard (moved verbatim in spirit from mobileShell). */
  _vetRoot(app, appId, appName) {
    const root = app.root;
    if (root instanceof HTMLElement) return root;
    console.error('[WM]', appName, 'crashed on mount: root is not a DOM element');
    return el('div', {
      class: 'app-crash',
      style: 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:24px;text-align:center;color:var(--text-bright);',
    }, [
      el('h3', { style: 'font-size:18px;margin:0;' }, `${appName} crashed`),
      el('p', { style: 'font-size:13px;color:var(--text-dim);margin:0;max-width:300px;' },
        'The app did not produce a window'),
      el('button', {
        type: 'button',
        style: 'margin-top:8px;padding:8px 20px;background:var(--accent);color:#000;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;',
        onclick: () => { app.close(); this.kernel.emit('app:open', appId || app.metadata?.id); },
      }, 'Restart'),
    ]);
  }

  /** Commit a new core state: paint z/focus/minimize, drive app mode. */
  _apply(next) {
    const prev = this.state;
    this.state = next;

    for (const entry of this.entries.values()) {
      const z = zOf(next, entry.pid);
      entry.chrome.setZ(Z_BASE + 2 * Math.max(0, z));
      entry.chrome.setFocused(next.focused === entry.pid);
      const wasMin = prev.minimized.includes(entry.pid);
      const isMin = next.minimized.includes(entry.pid);
      if (wasMin !== isMin) entry.chrome.setMinimized(isMin);
    }

    // Keyboard-focus handoff: when the window that HELD focus closed or
    // minimized, DOM focus silently dropped to <body>. Hand it to the
    // newly focused window. Only then — a plain click-to-focus must not
    // steal focus from the content the user just clicked.
    const prevGone = prev.focused != null && prev.focused !== next.focused
      && (!this.entries.has(prev.focused) || next.minimized.includes(prev.focused));
    if (prevGone && next.focused != null) {
      this.entries.get(next.focused)?.chrome.takeKeyboardFocus();
    }

    const anyVisible = visiblePids(next).length > 0;
    if (anyVisible && !this._inAppMode) {
      this._inAppMode = true;
      this.adapter.onEnterApp();
    } else if (!anyVisible && this._inAppMode) {
      this._inAppMode = false;
      this.adapter.onLeaveApp();
    }

    this.kernel.emit('wm:changed', {
      windows: next.order.map((pid) => {
        const entry = this.entries.get(pid);
        return {
          pid,
          appId: entry?.appId || '',
          name: entry?.name || 'App',
          minimized: next.minimized.includes(pid),
          focused: next.focused === pid,
        };
      }),
    });
  }
}
