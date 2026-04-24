// view/Board.js — Renders the full Spider board from engine state.
// Diff-based: reuses card elements across state changes (by card.id).
// No game logic here; Board reads state and emits intents via onIntent(kind, payload).
//
// Layout:
//   Top row   — up to 8 foundation trophy stacks (one side) + stock
//               deal-piles indicator (other side). One stock pile per 10 cards
//               remaining, overlapped horizontally; tapping stock dispatches DEAL.
//   Tableau   — 10 columns fanned vertically. Runs get built on top; only
//               face-up, same-suit, strictly descending runs are draggable
//               (enforced in drag.js, which imports Spider's isValidRun).

import { el } from '../../../../utils/dom.js';
import { createCardView, createPilePlaceholder } from './CardView.js';
import { computeLayout, tableauCardOffset, fitFansToHeight, minBoardHeight } from './layout.js';
import { DragController } from './drag.js';

const SUIT_SYMBOL = { H: '♥', D: '♦', C: '♣', S: '♠' };

export class Board {
  constructor({ onIntent } = {}) {
    this.onIntent = onIntent || (() => {});
    this.cards = new Map();          // id → CardView
    this.slots = { tableau: [], foundation: [], stock: null };
    this.stockPileEls = [];          // small stacked card-backs for remaining deals
    this.layout = null;
    this.state = null;
    this.layoutOpts = { leftHanded: false };
    // Per-column fan overrides so a long pile can shrink without squeezing neighbours.
    this._colFans = new Array(10).fill(null);

    this.root = el('div', { class: 'cosmic-solitaire cosmic-spider' });
    this.inner = el('div', { class: 'cosmic-solitaire-inner' });
    this.boardEl = el('div', { class: 'cosmic-solitaire-board' });
    this.inner.append(this.boardEl);
    this.root.append(this.inner);

    this._ro = new ResizeObserver(() => this._relayout());
    this._ro.observe(this.inner);

    this._onClick = this._onClick.bind(this);
    this.boardEl.addEventListener('click', this._onClick);
    // NOTE: Spider intentionally has no double-click auto-route. Completed K→A
    // same-suit runs move to the foundation automatically — the player never
    // "sends" a card anywhere. Tap-to-move handles single clicks only.

    this.drag = new DragController({
      boardEl: this.boardEl,
      getState: () => this.state,
      getCardView: (id) => this.cards.get(id),
      getLayout: () => this.layout,
      onDrop: ({ from, to }) => {
        // A real drag just completed. Swallow the browser's synthesized click
        // that will fire right after pointerup — otherwise Board._onClick
        // would re-trigger tap-to-move on the drop target.
        this._suppressNextClick();
        this.onIntent('dragDrop', { from, to });
      },
    });
  }

