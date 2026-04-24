// view/CardView.js — wraps the cosmic card renderer with positioning helpers.
// Positions cards absolutely inside a board container.

import { buildCosmicCard, setCardFaceUp } from '../../../../ui/cardFace.js';

/**
 * Build a positioned card element. Caller places it inside the board container.
 * Returns { el, update(x, y, faceUp) }.
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
    if (nx !== cur.x || ny !== cur.y) {
      el.style.transform = `translate(${nx}px, ${ny}px)`;
      cur = { x: nx, y: ny };
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
 * Build an empty-pile placeholder (thin outline showing where a pile sits when
 * it's empty — stock reset target, foundation targets, empty tableau columns).
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
