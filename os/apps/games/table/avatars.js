/**
 * avatars.js — Hex-clipped seat avatar renderer for the Table salon.
 *
 * The mock places players at four compass points around the felt; each
 * seat gets a colored hex-clip badge with the player's initial. The
 * `you` seat uses the design's blue-cyan ramp; opponents use violet;
 * partner uses warm amber. Turn glow comes from a sibling pseudo-class
 * driven by CSS in css/table.css — this module just emits the DOM.
 */
import { el } from '../../../utils/dom.js';

// Compass position → CSS class. Each position lays out via absolute
// positioning rules in the stylesheet.
export const SEAT_POSITIONS = ['north', 'east', 'south', 'west'];

// Per-seat color variant — keep in sync with .av.* rules in table.css.
// `partner` and `you` are derived from seat role at render time, NOT
// hard-coded position, so a Trix layout where there are no partners
// (single contracts) still renders cleanly.
const SEAT_VARIANT = {
  you: '',           // default blue-cyan ramp
  partner: 'partner', // warm amber
  opponent: 'violet', // violet
};

/**
 * Build one player block.
 *
 * @param {object} opts
 *   pos       'north' | 'east' | 'south' | 'west'  (where on the felt)
 *   name      'rashid' | 'you' (label under avatar)
 *   role      'you' | 'partner' | 'opponent'  (color variant)
 *   initial   single-character glyph for the avatar
 *   meta      uppercase position descriptor ('NORTH · OPP', 'TO PLAY')
 *   bid       optional bid pill text (e.g. 'bid 3', 'bid pass', 'bid —')
 *   bidStrong boolean — bid pill highlights as the winning bidder
 *   isTurn    boolean — adds .turn class for accent glow
 */
export function buildPlayerBlock(opts) {
  const {
    pos = 'south',
    name = '',
    role = 'opponent',
    initial = '?',
    meta = '',
    bid = '',
    bidStrong = false,
    isTurn = false,
  } = opts;

  const variant = SEAT_VARIANT[role] || '';
  const cls = ['table-player', `table-player-${pos}`];
  if (role === 'you') cls.push('table-player-you');
  if (role === 'partner') cls.push('table-player-partner');
  if (isTurn) cls.push('table-player-turn');

  const av = el('div', {
    class: 'table-player-av' + (variant ? ` table-player-av-${variant}` : ''),
  }, initial);

  const metaEl = meta ? el('span', { class: 'table-player-pos' }, meta) : null;
  const nameEl = el('div', { class: 'table-player-name' }, name);
  const bidEl = bid
    ? el('div', { class: 'table-player-bid' + (bidStrong ? ' is-strong' : '') }, bid)
    : null;

  // The south seat (you) lays children left-to-right per the mock.
  // Other seats stack vertically. The order of children differs slightly
  // for south so the bid pill sits to the right of the avatar.
  const children = pos === 'south'
    ? [bidEl, av, nameEl, metaEl].filter(Boolean)
    : [metaEl, av, nameEl, bidEl].filter(Boolean);

  return el('div', { class: cls.join(' ') }, children);
}

/**
 * Convenience: build all four seat blocks from a config map.
 * Caller passes `{ north: {...}, east: {...}, south: {...}, west: {...} }`.
 */
export function buildSeats(seatMap) {
  return SEAT_POSITIONS.map((pos) => {
    const opts = seatMap[pos];
    if (!opts) return null;
    return buildPlayerBlock({ ...opts, pos });
  }).filter(Boolean);
}
