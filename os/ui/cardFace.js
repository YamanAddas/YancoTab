// os/ui/cardFace.js — Cosmic Atelier card renderer.
// Pure view. Given a card shape { suit, rank, faceUp, id } and options, builds
// a DOM element. No game logic here — callers pass state, this renders.
//
// Paired with css/cosmic/card.css (ensure included from index.html).

import { el } from '../utils/dom.js';

// Default icon URL, resolved relative to THIS module so it works regardless
// of the consuming page's location (app root, concepts/, tests, etc.).
const DEFAULT_ICON_URL = new URL('../../assets/icons/icon-128.png', import.meta.url).href;

// The packaged icon-128.png has a solid white background (alpha=255 everywhere).
// On the deep-space card back that reads as a cheap white rectangle. We process
// it once per session: near-white pixels → alpha=0, preserving the colored
// logo + its anti-aliased edges. The result is cached by URL.
const iconCache = new Map(); // url → Promise<dataURL>

// Process the icon so its white backdrop becomes translucent (a soft glass
// frame behind the colored logo) and colored pixels stay solid. The colored
// logo pops; cosmic back glows through the white. Cached per URL.
function processIconAlpha(srcUrl, {
  whiteAlpha = 55,          // alpha (0–255) applied to near-white pixels (~22%)
  whiteThreshold = 235,     // pixels with min(r,g,b) ≥ this count as "white"
} = {}) {
  if (iconCache.has(srcUrl)) return iconCache.get(srcUrl);
  const p = (async () => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = srcUrl;
      await img.decode();
      const w = img.naturalWidth || 128;
      const h = img.naturalHeight || 128;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const minC = Math.min(r, g, b);
        if (minC >= whiteThreshold) {
          // near-pure white → translucent
          d[i + 3] = whiteAlpha;
        } else if (minC > 200) {
          // soft edge between white and color → blend alpha
          const t = (minC - 200) / (whiteThreshold - 200); // 0..1
          d[i + 3] = Math.round(255 * (1 - t) + whiteAlpha * t);
        }
      }
      ctx.putImageData(data, 0, 0);
      return c.toDataURL('image/png');
    } catch {
      return srcUrl;
    }
  })();
  iconCache.set(srcUrl, p);
  return p;
}

const SUIT_SYMBOL = { H: '♥', D: '♦', C: '♣', S: '♠' };
const RED_SUITS = new Set(['H', 'D']);

function rankLabel(rank) {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

function buildFront(card) {
  const red = RED_SUITS.has(card.suit);
  const front = el('div', { class: `cosmic-card-face cosmic-card-front ${red ? 'red' : 'black'}` });
  const r = rankLabel(card.rank);
  const s = SUIT_SYMBOL[card.suit] || '?';

  const tl = el('div', { class: 'cosmic-card-corner top-left' });
  tl.append(el('span', { class: 'rank' }, r), el('span', { class: 'suit' }, s));

  const center = el('div', { class: 'cosmic-card-center' });
  center.append(el('span', { class: 'suit-big' }, s));

  const br = el('div', { class: 'cosmic-card-corner bottom-right' });
  br.append(el('span', { class: 'rank' }, r), el('span', { class: 'suit' }, s));

  front.append(tl, center, br);
  return front;
}

// Back face: YancoTab icon, filling ~92% with small margin, aurora + teal glow.
// Icon URL defaults to the extension's packaged 128px icon. The icon's white
// background is knocked out client-side (see processIconAlpha).
function buildBack(iconUrl) {
  const back = el('div', { class: 'cosmic-card-face cosmic-card-back' });
  const wrap = el('div', { class: 'cb-icon' });
  const img = el('img', { src: iconUrl, alt: '', draggable: 'false' });
  img.addEventListener('dragstart', (e) => e.preventDefault());
  // Start transparent; swap to processed data URL when ready. If processing
  // fails, fall back to the raw URL so the card never renders blank.
  img.style.opacity = '0';
  processIconAlpha(iconUrl).then((processed) => {
    img.src = processed;
    img.style.opacity = '';
  }).catch(() => { img.style.opacity = ''; });
  wrap.append(img);
  back.append(wrap);
  return back;
}

/**
 * Build a cosmic card element.
 * @param {Object} card  { suit, rank, faceUp, id }
 * @param {Object} [opts]
 * @param {string} [opts.iconUrl]  path to the back-face icon (default: 'assets/icons/icon-128.png')
 * @param {number} [opts.width]    CSS px width override (defaults via --card-w)
 * @param {number} [opts.height]   CSS px height override
 * @returns {HTMLElement}
 */
export function buildCosmicCard(card, opts = {}) {
  const iconUrl = opts.iconUrl || DEFAULT_ICON_URL;
  const outer = el('div', {
    class: `cosmic-card ${card.faceUp ? 'flipped' : ''}`,
    'data-card-id': card.id || `${card.suit}${card.rank}`,
    'data-suit': card.suit,
  });
  if (opts.width) outer.style.setProperty('--card-w', `${opts.width}px`);
  if (opts.height) outer.style.setProperty('--card-h', `${opts.height}px`);

  // Back is the native (unrotated) face — visible when .flipped is absent.
  // Front is pre-rotated 180° in CSS; becomes visible when inner rotates 180°.
  const inner = el('div', { class: 'cosmic-card-inner' });
  inner.append(buildBack(iconUrl), buildFront(card));
  outer.append(inner);
  return outer;
}

/**
 * Update the faceUp state of an already-built card element. Triggers the flip.
 */
export function setCardFaceUp(cardEl, faceUp) {
  if (!cardEl) return;
  cardEl.classList.toggle('flipped', !!faceUp);
}