  // Once-per-drag click eater. Captures the very next click anywhere in the
  // document and prevents default + stopPropagation, then releases.
  _suppressNextClick() {
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('click', handler, true);
    };
    window.addEventListener('click', handler, true);
    // Safety: if for some reason no click follows (e.g. pointercancel path),
    // release the capture listener after one frame so future clicks aren't eaten.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.removeEventListener('click', handler, true));
    });
  }

  setState(state) {
    this.state = state;
    if (!this.layout) this._relayout();
    else this._render();
  }

  setLayoutOpts(opts = {}) {
    this.layoutOpts = { ...this.layoutOpts, ...opts };
    this._relayout();
  }

  _relayout() {
    const rect = this.inner.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 600;
    this.layout = computeLayout(w, h, this.layoutOpts);
    if (this.state) this._render();
  }

  _render() {
    const s = this.state;
    const L = this.layout;
    if (!s || !L) return;

    // ── 1. Slots (tableau placeholders + foundation trophies) ──
    // Tableau slots — always 10, even if column is non-empty (they sit under cards).
    for (let i = 0; i < 10; i++) {
      const p = L.piles.tableau[i];
      let slot = this.slots.tableau[i];
      if (!slot) {
        slot = createPilePlaceholder({ width: L.cardW, height: L.cardH, x: p.x, y: p.y, kind: 'tableau' });
        slot.dataset.pile = `t${i}`;
        this.boardEl.append(slot);
        this.slots.tableau[i] = slot;
      } else {
        slot.style.width = `${L.cardW}px`;
        slot.style.height = `${L.cardH}px`;
        slot.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
    }

    // Foundation trophy slots — 8 total, labelled with a dim suit glyph until
    // a completed run is placed there.
    for (let i = 0; i < 8; i++) {
      const p = L.piles.foundation[i];
      let slot = this.slots.foundation[i];
      const label = s.foundation[i] ? '' : '★';
      if (!slot) {
        slot = createPilePlaceholder({ width: L.cardW, height: L.cardH, x: p.x, y: p.y, label, kind: 'foundation' });
        slot.dataset.pile = `f${i}`;
        this.boardEl.append(slot);
        this.slots.foundation[i] = slot;
      } else {
        slot.style.width = `${L.cardW}px`;
        slot.style.height = `${L.cardH}px`;
        slot.style.transform = `translate(${p.x}px, ${p.y}px)`;
        slot.setAttribute('data-label', label);
      }
    }

    // Stock slot (drop target / empty indicator)
    const sp = L.piles.stock;
    if (!this.slots.stock) {
      this.slots.stock = createPilePlaceholder({ width: L.cardW, height: L.cardH, x: sp.x, y: sp.y, kind: 'stock' });
      this.slots.stock.dataset.pile = 'stock';
      this.boardEl.append(this.slots.stock);
    } else {
      this.slots.stock.style.width = `${L.cardW}px`;
      this.slots.stock.style.height = `${L.cardH}px`;
      this.slots.stock.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
    }

    // ── 2. Walk every card in state; reuse by id. ──
    const seen = new Set();

    const place = (card, x, y, pile, indexInPile, faceUp, zBase) => {
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
      cv.el.style.zIndex = String(zBase + indexInPile);
    };

    // Tableau — compute per-column fans first so long piles shrink independently.
    const availableH = Math.max(100, (this.inner.getBoundingClientRect().height || 600) - L.piles.tableau[0].y - L.cardH - L.pad);
    s.tableau.forEach((pile, colIdx) => {
      const fit = fitFansToHeight(pile, availableH, L.cardH, L.fanOpen, L.fanClosed);
      this._colFans[colIdx] = fit;
      const origin = L.piles.tableau[colIdx];
      pile.forEach((c, i) => {
        const dy = tableauCardOffset(pile, i, fit.fanOpen, fit.fanClosed);
        place(c, origin.x, origin.y + dy, `t${colIdx}`, i, !!c.faceUp, 100);
      });
    });

    // Foundation — each trophy is the top card of its completed K→A run.
    // We only render the TOP card (the K) to keep the DOM light; the underlying
    // 12 cards live in state but aren't drawn.
    s.foundation.forEach((run, fIdx) => {
      const p = L.piles.foundation[fIdx];
      if (!run || run.length === 0) return;
      const topCard = run[0];  // K sits at the bottom of a K→A run; index 0 after our splice
      place(topCard, p.x, p.y, `f${fIdx}`, 0, true, 500 + fIdx * 2);
    });

    // Stock — render as up to 5 small stacked card-back piles, one per 10 remaining.
    // These are NOT real cards (no card.id in use) — they're lightweight indicator
    // divs so we can't accidentally drag them. Rendered via plain elements.
    const dealsRemaining = Math.floor(s.stock.length / 10);
    // Wipe & rebuild indicator stack (cheap — at most 5 elements).
    for (const old of this.stockPileEls) old.remove();
    this.stockPileEls = [];
    for (let i = 0; i < dealsRemaining; i++) {
      const x = sp.x + i * L.piles.stockStepX;
      const pileEl = document.createElement('div');
      pileEl.className = 'cosmic-card cosmic-spider-stock-pile face-down';
      pileEl.dataset.pile = 'stock';
      pileEl.dataset.stockIdx = String(i);
      pileEl.style.position = 'absolute';
      pileEl.style.left = '0';
      pileEl.style.top = '0';
      pileEl.style.transform = `translate(${x}px, ${sp.y}px)`;
      pileEl.style.width = `${L.cardW}px`;
      pileEl.style.height = `${L.cardH}px`;
      pileEl.style.zIndex = String(800 + i);
      // Minimal back-only card element, reusing the same back gradient classes.
      pileEl.innerHTML = '<div class="cosmic-card-inner"><div class="cosmic-card-face cosmic-card-back"></div></div>';
      this.boardEl.append(pileEl);
      this.stockPileEls.push(pileEl);
    }

    // Count badge on the frontmost (highest-zIndex) back — shows deals left.
    if (dealsRemaining > 0) {
      const frontmost = this.stockPileEls[dealsRemaining - 1];
      const badge = document.createElement('div');
      badge.className = 'cosmic-spider-stock-count';
      badge.textContent = String(dealsRemaining);
      frontmost.append(badge);
    }

    // Show/hide stock empty-slot indicator: visible only when no deals remain.
    this.slots.stock.style.opacity = dealsRemaining === 0 ? '1' : '0';

    // ── 3. Remove cards that no longer exist in state ──
    for (const [id, cv] of this.cards) {
      if (!seen.has(id)) {
        cv.el.remove();
        this.cards.delete(id);
      }
    }

    // Update board min-height using the widest/tallest column.
    let tallest = 0;
    for (let c = 0; c < 10; c++) {
      const fit = this._colFans[c] || { fanOpen: L.fanOpen, fanClosed: L.fanClosed };
      const pile = s.tableau[c];
      const h = tableauCardOffset(pile, pile.length, fit.fanOpen, fit.fanClosed);
      if (h > tallest) tallest = h;
    }
    this.boardEl.style.minHeight = `${L.piles.tableau[0].y + L.cardH + tallest + L.pad}px`;
  }

  // ── Animations ────────────────────────────────────────────────

  /**
   * Staggered deal-in: every initial tableau card slides from the stock origin
   * into its final position. Called once after a fresh deal.
   */
  playDealAnimation() {
    const s = this.state; const L = this.layout;
    if (!s || !L) return;
    const order = [];
    // Spider's deal order: 6/6/6/6/5/5/5/5/5/5 — walk row-major through whatever
    // faceDown cards sit at the bottom of each column.
    const maxLen = Math.max(...s.tableau.map((p) => p.length));
    for (let row = 0; row < maxLen; row++) {
      for (let col = 0; col < 10; col++) {
        const card = s.tableau[col][row];
        if (card) order.push({ card });
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
    void this.boardEl.offsetHeight;
    order.forEach(({ card }, i) => {
      const cv = this.cards.get(card.id);
      if (!cv) return;
      setTimeout(() => {
        cv.el.style.transition = '';
        cv.el.style.opacity = '1';
        const target = prev.get(card.id);
        if (target) cv.el.style.transform = target;
      }, i * 18);
    });
  }

  // ── Interaction ───────────────────────────────────────────────

  _findCardEl(t) { return t.closest?.('.cosmic-card'); }
  _findSlotEl(t) { return t.closest?.('.cosmic-pile-slot'); }

  _onClick(e) {
    // Stock pile indicator or empty-stock slot → DEAL.
    if (e.target.closest?.('.cosmic-spider-stock-pile')) {
      this.onIntent('stockClick', {});
      return;
    }
    const cardEl = this._findCardEl(e.target);
    if (cardEl) {
      const pile = cardEl.dataset.pile;
      const idx = +cardEl.dataset.index;
      this.onIntent('cardClick', { pile, index: idx });
      return;
    }
    const slotEl = this._findSlotEl(e.target);
    if (slotEl?.dataset.pile === 'stock') this.onIntent('stockClick', {});
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  mount(parent) { parent.append(this.root); }

  destroy() {
    try { this._ro.disconnect(); } catch {}
    try { this.drag?.destroy(); } catch {}
    this.boardEl.removeEventListener('click', this._onClick);
    for (const el of this.stockPileEls) el.remove();
    this.stockPileEls = [];
    this.cards.clear();
    this.root.remove();
  }
}
