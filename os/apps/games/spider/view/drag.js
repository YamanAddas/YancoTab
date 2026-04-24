// view/drag.js — Pointer-based drag controller for Spider.
// Tableau-only: you can only pick up a face-up same-suit descending run from a
// tableau column (Spider's isValidRun rule). Drops are always onto another
// tableau column. Stock and foundation are not drag sources or drop targets.
//
// 6px movement or 150ms hold promotes pointerdown to drag; below that, the
// pointerup passes through to Board's click handler (tap-to-move).

import { isValidRun } from '../engine/rules.js';

const DRAG_MOVE_THRESHOLD = 6;
const DRAG_HOLD_THRESHOLD_MS = 150;

export class DragController {
  constructor({ boardEl, getState, getCardView, getLayout, onDrop }) {
    this.boardEl = boardEl;
    this.getState = getState;
    this.getCardView = getCardView;
    this.getLayout = getLayout;
    this.onDrop = onDrop || (() => {});

    this.active = null;
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onCancel = this._onCancel.bind(this);

    boardEl.addEventListener('pointerdown', this._onDown);
  }

  destroy() {
    this.boardEl.removeEventListener('pointerdown', this._onDown);
    this._detachMove();
    this._clearHold();
  }

  _attachMove() {
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onCancel);
  }
  _detachMove() {
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onCancel);
  }
  _clearHold() {
    if (this.active?.holdTimer) {
      clearTimeout(this.active.holdTimer);
      this.active.holdTimer = null;
    }
  }

  _onDown(e) {
    if (e.button != null && e.button !== 0) return;
    const cardEl = e.target.closest?.('.cosmic-card');
    if (!cardEl) return;
    if (cardEl.classList.contains('cosmic-spider-stock-pile')) return;
    const pile = cardEl.dataset.pile;
    const idx = +cardEl.dataset.index;

    const ids = this._grabIds(pile, idx);
    if (!ids) return;

    this.active = {
      pile,
      fromIdx: idx,
      ids,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      started: false,
      pointerId: e.pointerId,
      holdTimer: null,
    };
    this.active.holdTimer = setTimeout(() => this._maybeStart(), DRAG_HOLD_THRESHOLD_MS);
    this._attachMove();
  }

  _grabIds(pile, idx) {
    const s = this.getState();
    if (!s) return null;
    if (!pile || !pile.startsWith('t')) return null;
    const col = +pile.slice(1);
    const tp = s.tableau[col];
    if (idx < 0 || idx >= tp.length) return null;
    if (!tp[idx].faceUp) return null;
    if (!isValidRun(tp, idx)) return null;
    return tp.slice(idx).map((c) => c.id);
  }

  _maybeStart() {
    if (!this.active || this.active.started) return;
    this._beginDrag();
  }

  _beginDrag() {
    this.active.started = true;
    for (const id of this.active.ids) {
      const cv = this.getCardView(id);
      if (!cv) continue;
      cv.el.classList.add('dragging');
      cv.el.style.zIndex = '9999';
      cv.el.style.transition = 'none';
    }
  }

  _onMove(e) {
    if (!this.active) return;
    this.active.dx = e.clientX - this.active.startX;
    this.active.dy = e.clientY - this.active.startY;

    if (!this.active.started) {
      const dist = Math.hypot(this.active.dx, this.active.dy);
      if (dist >= DRAG_MOVE_THRESHOLD) this._beginDrag();
      else return;
    }

    for (const id of this.active.ids) {
      const cv = this.getCardView(id);
      if (!cv) continue;
      const base = this._baseTransform(cv);
      cv.el.style.transform = `translate(${base.x + this.active.dx}px, ${base.y + this.active.dy}px)`;
    }

    this._updateDropHint(e);
  }

  _baseTransform(cv) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(cv.el.style.transform || '');
    if (!m) return { x: 0, y: 0 };
    if (!cv.el.dataset.dragBaseX) {
      cv.el.dataset.dragBaseX = m[1];
      cv.el.dataset.dragBaseY = m[2];
    }
    return { x: +cv.el.dataset.dragBaseX, y: +cv.el.dataset.dragBaseY };
  }

  _updateDropHint(e) {
    this.boardEl.querySelectorAll('.cosmic-pile-slot.hot').forEach((el) => el.classList.remove('hot'));
    const target = this._hitTest(e.clientX, e.clientY);
    if (target?.pileEl) target.pileEl.classList.add('hot');
  }

  _hitTest(x, y) {
    const hidden = [];
    for (const id of this.active.ids) {
      const cv = this.getCardView(id);
      if (!cv) continue;
      hidden.push([cv.el, cv.el.style.pointerEvents]);
      cv.el.style.pointerEvents = 'none';
    }
    const els = document.elementsFromPoint(x, y);
    for (const [el, old] of hidden) el.style.pointerEvents = old;

    for (const el of els) {
      const cardEl = el.closest?.('.cosmic-card');
      if (cardEl) {
        const pile = cardEl.dataset.pile;
        // Only tableau columns are valid drop targets.
        if (!pile || !pile.startsWith('t')) continue;
        const slotEl = this.boardEl.querySelector(`.cosmic-pile-slot[data-pile="${pile}"]`);
        return { pile, pileEl: slotEl || cardEl };
      }
      const slotEl = el.closest?.('.cosmic-pile-slot');
      if (slotEl && slotEl.dataset.pile?.startsWith('t')) {
        return { pile: slotEl.dataset.pile, pileEl: slotEl };
      }
    }
    return null;
  }

  _onUp(e) {
    if (!this.active) return;
    this._clearHold();

    if (!this.active.started) {
      // Tap — let the board's click handler take over.
      this._cleanup();
      return;
    }

    const target = this._hitTest(e.clientX, e.clientY);
    const from = { pile: this.active.pile, idx: this.active.fromIdx };
    const to = target?.pile || null;

    for (const id of this.active.ids) {
      const cv = this.getCardView(id);
      if (!cv) continue;
      cv.el.classList.remove('dragging');
      cv.el.style.transition = '';
      cv.el.style.zIndex = '';
      delete cv.el.dataset.dragBaseX;
      delete cv.el.dataset.dragBaseY;
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(cv.el.style.transform || '');
      if (m) cv.el.style.transform = `translate(${m[1]}px, ${m[2]}px)`;
    }
    this.boardEl.querySelectorAll('.cosmic-pile-slot.hot').forEach((el) => el.classList.remove('hot'));

    this._cleanup();

    if (to && to !== from.pile) this.onDrop({ from, to });
  }

  _onCancel() {
    if (!this.active) return;
    this._clearHold();
    for (const id of this.active.ids) {
      const cv = this.getCardView(id);
      if (!cv) continue;
      cv.el.classList.remove('dragging');
      cv.el.style.transition = '';
      cv.el.style.zIndex = '';
      delete cv.el.dataset.dragBaseX;
      delete cv.el.dataset.dragBaseY;
    }
    this.boardEl.querySelectorAll('.cosmic-pile-slot.hot').forEach((el) => el.classList.remove('hot'));
    this._cleanup();
  }

  _cleanup() {
    this.active = null;
    this._detachMove();
  }
}
