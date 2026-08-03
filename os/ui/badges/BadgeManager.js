/**
 * badges/BadgeManager.js — paints live badges onto app icons.
 *
 * SmartIcon has always been able to render a `.smart-badge` (it checks
 * `metadata.badge`), but nothing ever set it and no stylesheet ever styled
 * it, so the path was dead. Rather than thread a `badge` field through the
 * four places that construct SmartIcons — and re-render icons on every data
 * change, which would fight the grid's drag state — this paints badges onto
 * whatever `.hex-icon[data-app-id]` elements are currently in the document.
 *
 * That decoupling is what makes it survive grid re-renders, page switches,
 * folder overlays and the dock without any of them knowing badges exist.
 *
 * Two refresh triggers:
 *   • storage subscriptions on the three source keys (event-driven; the
 *     store only emits when content actually changed, so a per-second
 *     Pomodoro TICK that changes nothing costs nothing)
 *   • a MutationObserver, because a re-rendered icon arrives badge-less
 *
 * Self-trigger safety: the painter writes nodes into the tree it observes.
 * Every host carries `dataset.badgeSig`, and painting is skipped when the
 * signature is unchanged — so a settled tree produces no mutations, and the
 * observer goes quiet instead of looping.
 */

import { el } from '../../utils/dom.js';
import { computeBadges, badgeSignature } from './badgeModel.js';

const TODO_KEY = 'yancotab_todo_v2';
const CLOCK_KEY = 'yancotab_clock_v3';
const POMODORO_KEY = 'yancotab_pomodoro_v1';

/** Every app that can carry a badge. Used to clear stale ones. */
const BADGED_APPS = ['todo', 'pomodoro', 'clock'];

export class BadgeManager {
  constructor(kernel) {
    this.kernel = kernel;
    this._unsubs = [];
    this._observer = null;
    this._frame = 0;
    this._painting = false;
  }

  start(rootEl = document.body) {
    this._root = rootEl;

    for (const key of [TODO_KEY, CLOCK_KEY, POMODORO_KEY]) {
      const off = this.kernel?.storage?.subscribe?.(key, () => this.schedule());
      if (typeof off === 'function') this._unsubs.push(off);
    }

    // Todo writes route through helpers that emit this; keeping it means a
    // badge still updates if a future write path skips kernel.storage.
    const offTodo = this.kernel?.on?.('todo:changed', () => this.schedule());
    if (typeof offTodo === 'function') this._unsubs.push(offTodo);

    this._observer = new MutationObserver((records) => {
      if (this._painting) return;
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('.hex-icon') || node.querySelector?.('.hex-icon')) {
            this.schedule();
            return;
          }
        }
      }
    });
    this._observer.observe(rootEl, { childList: true, subtree: true });

    this.refresh();
  }

  /** Coalesce bursts (a grid re-render fires many mutations) into one paint. */
  schedule() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this.refresh();
    });
  }

  _load(key) {
    try { return this.kernel?.storage?.load?.(key); } catch { return null; }
  }

  refresh() {
    const badges = computeBadges({
      todo: this._load(TODO_KEY),
      clock: this._load(CLOCK_KEY),
      pomodoro: this._load(POMODORO_KEY),
    });

    this._painting = true;
    try {
      for (const appId of BADGED_APPS) {
        const descriptor = badges[appId] || null;
        const hosts = document.querySelectorAll(`.hex-icon[data-app-id="${appId}"]`);
        for (const host of hosts) this._paint(host, descriptor);
      }
    } finally {
      // Release on the next frame: the mutations we just made are delivered
      // asynchronously, so clearing synchronously would let our own writes
      // through as if they were someone else's re-render.
      requestAnimationFrame(() => { this._painting = false; });
    }
  }

  _paint(host, descriptor) {
    const sig = badgeSignature(descriptor);
    if (host.dataset.badgeSig === sig) return;   // already correct — touch nothing
    host.dataset.badgeSig = sig;

    host.querySelector(':scope > .smart-badge')?.remove();
    if (!descriptor) return;

    const badge = el('div', {
      class: `smart-badge is-${descriptor.kind}`,
      'data-tone': descriptor.tone || '',
      // Counts are meaningful to a screen reader; a decorative state dot is
      // announced by the app it sits on, so it stays out of the a11y tree.
      'aria-hidden': descriptor.kind === 'dot' ? 'true' : 'false',
    }, descriptor.kind === 'count' ? descriptor.text : '');

    if (descriptor.kind === 'count') {
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-label', `${descriptor.text} open`);
    }

    host.appendChild(badge);
  }

  stop() {
    for (const off of this._unsubs) { try { off(); } catch { /* ignore */ } }
    this._unsubs = [];
    this._observer?.disconnect();
    this._observer = null;
    if (this._frame) { cancelAnimationFrame(this._frame); this._frame = 0; }
    for (const host of document.querySelectorAll('.hex-icon[data-badge-sig]')) {
      host.querySelector(':scope > .smart-badge')?.remove();
      delete host.dataset.badgeSig;
    }
  }
}
