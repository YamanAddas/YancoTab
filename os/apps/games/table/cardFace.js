/**
 * cardFace.js — Stateless DOM card-face renderer for the Table salon.
 *
 * Used by TableShell for the trick area + your-hand fan. The legacy
 * `cardEngine/Card.js` builds a DOM card with internal state and a
 * `flip` method we don't need here — the salon always renders front
 * side, and never holds a reference past the next render. This builder
 * is pure: input → DOM, no mutation, no closures.
 *
 * Card-face palette is locked by the design package:
 *   • bone background  #f4f0ea → #d4cdc0 (warm parchment)
 *   • red suits        #c5152e
 *   • black suits      #0c0c0c
 *
 * These are NOT theme tokens — they're physical-card colors that stay
 * constant across light + dark themes, matching real playing cards.
 */
import { el } from '../../../utils/dom.js';

const SUIT_GLYPH = {
  spades:   '♠',
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);

function rankLabel(rank) {
  if (rank === 1)  return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

/**
 * Build one card face DOM.
 *
 * @param {object} card       { suit, rank }
 * @param {object} [opts]
 *   variant   'trick' | 'hand' | 'static' (size + box-shadow recipe via class)
 *   legal     boolean — adds .is-legal accent ring (hand cards)
 *   tilt      number  — degrees of rotation (used by trick layout)
 *   onClick   function (only attached if legal === true)
 *   key       string  — set as data-card-key for animation diffing
 *   seat      string  — set as data-seat for animation diffing
 */
export function buildCardFace(card, opts = {}) {
  if (!card || !card.suit) {
    return el('div', { class: 'table-card table-card-empty' });
  }
  const isRed = RED_SUITS.has(card.suit);
  const glyph = SUIT_GLYPH[card.suit] || '?';
  const rank = rankLabel(card.rank);

  const cls = ['table-card'];
  if (opts.variant) cls.push(`table-card-${opts.variant}`);
  if (isRed) cls.push('is-red');
  if (opts.legal) cls.push('is-legal');

  const props = { class: cls.join(' ') };
  if (opts.tilt) props.style = { transform: `rotate(${opts.tilt}deg)` };
  if (opts.key) props['data-card-key'] = opts.key;
  if (opts.seat) props['data-seat'] = opts.seat;

  if (typeof opts.onClick === 'function' && opts.legal) {
    props.onclick = opts.onClick;
    props.tabindex = '0';
    props.role = 'button';
    props['aria-label'] = `Play ${rank} of ${card.suit}`;
  }

  return el('div', props, [
    el('span', { class: 'table-card-r' }, rank),
    el('span', { class: 'table-card-s' }, glyph),
    el('span', { class: 'table-card-c' }, glyph),
  ]);
}

/**
 * Build the trump banner top-right of the felt arena.
 * @param {string} trumpSuit  'spades' | 'hearts' | ...
 * @param {string} [label]    Override 'TRUMP' (e.g. 'CONTRACT' for Trix)
 */
export function buildTrumpBanner(trumpSuit, label = 'TRUMP') {
  const glyph = SUIT_GLYPH[trumpSuit] || '?';
  const isRed = RED_SUITS.has(trumpSuit);
  return el('div', { class: 'table-trump-banner' }, [
    el('em', {}, label),
    el('span', {
      class: 'table-trump-suit' + (isRed ? ' is-red' : ''),
    }, glyph),
  ]);
}
