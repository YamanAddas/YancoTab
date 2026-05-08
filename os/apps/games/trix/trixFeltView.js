/**
 * trixFeltView.js — Oval-felt arena for the Table salon (Trix).
 *
 * Mirrors the Tarneeb felt structure (compass avatars, trick area in
 * the middle, hand fan at the bottom) but adapts for Trix's two play
 * modes:
 *   • TRICK_PLAY (king/queens/diamonds/ltoosh) — same trick layout
 *     as Tarneeb, with 4 cards rotated around the center
 *   • TRIX_LAYOUT_PLAY (the trix contract) — center shows 4 suit
 *     columns of laid-out card sequences (J in middle, low building
 *     down, high building up)
 *
 * Also handles:
 *   • Contract picker overlay (replaces the bid bar) when the
 *     kingdom owner is choosing a contract
 *   • Contract banner top-right instead of trump
 *   • "Pass" button for layout when no legal play is available
 */
import { el } from '../../../utils/dom.js';
import {
  SEATS,
  SEAT_NAMES,
  CONTRACTS,
  legalLayoutPlays,
  legalTrickPlays,
  partnerOf,
  cardKey,
} from './trixRules.js';
import { buildPlayerBlock } from '../table/avatars.js';
import { buildCardFace } from '../table/cardFace.js';

const TRICK_TILT = { north: -3, east: 8, south: 2, west: -10 };
const FAN_TRANSFORMS = [
  { rot: -12, y: 8 }, { rot: -10, y: 5 }, { rot: -8, y: 2 }, { rot: -5, y: 1 },
  { rot:  -3, y: 0 }, { rot:   0, y: 0 }, { rot:  3, y: 0 }, { rot:  5, y: 1 },
  { rot:   8, y: 2 }, { rot:  10, y: 5 }, { rot: 12, y: 8 }, { rot: 14, y: 12 },
  { rot:  16, y: 16 },
];
const SUIT_GLYPH = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const CONTRACT_META = {
  king:     { icon: '♚', label: 'KING' },
  queens:   { icon: '♛', label: 'QUEENS' },
  diamonds: { icon: '♦', label: 'DIAMONDS' },
  ltoosh:   { icon: '✚', label: 'LTOOSH' },
  trix:     { icon: '✦', label: 'TRIX' },
};

function tapGuard(handler, { movePx = 12 } = {}) {
  let sx = 0, sy = 0, moved = false;
  return {
    onpointerdown(e) { moved = false; sx = e.clientX; sy = e.clientY;
      try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch {} },
    onpointermove(e) { if (Math.abs(e.clientX - sx) > movePx || Math.abs(e.clientY - sy) > movePx) moved = true; },
    onpointerup(e) {
      try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {}
      if (moved) return; try { e.preventDefault(); } catch {} handler(e);
    },
    onpointercancel(e) { try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {} },
    onclick(e) { try { e.preventDefault(); } catch {} handler(e); },
  };
}

