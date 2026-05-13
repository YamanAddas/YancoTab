/**
 * tarneebFeltView.js — Oval-felt arena for the Table salon (Tarneeb).
 *
 * Replaces the legacy stacked .trix-screen DOM with the design's oval
 * green felt: hex-clipped compass avatars at N/E/S/W, a trump banner
 * top-right, the trick cards in the middle (rotated), a bid bar overlay
 * (during the BIDDING phase), and the user's hand as a bottom fan.
 *
 * Pure DOM builder — caller passes the Tarneeb app instance + current
 * store state. No event subscriptions, no closures over mutable state.
 *
 * Partnership map (south = the user):
 *   south  → 'you' (always at the bottom)
 *   north  → 'partner' (NS team)
 *   east   → 'opponent' (EW team)
 *   west   → 'opponent' (EW team)
 */
import { el } from '../../../utils/dom.js';
import {
  SEATS,
  SEAT_NAMES,
  SUIT_SYMBOLS,
  legalTrickPlays,
  partnerOf,
  cardKey,
} from './tarneebRules.js';
import { buildPlayerBlock } from '../table/avatars.js';
import { buildCardFace, buildTrumpBanner } from '../table/cardFace.js';

// Visual rotation of trick cards by seat position around the felt.
const TRICK_TILT = { north: -3, east: 8, south: 2, west: -10 };

// Per-card rotation in the bottom fan. Index → degrees + lift.
const FAN_TRANSFORMS = [
  { rot: -12, y: 8 },
  { rot:  -8, y: 2 },
  { rot:  -4, y: 0 },
  { rot:   0, y: 0 },
  { rot:   4, y: 0 },
  { rot:   8, y: 2 },
  { rot:  12, y: 8 },
];

function tapGuard(handler, { movePx = 12 } = {}) {
  let sx = 0;
  let sy = 0;
  let moved = false;
  return {
    onpointerdown(e) {
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch { /* best-effort */ }
    },
    onpointermove(e) {
      if (Math.abs(e.clientX - sx) > movePx || Math.abs(e.clientY - sy) > movePx) moved = true;
    },
    onpointerup(e) {
      try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch { /* best-effort */ }
      if (moved) return;
      try { e.preventDefault(); } catch { /* best-effort */ }
      handler(e);
    },
    onpointercancel(e) {
      try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch { /* best-effort */ }
    },
    onclick(e) {
      try { e.preventDefault(); } catch { /* best-effort */ }
      handler(e);
    },
  };
}

function suitInitial(seat) {
  const name = SEAT_NAMES[seat] || seat;
  return name.charAt(0).toUpperCase();
}

function bidPillFor(seat, state) {
  const phase = state.phase;
  const bid = state.bids?.[seat];
  const tricks = Number(state.tricksWon?.[seat] || 0);

  if (phase === 'BIDDING') {
    if (bid == null) return state.turn === seat ? 'thinking…' : 'bid —';
    if (bid === 0) return 'bid pass';
    return `bid ${bid}`;
  }
  if (phase === 'TRICK_PLAY' || phase === 'ROUND_END' || phase === 'GAME_END') {
    if (bid == null || bid === 0) return `won ${tricks}`;
    return `bid ${bid} · won ${tricks}`;
  }
  return '';
}

function metaFor(seat, state, isPartner, isYou) {
  const isTurn = state.turn === seat;
  const role = isYou ? 'YOU' : (isPartner ? 'PARTNER' : 'OPP');
  const turnSuffix = isTurn ? ' · TO PLAY' : '';
  if (isYou) return null; // south's meta is rendered as the small "SOUTH" pos label
  return `${seat.toUpperCase()} · ${role}${turnSuffix}`;
}

function roleFor(seat, you) {
  if (seat === you) return 'you';
  if (partnerOf(you) === seat) return 'partner';
  return 'opponent';
}

/**
 * Main entry. Returns the oval-felt DOM for the salon's center slot.
 */
export function buildTarneebFelt(app, state) {
  if (!state) return el('div', { class: 'table-felt-arena-wrap' });

  const arena = el('div', { class: 'table-felt-arena' });
  const you = 'south';

  // Trump banner — show the trump suit when revealed, else "TRUMP —"
  if (state.trumpSuit) {
    arena.appendChild(buildTrumpBanner(state.trumpSuit, 'TRUMP'));
  }

  // Compass players
  const winnerSeat = (app._trickHold && Date.now() < (app._trickHold.until || 0))
    ? app._trickHold.winner : null;

  for (const seat of SEATS) {
    const isYou = seat === you;
    const isPartner = partnerOf(you) === seat;
    const isTurn = state.turn === seat || winnerSeat === seat;
    arena.appendChild(buildPlayerBlock({
      pos: seat,
      name: SEAT_NAMES[seat] || seat,
      role: roleFor(seat, you),
      initial: suitInitial(seat),
      meta: metaFor(seat, state, isPartner, isYou),
      bid: bidPillFor(seat, state),
      bidStrong: isYou && state.phase !== 'SETUP' && (state.bids?.[you] || 0) > 0,
      isTurn,
    }));
  }

  // Trick area — rotated cards in the middle
  arena.appendChild(buildTrick(app, state));

  // Bid bar overlay (only during BIDDING when it's your turn)
  if (state.phase === 'BIDDING' && state.turn === 'south') {
    arena.appendChild(buildBidBar(app, state));
  }

  // Hand fan (always present once we're past SETUP)
  arena.appendChild(buildHandFan(app, state));

  // Status line at the bottom
  arena.appendChild(buildStatusLine(app, state));

  // Wrapper centers the arena inside the salon's felt slot
  return el('div', { class: 'table-felt-arena-wrap' }, [arena]);
}

