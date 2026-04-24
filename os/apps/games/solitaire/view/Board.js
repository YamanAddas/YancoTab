// view/Board.js — Renders the full solitaire board from engine state.
// Diff-based: reuses card elements across state changes (by card.id).
// No game logic here; Board reads state and emits intents via onIntent(kind, payload).

import { el } from '../../../../utils/dom.js';
import { createCardView, createPilePlaceholder } from './CardView.js';
import { computeLayout, tableauCardOffset, minBoardHeight } from './layout.js';
import { SUIT_INDEX } from '../engine/state.js';
import { DragController } from './drag.js';

const SUIT_SYMBOL = { H: '♥', D: '♦', C: '♣', S: '♠' };

export class Board {
  constructor({ onIntent } = {}) {
    this.onIntent = onIntent || (() => {});
    this.cards = new Map();          // id → CardView
    this.slots = {};                 // pile-key → placeholder el
    this.layout = null;
    this.state = null;

    this.root = el('div', { class: 'cosmic-solitaire' });
    this.inner = el('div', { class: 'cosmic-solitaire-inner' });
    this.boardEl = el('div', { class: 'cosmic-solitaire-board' });
    this.inner.append(this.boardEl);
    this.root.append(this.inner);

    this._buildSlots();

    // Responsive: recompute on resize.
    this._ro = new ResizeObserver(() => this._relayout());
    this._ro.observe(this.inner);

    // Handle interactions on the board (click, dblclick) at board level.
    this._onClick = this._onClick.bind(this);
    this._onDblClick = this._onDblClick.bind(this);
    this.boardEl.addEventListener('click', this._onClick);
    this.boardEl.addEventListener('dblclick', this._onDblClick);

    this.drag = new DragController({
      boardEl: this.boardEl,
      getState: () => this.state,
      getCardView: (id) => this.cards.get(id),
      getLayout: () => this.layout,
      onDrop: ({ from, to }) => this.onIntent('dragDrop', { from, to }),
    });
  }

  _buildSlots() {
    this.slots = {
      stock: null,
      waste: null,
      foundation: [null, null, null, null],
      tableau: [null, null, null, null, null, null, null],
    };
  }

  setState(state) {
    this.state = state;
    if (!this.layout) this._relayout();
    else this._render();
  }

  _relayout() {
    const rect = this.inner.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 600;
    this.layout = computeLayout(w, h);
    if (this.state) {
      this.boardEl.style.minHeight = `${minBoardHeight(this.state, this.layout)}px`;
      this._render();
    }
  }

  _ensureSlot(key, kind, x, y, label = '') {
    let cur = this._getSlot(key);
    if (!cur) {
      cur = createPilePlaceholder({ width: this.layout.cardW, height: this.layout.cardH, x, y, label, kind });
      cur.dataset.pile = key;
      this.boardEl.append(cur);
      this._setSlot(key, cur);
    } else {
      cur.style.width = `${this.layout.cardW}px`;
      cur.style.height = `${this.layout.cardH}px`;
      cur.style.transform = `translate(${x}px, ${y}px)`;
      if (label) cur.setAttribute('data-label', label);
    }
    return cur;
  }

  _getSlot(key) {
    if (key === 'stock') return this.slots.stock;
    if (key === 'waste') return this.slots.waste;
    if (key.startsWith('f')) return this.slots.foundation[+key.slice(1)];
    if (key.startsWith('t')) return this.slots.tableau[+key.slice(1)];
    return null;
  }
  _setSlot(key, val) {
    if (key === 'stock') this.slots.stock = val;
    else if (key === 'waste') this.slots.waste = val;
    else if (key.startsWith('f')) this.slots.foundation[+key.slice(1)] = val;
    else if (key.startsWith('t')) this.slots.tableau[+key.slice(1)] = val;
  }