function rankLabel(rank) {
  if (rank === 1)  return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

function suitInitial(seat) {
  const name = SEAT_NAMES[seat] || seat;
  return name.charAt(0).toUpperCase();
}

function roleFor(seat, you, mode) {
  if (seat === you) return 'you';
  if (mode === 'partners' && partnerOf(you) === seat) return 'partner';
  return 'opponent';
}

function metaFor(seat, state, role) {
  if (role === 'you') return null;
  const isTurn = state.turn === seat;
  const isOwner = state.kingdomOwner === seat;
  const tag = isOwner ? 'OWNER' : (role === 'partner' ? 'PARTNER' : 'OPP');
  const turnSuffix = isTurn ? ' · TO PLAY' : '';
  return `${seat.toUpperCase()} · ${tag}${turnSuffix}`;
}

function takenCountFor(seat, state) {
  return Number(state.tricksTakenCount?.[seat] || 0);
}

function pillFor(seat, state) {
  if (state.phase === 'SETUP' || state.phase === 'KINGDOM_PICK_CONTRACT') return '';
  const score = Number(state.scores?.[seat] || 0);
  const sign = score === 0 ? '0' : (score > 0 ? `+${score}` : String(score));
  if (state.phase === 'TRIX_LAYOUT_PLAY') return `score ${sign}`;
  const taken = takenCountFor(seat, state);
  return `won ${taken} · ${sign}`;
}

/** Main entry. */
export function buildTrixFelt(app, state) {
  if (!state) return el('div', { class: 'table-felt-arena-wrap' });

  const arena = el('div', { class: 'table-felt-arena' });
  const you = 'south';
  const mode = state.mode || 'single';

  // Contract banner (replaces trump banner)
  arena.appendChild(buildContractBanner(state));

  // Compass players
  const winnerSeat = (app._trickHold && Date.now() < (app._trickHold.until || 0))
    ? app._trickHold.winner : null;

  for (const seat of SEATS) {
    const role = roleFor(seat, you, mode);
    const isTurn = state.turn === seat || winnerSeat === seat;
    arena.appendChild(buildPlayerBlock({
      pos: seat,
      name: SEAT_NAMES[seat] || seat,
      role,
      initial: suitInitial(seat),
      meta: metaFor(seat, state, role),
      bid: pillFor(seat, state),
      bidStrong: state.kingdomOwner === seat,
      isTurn,
    }));
  }

  // Center area: trick (default) or layout (during trix contract)
  if (state.phase === 'TRIX_LAYOUT_PLAY') {
    arena.appendChild(buildLayoutBoard(state));
  } else {
    arena.appendChild(buildTrick(app, state));
  }

  // Contract picker overlay (replaces bid bar) when south needs to pick
  if (state.phase === 'KINGDOM_PICK_CONTRACT' && state.kingdomOwner === 'south') {
    arena.appendChild(buildContractPicker(app, state));
  } else if (state.phase === 'KINGDOM_PICK_CONTRACT') {
    arena.appendChild(buildPickerWaiting(state));
  }

  // Hand fan
  arena.appendChild(buildHandFan(app, state));

  // Status line
  arena.appendChild(buildStatusLine(state));

  return el('div', { class: 'table-felt-arena-wrap' }, [arena]);
}

function buildContractBanner(state) {
  const c = state.currentContract;
  if (c) {
    const meta = CONTRACT_META[c.id] || { icon: '◇', label: c.name?.toUpperCase() || '?' };
    return el('div', { class: 'table-trump-banner table-contract-banner' }, [
      el('em', {}, 'CONTRACT'),
      el('span', { class: 'table-trump-suit' }, meta.icon),
      el('span', { class: 'table-contract-label' }, meta.label),
    ]);
  }
  // No contract picked yet — kingdom phase
  return el('div', { class: 'table-trump-banner table-contract-banner' }, [
    el('em', {}, 'KINGDOM'),
    el('span', { class: 'table-contract-label' }, `${state.kingdomNumber || 1}/4`),
  ]);
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

function buildLayoutBoard(state) {
  const wrap = el('div', { class: 'table-trix-layout' });
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
  for (const suit of suits) {
    wrap.appendChild(buildLayoutRow(suit, state.layoutBySuit?.[suit]));
  }
  return wrap;
}

/**
 * Render one suit row as actual card faces.
 *
 * Layout shape (J anchor, cards extend down-left and up-right):
 *
 *    [♠]   [2][3][4]…[10][J][Q][K][A]
 *
 * `st.low` is the lowest rank played (11 = only J, 2 = full down to 2).
 * `st.high` is the highest rank played (11 = only J, 12 = +Q, 13 = +Q+K,
 * 1 = +Q+K+A; 1 wraps to "above K" because Aces are high in this layout).
 *
 * Empty rows show "♠ J to start" so the player knows what's needed first.
 */
function buildLayoutRow(suit, st) {
  const row = el('div', { class: `table-trix-layout-row table-trix-layout-${suit}` });
  row.appendChild(el('span', { class: 'table-trix-layout-suit' }, SUIT_GLYPH[suit] || '?'));

  const started = !!(st && st.started);
  if (!started) {
    row.appendChild(el('span', { class: 'table-trix-layout-pip' }, 'J to start'));
    return row;
  }

  const ranks = [];
  // Down side: from low to J-1 (e.g. low=5 → 5,6,7,8,9,10).
  for (let r = st.low; r < 11; r++) ranks.push(r);
  ranks.push(11); // J anchor
  // Up side: J+1 (Q=12), J+2 (K=13), J+3 (A=1, wraparound).
  if (st.high === 12 || st.high === 13 || st.high === 1) ranks.push(12);
  if (st.high === 13 || st.high === 1) ranks.push(13);
  if (st.high === 1) ranks.push(1);

  const stack = el('div', { class: 'table-trix-layout-stack' });
  for (const rank of ranks) {
    const card = buildCardFace({ suit, rank }, {
      variant: 'layout',
      key: `${suit}:${rank}`,
    });
    if (rank === 11) card.classList.add('is-anchor');
    stack.appendChild(card);
  }
  row.appendChild(stack);
  return row;
}

function buildContractPicker(app, state) {
  const remaining = state.contractsRemaining?.south || [];
  const wrap = el('div', { class: 'table-bid-bar table-contract-picker' });
  wrap.appendChild(el('span', { class: 'table-bid-bar-lab' }, 'PICK CONTRACT'));
  for (const c of CONTRACTS) {
    if (!remaining.includes(c.id)) continue;
    const meta = CONTRACT_META[c.id] || { icon: '?', label: c.name };
    const handler = () => app.dispatch({ type: 'PICK_CONTRACT', seat: 'south', contractId: c.id });
    wrap.appendChild(el('button', {
      class: 'table-contract-btn',
      ...tapGuard(handler),
      title: c.name,
    }, `${meta.icon} ${meta.label}`));
  }
  return wrap;
}

function buildPickerWaiting(state) {
  const owner = state.kingdomOwner;
  const name = SEAT_NAMES[owner] || owner || '?';
  return el('div', { class: 'table-bid-bar table-picker-wait' }, [
    el('span', { class: 'table-bid-bar-lab' }, `${name} is picking…`),
  ]);
}

function buildHandFan(app, state) {
  const hand = state.hands?.south || [];
  if (!hand.length) return el('div', { class: 'table-your-hand' });

  const ledSuit = state.trick?.[0]?.card?.suit || null;
  const layoutLegal = state.phase === 'TRIX_LAYOUT_PLAY'
    ? new Set(legalLayoutPlays(hand, state.layoutBySuit).map((c) => cardKey(c)))
    : null;

  const canPlay = (card) => {
    if (app._trickHold && Date.now() < (app._trickHold.until || 0)) return false;
    if (state.phase === 'TRICK_PLAY' && state.turn === 'south') {
      const legal = legalTrickPlays(hand, ledSuit);
      return legal.some((c) => c.suit === card.suit && c.rank === card.rank);
    }
    if (state.phase === 'TRIX_LAYOUT_PLAY' && state.turn === 'south' && layoutLegal) {
      return layoutLegal.has(cardKey(card));
    }
    return false;
  };

  const fan = el('div', { class: 'table-your-hand' });
  hand.forEach((card, idx) => {
    const tx = FAN_TRANSFORMS[idx % FAN_TRANSFORMS.length];
    const legal = canPlay(card);
    const handler = () => {
      if (!legal) return;
      if (state.phase === 'TRICK_PLAY') app.dispatch({ type: 'PLAY_CARD', seat: 'south', card });
      else if (state.phase === 'TRIX_LAYOUT_PLAY') app.dispatch({ type: 'LAYOUT_PLAY', seat: 'south', card });
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
    fan.appendChild(node);
  });

  // Layout pass button (when no legal layout play)
  if (state.phase === 'TRIX_LAYOUT_PLAY' && state.turn === 'south' && layoutLegal && layoutLegal.size === 0) {
    const passBtn = el('button', {
      class: 'table-trix-pass',
      onclick: () => app.dispatch({ type: 'LAYOUT_PASS', seat: 'south' }),
    }, 'PASS');
    fan.appendChild(passBtn);
  }

  return fan;
}

function buildStatusLine(state) {
  const k = state.kingdomNumber || 1;
  const owner = SEAT_NAMES[state.kingdomOwner] || '—';
  let phaseLabel;
  if (state.phase === 'KINGDOM_PICK_CONTRACT') {
    phaseLabel = `${owner} picks contract`;
  } else if (state.phase === 'TRICK_PLAY') {
    const trickNum = (state.completedTricks?.length || 0) + 1;
    phaseLabel = `trick ${trickNum} of 13 · ${SEAT_NAMES[state.turn] || '?'} to play`;
  } else if (state.phase === 'TRIX_LAYOUT_PLAY') {
    phaseLabel = `layout · ${SEAT_NAMES[state.turn] || '?'} to play`;
  } else if (state.phase === 'DOUBLING_DECISION') {
    phaseLabel = 'doubling…';
  } else if (state.phase === 'GAME_END') {
    phaseLabel = 'match over';
  } else {
    phaseLabel = '';
  }
  const cName = state.currentContract?.name || '—';
  return el('div', { class: 'table-felt-status' }, [
    el('b', {}, `Kingdom ${k}/4`),
    ` · ${cName}`,
    phaseLabel ? ` · ${phaseLabel}` : '',
  ]);
}

/** Side-rail action row (Score / Rules / Reset / Exit). */
export function buildTrixActions(app, state) {
  const btn = (label, onclick, danger = false) => el('button', {
    class: 'table-side-action' + (danger ? ' is-danger' : ''),
    onclick,
  }, label);
  return el('div', { class: 'table-side-actions' }, [
    el('h4', { class: 'table-side-h' }, 'Match'),
    el('div', { class: 'table-side-action-row' }, [
      btn('Score', () => { app._modal = 'scoresheet'; app.render(app.store.getState()); }),
      btn('Rules', () => { app._modal = 'rules'; app.render(app.store.getState()); }),
    ]),
    el('div', { class: 'table-side-action-row' }, [
      btn('Reset', () => app.dispatch({
        type: 'START_MATCH',
        mode: state?.mode || app._setupMode,
        difficulty: state?.difficulty || app._setupDiff,
        ruleProfile: state?.ruleProfile || app._setupRules,
      }), true),
      btn('Exit', () => app.close()),
    ]),
  ]);
}
