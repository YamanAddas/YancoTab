// view/drag.js — Pointer-based drag controller for Solitaire.
// Selects a valid run from a tableau card or the waste top, follows the pointer,
// hit-tests drop targets, and emits a single intent back to the Board.
//
// Threshold: 6px movement or 150ms hold promotes a pointerdown into a drag;
// below that, we let the Board's click/dblclick handlers run normally.

import { isValidRun } from '../engine/rules.js';

const DRAG_MOVE_THRESHOLD = 6;
const DRAG_HOLD_THRESHOLD_MS = 150;

export class DragController {
  constructor({ boardEl, getState, getCardView, getLayout, onDrop }) {
    this.boardEl = boardEl;
    this.getState = getState;
    this.getCardView = getCardView;           // (id) → CardView { el }
    this.getLayout = getLayout;
    this.onDrop = onDrop || (() => {});

    this.active = null;   // { pile, fromIdx, ids, startX, startY, dx, dy, started, holdTimer }
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
    const pile = cardEl.dataset.pile;
    const idx = +cardEl.dataset.index;

    const ids = this._grabIds(pile, idx);
    if (!ids) return;  // not a draggable pile/card

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

    if (pile === 'waste') {
      if (s.waste.length === 0) return null;
      if (idx !== s.waste.length - 1) return null;
      return [s.waste[idx].id];
    }
    if (pile.startsWith('t')) {
      const col = +pile.slice(1);
      const tp = s.tableau[col];
      if (idx < 0 || idx >= tp.length) return null;
      if (!tp[idx].faceUp) return null;
      if (!isValidRun(tp, idx)) return null;
      return tp.slice(idx).map((c) => c.id);
    }
    if (pile.startsWith('f')) {
      const sIdx = +pile.slice(1);
      const fp = s.foundation[sIdx];
      if (fp.length === 0) return null;
      if (idx !== fp.length - 1) return null;
      return [fp[idx].id];
    }
    return null;  // stock is not draggable
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
    // cv.el style.transform is "translate(Npx, Mpx)" — parse the base; fallback to 0,0.
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(cv.el.style.transform || '');
    if (!m) return { x: 0, y: 0 };
    // When dragging we rewrite transform — we want the original position, so we store it once.
    if (!cv.el.dataset.dragBaseX) {
      cv.el.dataset.dragBaseX = m[1];
      cv.el.dataset.dragBaseY = m[2];
    }
    return { x: +cv.el.dataset.dragBaseX, y: +cv.el.dataset.dragBaseY };
  }

  _updateDropHint(e) {
    // Clear previous hots
    this.boardEl.querySelectorAll('.cosmic-pile-slot.hot').forEach((el) => el.classList.remove('hot'));
    const target = this._hitTest(e.clientX, e.clientY);
    if (target?.pileEl) target.pileEl.classList.add('hot');
  }

  _hitTest(x, y) {
    // Temporarily hide dragging cards so elementFromPoint finds what's below.
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
      // Prefer top card of a pile
      const cardEl = el.closest?.('.cosmic-card');
      if (cardEl && !this.active.ids.includes(cardEl.dataset.cardId ? cardEl.dataset.cardId : '')) {
        // Use card's pile as the drop target
        const pile = cardEl.dataset.pile;
        if (!pile) continue;
        const slotEl = this.boardEl.querySelector(`.cosmic-pile-slot[data-pile="${pile}"]`);
        return { pile, pileEl: slotEl || cardEl };
      }
      const slotEl = el.closest?.('.cosmic-pile-slot');
      if (slotEl) return { pile: slotEl.dataset.pile, pileEl: slotEl };
    }
    return null;
  }

  _onUp(e) {
    if (!this.active) return;
    this._clearHold();

    if (!this.active.started) {
      // Treated as a click — clean up and let click handler run.
      this._cleanup();
      return;
    }

    const target = this._hitTest(e.clientX, e.clientY);
    const from = { pile: this.active.pile, idx: this.active.fromIdx };
    const to = target?.pile || null;

    // Snap-back animation: clear inline transforms, restore CSS transition
    for (const id of this.active.ids) {
      const cv = this.getCardView(id);
      if (!cv) continue;
      cv.el.classList.remove('dragging');
      cv.el.style.transition = '';
      cv.el.style.zIndex = '';
      delete cv.el.dataset.dragBaseX;
      delete cv.el.dataset.dragBaseY;
      // Re-apply base transform so element returns home; the re-render from the reducer
      // (if the drop is legal) will move it onward; if illegal, it stays here.
      const base = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(cv.el.style.transform || '');
      if (base) cv.el.style.transform = `translate(${base[1]}px, ${base[2]}px)`;
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