  _render() {
    const s = this.state;
    const L = this.layout;
    if (!s || !L) return;

    // 1. Slots (placeholders) under every pile origin.
    this._ensureSlot('stock', 'stock', L.piles.stock.x, L.piles.stock.y, '↻');
    this._ensureSlot('waste', 'waste', L.piles.waste.x, L.piles.waste.y, '');
    for (let i = 0; i < 4; i++) {
      const p = L.piles.foundation[i];
      const suit = ['H', 'D', 'C', 'S'][i];
      this._ensureSlot(`f${i}`, 'foundation', p.x, p.y, SUIT_SYMBOL[suit]);
    }
    for (let i = 0; i < 7; i++) {
      const p = L.piles.tableau[i];
      this._ensureSlot(`t${i}`, 'tableau', p.x, p.y, '');
    }

    // 2. Walk every card in the state, position it, reuse by id.
    const seen = new Set();

    const place = (card, x, y, pile, indexInPile, faceUp) => {
      seen.add(card.id);
      let cv = this.cards.get(card.id);
      if (!cv) {
        cv = createCardView(card, { width: L.cardW, height: L.cardH, x, y });
        cv.el.dataset.cardId = card.id;
        this.boardEl.append(cv.el);
        this.cards.set(card.id, cv);
      } else {
        cv.resize(L.cardW, L.cardH);
      }
      cv.el.dataset.pile = pile;
      cv.el.dataset.index = String(indexInPile);
      cv.update(x, y, faceUp);
      // z-order via style (absolute overlap)
      cv.el.style.zIndex = String(100 + indexInPile);
    };

    // Stock — stacked at stock origin, all face-down
    s.stock.forEach((c, i) => {
      place(c, L.piles.stock.x, L.piles.stock.y, 'stock', i, false);
    });

    // Waste — slight right-fan for draw-3; single stack otherwise
    const fan = s.drawCount === 3 ? Math.round(L.cardW * 0.18) : 0;
    s.waste.forEach((c, i) => {
      // only show the last 3 fanned; older ones collapse
      const tailIdx = Math.max(0, s.waste.length - 3);
      const offset = Math.max(0, i - tailIdx);
      const x = L.piles.waste.x + offset * fan;
      place(c, x, L.piles.waste.y, 'waste', i, true);
    });

    // Foundation — stacked by suit
    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const p = L.piles.foundation[sIdx];
      const pile = s.foundation[sIdx];
      pile.forEach((c, i) => place(c, p.x, p.y, `f${sIdx}`, i, true));
    }

    // Tableau — fanned vertically
    s.tableau.forEach((pile, colIdx) => {
      const origin = L.piles.tableau[colIdx];
      pile.forEach((c, i) => {
        const dy = tableauCardOffset(pile, i, L.fanOpen, L.fanClosed);
        place(c, origin.x, origin.y + dy, `t${colIdx}`, i, !!c.faceUp);
      });
    });

    // 3. Remove cards that no longer exist in state.
    for (const [id, cv] of this.cards) {
      if (!seen.has(id)) {
        cv.el.remove();
        this.cards.delete(id);
      }
    }
  }

  // ── Animations ───────────────────────────────────────────────

  // Stagger cards in from the stock origin, in deal order:
  // col0[0], col1[0], col2[0], ..., col6[0], col1[1], col2[1], ..., col6[6].
  playDealAnimation() {
    const s = this.state; const L = this.layout;
    if (!s || !L) return;
    const order = [];
    for (let row = 0; row < 7; row++) {
      for (let col = row; col < 7; col++) {
        const card = s.tableau[col][row];
        if (!card) continue;
        order.push({ card, col, row });
      }
    }
    const stockX = L.piles.stock.x;
    const stockY = L.piles.stock.y;
    const prev = new Map();
    for (const { card } of order) {
      const cv = this.cards.get(card.id);
      if (!cv) continue;
      prev.set(card.id, cv.el.style.transform);
      cv.el.style.transition = 'none';
      cv.el.style.transform = `translate(${stockX}px, ${stockY}px)`;
      cv.el.style.opacity = '0';
    }
    // Force reflow so the starting position takes effect before we animate.
    void this.boardEl.offsetHeight;
    order.forEach(({ card }, i) => {
      const cv = this.cards.get(card.id);
      if (!cv) return;
      setTimeout(() => {
        cv.el.style.transition = '';
        cv.el.style.opacity = '1';
        const target = prev.get(card.id);
        if (target) cv.el.style.transform = target;
      }, i * 24);
    });
  }

  // ── Interaction ──────────────────────────────────────────────

  _findCardEl(target) {
    return target.closest?.('.cosmic-card');
  }
  _findSlotEl(target) {
    return target.closest?.('.cosmic-pile-slot');
  }

  _onClick(e) {
    // card click
    const cardEl = this._findCardEl(e.target);
    if (cardEl) {
      const pile = cardEl.dataset.pile;
      const idx = +cardEl.dataset.index;
      this.onIntent('cardClick', { pile, index: idx });
      return;
    }
    // slot click (only matters for empty stock slot → recycle)
    const slotEl = this._findSlotEl(e.target);
    if (slotEl && slotEl.dataset.pile === 'stock') {
      this.onIntent('stockClick', {});
    }
  }

  _onDblClick(e) {
    const cardEl = this._findCardEl(e.target);
    if (!cardEl) return;
    const pile = cardEl.dataset.pile;
    const idx = +cardEl.dataset.index;
    this.onIntent('cardDblClick', { pile, index: idx });
  }

  // ── Lifecycle ────────────────────────────────────────────────

  mount(parent) { parent.append(this.root); }
  destroy() {
    try { this._ro.disconnect(); } catch {}
    try { this.drag?.destroy(); } catch {}
    this.boardEl.removeEventListener('click', this._onClick);
    this.boardEl.removeEventListener('dblclick', this._onDblClick);
    this.cards.clear();
    this.root.remove();
  }
}

// Also re-export SUIT_INDEX so consumers don't need a second import.
export { SUIT_INDEX };
