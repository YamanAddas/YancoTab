// view/CardView.js — thin positioning wrapper around the shared cosmic card
// renderer. Spider reuses the same card DOM + CSS as Solitaire so both games
// look identical (tokens, backs, suit styles). No game logic here.

import { buildCosmicCard, setCardFaceUp } from '../../../../ui/cardFace.js';

/**
 * Build a positioned card element. Caller appends it into the board container.
 * Returns { el, update(x, y, faceUp), resize(w, h), card }.
 */
export function createCardView(card, { width, height, x, y, iconUrl }) {
  const el = buildCosmicCard(card, { width, height, iconUrl });
  el.style.position = 'absolute';
  el.style.left = '0';
  el.style.top = '0';
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.style.transition = 'transform 0.32s cubic-bezier(0.22, 1.20, 0.36, 1.00)';

  let cur = { x, y };

  const update = (nx, ny, faceUp) => {
    // Always keep `cur` current so external writers (e.g. the drag controller
    // directly mutating transform) can't strand the card at a stale position
    // when the next render asserts (nx === cur.x && ny === cur.y). The old
    // short-circuit was the root of the "cards go all over" bug: drag.js
    // wrote transform directly, cur stayed at pre-drag, and _render bailed.
    cur = { x: nx, y: ny };
    // While the card is actively being dragged we must NOT write transform —
    // the drag controller owns it for the lifetime of the pointer gesture.
    // On pointerup the controller snap-backs to the pre-drag base, then the
    // post-dispatch _render reaches here and commits the new resting place.
    if (!el.classList.contains('dragging')) {
      el.style.transform = `translate(${nx}px, ${ny}px)`;
    }
    if (faceUp !== undefined) setCardFaceUp(el, faceUp);
  };

  const resize = (w, h) => {
    el.style.setProperty('--card-w', `${w}px`);
    el.style.setProperty('--card-h', `${h}px`);
  };

  return { el, update, resize, get card() { return card; } };
}

/**
 * Build an empty-pile placeholder. Spider uses placeholders for:
 *   - empty tableau columns (label blank, but still a drop target)
 *   - the foundation "trophy" slot before any suit is completed (suit glyph)
 *   - the stock recycle target when the stock is empty (no label)
 */
export function createPilePlaceholder({ width, height, x, y, label = '', kind = 'empty' }) {
  const el = document.createElement('div');
  el.className = `cosmic-pile-slot kind-${kind}`;
  el.style.position = 'absolute';
  el.style.left = '0';
  el.style.top = '0';
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  if (label) el.setAttribute('data-label', label);
  return el;
}