function buildTrick(app, state) {
  const live = Array.isArray(state.trick) ? state.trick : [];
  const holdActive = app._trickHold && Date.now() < (app._trickHold.until || 0);
  const shown = live.length ? live : (holdActive ? (app._trickHold.trick || []) : []);

  const trick = el('div', { class: 'table-trick' });
  for (const seat of ['north', 'east', 'south', 'west']) {
    const entry = shown.find((x) => x.seat === seat);
    if (!entry?.card) continue;
    const card = buildCardFace(entry.card, {
      variant: 'trick',
      tilt: TRICK_TILT[seat] || 0,
      key: cardKey(entry.card),
      seat,
    });
    card.classList.add(`table-tcard-pos-${seat}`);
    trick.appendChild(card);
  }
  return trick;
}

function buildBidBar(app, state) {
  const wrap = el('div', { class: 'table-bid-bar' });
  wrap.appendChild(el('span', { class: 'table-bid-bar-lab' }, 'YOUR BID'));
  // 2..13 buttons (Tarneeb min bid = 2)
  for (let b = 2; b <= 13; b++) {
    const handler = () => app.dispatch({ type: 'PLACE_BID', seat: 'south', bid: b });
    const btn = el('button', {
      class: 'table-bid-btn',
      ...tapGuard(handler),
    }, String(b));
    wrap.appendChild(btn);
  }
  // Pass = 0 in the engine
  const passHandler = () => app.dispatch({ type: 'PLACE_BID', seat: 'south', bid: 0 });
  wrap.appendChild(el('button', {
    class: 'table-bid-pass',
    ...tapGuard(passHandler),
  }, 'PASS'));
  return wrap;
}

function buildHandFan(app, state) {
  const hand = state.hands?.south || [];
  const ledSuit = state.trick?.[0]?.card?.suit || null;
  const canPlay = (card) => {
    if (state.phase !== 'TRICK_PLAY' || state.turn !== 'south') return false;
    if (app._trickHold && Date.now() < (app._trickHold.until || 0)) return false;
    const legal = legalTrickPlays(hand, ledSuit);
    return legal.some((c) => c.suit === card.suit && c.rank === card.rank);
  };

  const fan = el('div', { class: 'table-your-hand' });
  hand.forEach((card, idx) => {
    const tx = FAN_TRANSFORMS[idx % FAN_TRANSFORMS.length];
    const legal = canPlay(card);
    const handler = () => {
      if (!legal) return;
      app.dispatch({ type: 'PLAY_CARD', seat: 'south', card });
    };
    const node = buildCardFace(card, {
      variant: 'hand',
      legal,
      key: cardKey(card),
      onClick: legal ? handler : null,
    });
    if (legal) {
      const guard = tapGuard(handler);
      Object.assign(node, {
        onpointerdown: guard.onpointerdown,
        onpointermove: guard.onpointermove,
        onpointerup: guard.onpointerup,
        onpointercancel: guard.onpointercancel,
      });
    }
    node.style.transform = `rotate(${tx.rot}deg) translateY(${tx.y}px)`;
    node.style.setProperty('--fan-rot', `${tx.rot}deg`);
    node.style.setProperty('--fan-y', `${tx.y}px`);
    fan.appendChild(node);
  });
  return fan;
}

function buildStatusLine(app, state) {
  const trumpGlyph = state.trumpSuit ? (SUIT_SYMBOLS[state.trumpSuit] || '?') : '—';
  const round = state.roundNumber || 1;
  let phaseLabel;
  if (state.phase === 'BIDDING') {
    phaseLabel = `bidding · ${SEAT_NAMES[state.turn] || state.turn || ''} to bid`;
  } else if (state.phase === 'TRICK_PLAY') {
    const trickNum = (state.completedTricks?.length || 0) + 1;
    phaseLabel = `trick ${trickNum} of 13 · ${SEAT_NAMES[state.turn] || state.turn || ''} to play`;
  } else if (state.phase === 'ROUND_END') {
    phaseLabel = 'round complete';
  } else if (state.phase === 'GAME_END') {
    phaseLabel = 'match over';
  } else {
    phaseLabel = '';
  }
  return el('div', { class: 'table-felt-status' }, [
    el('b', {}, `Round ${round}`),
    ' · ',
    `Trump ${trumpGlyph}`,
    phaseLabel ? ` · ${phaseLabel}` : '',
  ]);
}

/**
 * Build a small action row for the salon right rail (renderSidePanel slot)
 * with Reset / Rules / Score / Exit buttons.
 */
export function buildTarneebActions(app, state) {
  const btn = (label, onclick, danger = false) => el('button', {
    class: 'table-side-action' + (danger ? ' is-danger' : ''),
    onclick,
  }, label);
  return el('div', { class: 'table-side-actions' }, [
    el('h4', { class: 'table-side-h' }, 'Match'),
    el('div', { class: 'table-side-action-row' }, [
      btn('Score', () => { app._modal = 'scores'; app.render(app.store.getState()); }),
      btn('Rules', () => { app._modal = 'rules'; app.render(app.store.getState()); }),
    ]),
    el('div', { class: 'table-side-action-row' }, [
      btn('Reset', () => app.dispatch({ type: 'RESET_MATCH', difficulty: state?.difficulty || app._setupDiff }), true),
      btn('Exit', () => app.close()),
    ]),
  ]);
}
