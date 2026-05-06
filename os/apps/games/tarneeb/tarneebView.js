/**
 * tarneebView.js — extracted DOM-building panels for TarneebApp.
 * Each function takes the app instance (+ state where needed) so it can
 * call helper methods like app._playerName(), app.dispatch(), etc.
 */
import { el } from '../../../utils/dom.js';
import {
  SEATS,
  SEAT_NAMES,
  SUIT_SYMBOLS,
  computeTeamTotals,
  legalTrickPlays,
} from './tarneebRules.js';

function tapGuard(handler, { movePx = 12 } = {}) {
  let sx = 0;
  let sy = 0;
  let moved = false;
  return {
    onpointerdown(e) {
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch {}
    },
    onpointermove(e) {
      if (Math.abs(e.clientX - sx) > movePx || Math.abs(e.clientY - sy) > movePx) moved = true;
    },
    onpointerup(e) {
      try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {}
      if (moved) return;
      try { e.preventDefault(); } catch {}
      handler(e);
    },
    onpointercancel(e) {
      try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {}
    },
    onclick(e) {
      try { e.preventDefault(); } catch {}
      handler(e);
    },
  };
}

/* ── Setup / difficulty picker ── */

export function buildSetupScreen(app) {
  const db = (d, label) => el('button', {
    class: 'trix-setup-btn tar-setup-btn' + (app._setupDiff === d ? ' is-active' : ''),
    onclick: () => { app._setupDiff = d; app._savePrefs(); app.render(app.store.getState()); },
  }, label);

  return el('div', { class: 'trix-setup tar-setup' }, [
    el('div', { class: 'trix-setup-title tar-setup-title' }, '♠ TARNEEB'),
    el('div', { class: 'tar-setup-sub' }, 'Syrian 41 • Us vs Them • 1 Human + 3 Bots'),
    el('div', { class: 'trix-setup-section tar-setup-section' }, [
      el('div', { class: 'trix-setup-label tar-setup-label' }, 'Difficulty'),
      el('div', { class: 'trix-setup-row tar-setup-row' }, [
        db('easy', '🟢 Easy'),
        db('moderate', '🟡 Moderate'),
        db('hard', '🔴 Hard'),
      ]),
    ]),
    el('div', { class: 'tar-setup-rules' }, [
      el('div', { class: 'tar-setup-rule' }, '• Each player bids once (2-13).'),
      el('div', { class: 'tar-setup-rule' }, '• If total bids are below 11, cards are redealt.'),
      el('div', { class: 'tar-setup-rule' }, '• Trump is the same-color opposite suit of dealer last card.'),
    ]),
    el('div', { class: 'trix-setup-actions tar-setup-actions' }, [
      el('button', {
        class: 'trix-setup-start tar-setup-start',
        onclick: () => app.dispatch({ type: 'START_MATCH', difficulty: app._setupDiff }),
      }, '▶ Start Game'),
      el('button', { class: 'trix-action-btn tar-action-btn', onclick: () => app.close() }, 'Exit'),
    ]),
  ]);
}

/* ── Round summary (end-of-round) ── */

export function buildRoundSummary(app, state) {
  const s = state.roundSummary;
  if (!s) return el('div', { class: 'tar-round-summary' }, 'Round complete');

  const playerRows = SEATS.map((seat) => {
    const d = s.playerDeltas?.[seat] || 0;
    const sign = d > 0 ? `+${d}` : `${d}`;
    const cls = d > 0 ? ' is-pos' : (d < 0 ? ' is-neg' : '');
    return el('div', { class: 'tar-round-row' + cls }, [
      el('span', {}, app._playerName(seat)),
      el('span', {}, `Bid ${s.bids?.[seat] ?? 0}`),
      el('span', {}, `Tricks ${s.tricksWon?.[seat] ?? 0}`),
      el('span', {}, sign),
    ]);
  });

  return el('div', { class: 'tar-round-summary' }, [
    el('div', { class: 'tar-round-title' }, `Round ${s.roundNumber} Summary`),
    el('div', { class: 'tar-round-sub' }, `Trump ${app._suitSymbol(s.trumpSuit)} from ${app._rankLabel(s.revealedLastCard?.rank)}${app._suitSymbol(s.revealedLastCard?.suit)} (${app._playerName(s.dealer)} last card)`),
    el('div', { class: 'tar-round-list' }, playerRows),
    el('div', { class: 'tar-round-team' }, `Team adjustment this round — Us:+${s.teamBonusDeltas?.NS || 0} | Them:+${s.teamBonusDeltas?.EW || 0}`),
    el('button', { class: 'tar-next-round', onclick: () => app.dispatch({ type: 'NEXT_ROUND' }) }, 'Next Round'),
  ]);
}

/* ── Game-end panel ── */

export function buildGameEnd(app, state) {
  const teamTotals = computeTeamTotals(state.scores, state.teamBonus);
  const winner = state.winnerTeam || '—';

  return el('div', { class: 'tar-game-end' }, [
    el('div', { class: 'tar-game-end-title' }, `🏆 ${winner} wins`),
    el('div', { class: 'tar-game-end-line' }, `Us total: ${teamTotals.NS}  •  Them total: ${teamTotals.EW}`),
    el('div', { class: 'tar-game-end-line' }, `Winning rule: one member reached 41 with partner above 0.`),
    state.roundSummary ? el('div', { class: 'tar-game-end-line' }, `Final round: ${state.roundSummary.roundNumber}`) : null,
    el('button', {
      class: 'trix-setup-start tar-setup-start',
      onclick: () => app.dispatch({ type: 'RESET_MATCH', difficulty: state.difficulty || app._setupDiff }),
    }, 'New Game'),
  ]);
}

/* ── Scores / round-log modal ── */

export function buildScoresModal(app, state) {
  if (app._modal !== 'scores') return null;
  const close = () => { app._modal = null; app.render(app.store.getState()); };

  const head = el('div', { class: 'trix-modal-head tar-modal-head' }, [
    el('div', { class: 'trix-modal-title2 tar-modal-title' }, 'Round Log'),
    el('button', { class: 'trix-modal-x tar-modal-x', onclick: close }, '✕'),
  ]);

  const rows = [];
  const log = state.roundLog || [];
  if (!log.length) {
    rows.push(el('div', { class: 'tar-log-empty' }, 'No completed rounds yet.'));
  } else {
    for (let i = log.length - 1; i >= 0; i--) {
      const r = log[i];
      rows.push(el('div', { class: 'tar-log-row' }, [
        el('div', { class: 'tar-log-title' }, `Round ${r.roundNumber} • Trump ${app._suitSymbol(r.trumpSuit)}`),
        el('div', { class: 'tar-log-line' }, `Bids: You ${r.bids.south}, East ${r.bids.east}, North ${r.bids.north}, West ${r.bids.west}`),
        el('div', { class: 'tar-log-line' }, `Tricks: You ${r.tricksWon.south}, East ${r.tricksWon.east}, North ${r.tricksWon.north}, West ${r.tricksWon.west}`),
        el('div', { class: 'tar-log-line' }, `Deltas: You ${r.playerDeltas.south >= 0 ? '+' : ''}${r.playerDeltas.south}, East ${r.playerDeltas.east >= 0 ? '+' : ''}${r.playerDeltas.east}, North ${r.playerDeltas.north >= 0 ? '+' : ''}${r.playerDeltas.north}, West ${r.playerDeltas.west >= 0 ? '+' : ''}${r.playerDeltas.west}`),
        el('div', { class: 'tar-log-line' }, `Team adjustment: Us +${r.teamBonusDeltas.NS || 0}, Them +${r.teamBonusDeltas.EW || 0}`),
      ]));
    }
  }

  return el('div', {
    class: 'trix-modal tar-modal',
    onclick: (e) => { if (e.target?.classList?.contains('tar-modal')) close(); },
  }, [
    el('div', { class: 'trix-modal-panel tar-modal-panel' }, [
      head,
      ...rows,
    ]),
  ]);
}

/* ── Rules help modal ── */

export function buildRulesModal(app) {
  if (app._modal !== 'rules') return null;
  const close = () => { app._modal = null; app.render(app.store.getState()); };
  const lines = [
    'Deal 13 cards each. Reveal dealer last card.',
    'Trump is same-color opposite suit (♣↔♠, ♦↔♥).',
    'Each player bids once, from 2 to 13.',
    'If total bids are less than 11, redeal.',
    'Must follow suit if possible; otherwise play any card.',
    'Trump beats non-trump; highest relevant rank wins trick.',
    'Round scoring: make bid => +bid only; fail => -bid.',
    'Failed bid points are also added to the opposing team adjustment.',
    'Team wins when one member reaches 41 and partner is above 0.',
  ];

  return el('div', {
    class: 'trix-modal tar-modal',
    onclick: (e) => { if (e.target?.classList?.contains('tar-modal')) close(); },
  }, [
    el('div', { class: 'trix-modal-panel tar-modal-panel' }, [
      el('div', { class: 'trix-modal-head tar-modal-head' }, [
        el('div', { class: 'trix-modal-title2 tar-modal-title' }, 'Syrian 41 Rules'),
        el('button', { class: 'trix-modal-x tar-modal-x', onclick: close }, '✕'),
      ]),
      el('ul', { class: 'tar-rules-list' }, lines.map((line) => el('li', {}, line))),
    ]),
  ]);
}

/* ── HUD bar ── */

export function buildHud(app, state) {
  const dealer = state.dealer ? app._playerName(state.dealer) : '—';
  const bidTurn = state.phase === 'BIDDING' ? app._playerName(state.turn) : null;
  const trickTurn = state.phase === 'TRICK_PLAY' ? app._playerName(state.turn) : null;
  const status = bidTurn ? `Bid turn: ${bidTurn}` : (trickTurn ? `Turn: ${trickTurn}` : '');

  const row1 = [
    el('div', { class: 'trix-chip tar-chip is-strong' }, `Round ${state.roundNumber || 0}`),
    el('div', { class: 'trix-chip tar-chip' }, `Dealer: ${dealer}`),
    el('div', { class: 'trix-chip tar-chip' }, app._difficultyIcon(state.difficulty || app._setupDiff)),
    el('div', { class: 'trix-chip tar-chip is-team' }, '👥 Us vs Them'),
  ];

  const reveal = state.revealedLastCard
    ? `Reveal: ${app._rankLabel(state.revealedLastCard.rank)}${app._suitSymbol(state.revealedLastCard.suit)} → Trump ${app._suitSymbol(state.trumpSuit)}`
    : 'Reveal pending';

  const row2 = [
    el('div', { class: 'trix-chip tar-chip tar-chip-wide' }, reveal),
    status ? el('div', { class: 'trix-chip tar-chip' }, status) : null,
    app._statusText ? el('div', { class: 'trix-chip tar-chip tar-chip-status' }, app._statusText) : null,
  ].filter(Boolean);

  const actions = el('div', { class: 'trix-actions tar-actions' }, [
    el('button', {
      class: 'trix-action-btn tar-action-btn',
      onclick: () => { app._modal = 'scores'; app.render(app.store.getState()); },
    }, 'Score'),
    el('button', {
      class: 'trix-action-btn tar-action-btn',
      onclick: () => { app._modal = 'rules'; app.render(app.store.getState()); },
    }, 'Rules'),
    el('button', { class: 'trix-action-btn tar-action-btn', onclick: () => app.close() }, 'Exit'),
    el('button', {
      class: 'trix-action-btn tar-action-btn is-danger',
      onclick: () => app.dispatch({ type: 'RESET_MATCH', difficulty: state.difficulty || app._setupDiff }),
    }, 'Reset'),
  ]);

  return el('div', { class: 'trix-hud tar-hud' }, [
    el('div', { class: 'trix-hud-row tar-hud-row' }, row1),
    el('div', { class: 'trix-hud-row tar-hud-row' }, row2),
    actions,
  ]);
}

/* ── Score strip ── */

export function buildScoreStrip(app, state) {
  const teamTotals = computeTeamTotals(state.scores, state.teamBonus);
  const me = 'south';
  const meBid = state.bids?.[me];
  const meTricks = state.tricksWon?.[me] ?? 0;
  const meScore = state.scores?.[me] ?? 0;
  const totalBid = state.bidTotal || 0;
  const info = state.phase === 'BIDDING' ? `Bid total: ${totalBid} / 11 minimum` : null;

  const subRow = [
    el('div', { class: 'trix-chip tar-score-chip' }, `You: S ${meScore} • B ${meBid ?? '—'} • T ${meTricks}`),
  ];
  if (info) {
    subRow.push(el('div', { class: 'trix-chip tar-score-chip tar-score-chip-info' }, info));
  }

  return el('div', { class: 'trix-scorestrip tar-scorestrip' }, [
    el('div', { class: 'tar-score-mainrow' }, [
      el('div', { class: 'trix-scoreitem tar-teamchip is-you' }, `Us: ${teamTotals.NS}`),
      el('div', { class: 'trix-scoreitem tar-teamchip' }, `Them: ${teamTotals.EW}`),
    ]),
    el('div', { class: 'tar-score-subrow' }, subRow),
  ]);
}

/* ── Bidding panel ── */

export function buildBiddingPanel(app, state) {
  const row = (seat) => {
    const v = state.bids?.[seat];
    return el('div', { class: 'tar-bid-cell' + (state.turn === seat ? ' is-turn' : '') }, [
      el('span', { class: 'tar-bid-name' }, app._playerName(seat)),
      el('span', { class: 'tar-bid-value' }, v == null ? '—' : String(v)),
    ]);
  };

  const body = [
    el('div', { class: 'tar-bid-grid' }, state.bidOrder.map(row)),
    el('div', { class: 'tar-bid-total' }, `Total bids: ${state.bidTotal} / 11 minimum`),
  ];

  if (state.phase === 'BIDDING' && state.turn === 'south') {
    const buttons = [];
    for (let b = 2; b <= 13; b++) {
      const props = tapGuard(() => app.dispatch({ type: 'PLACE_BID', seat: 'south', bid: b }));
      buttons.push(el('button', { class: 'tar-bid-btn', ...props }, String(b)));
    }
    body.push(el('div', { class: 'tar-bid-actions' }, buttons));
  } else if (state.phase === 'BIDDING') {
    body.push(el('div', { class: 'tar-bid-wait' }, `${app._playerName(state.turn)} is thinking...`));
  }

  return el('div', { class: 'tar-bidding trix-contract-bar' }, [
    el('div', { class: 'tar-bidding-title' }, 'Bidding (One Bid Per Player)'),
    ...body,
  ]);
}

/* ── Center table (trick area) ── */

export function buildCenterTable(app, state) {
  const area = el('div', { class: 'trix-table tar-table' });

  if (state.phase === 'ROUND_END') {
    area.appendChild(buildRoundSummary(app, state));
    return area;
  }
  if (state.phase === 'GAME_END') {
    area.appendChild(buildGameEnd(app, state));
    return area;
  }

  const live = Array.isArray(state.trick) ? state.trick : [];
  const holdActive = app._trickHold && Date.now() < (app._trickHold.until || 0);
  const shown = live.length ? live : (holdActive ? (app._trickHold.trick || []) : []);
  const winnerSeat = holdActive ? app._trickHold.winner : null;

  const slots = ['north', 'east', 'south', 'west'].map((seat) => {
    const e = shown.find((x) => x.seat === seat);
    return el('div', { class: `trix-slot trix-slot-${seat} tar-slot tar-slot-${seat}` }, [
      el('div', {
        class: 'trix-seat-banner tar-seat-banner' + (state.turn === seat && state.phase === 'TRICK_PLAY' ? ' is-turn' : '') + (winnerSeat === seat ? ' is-winner' : ''),
      }, app._playerName(seat)),
      el('div', { class: 'trix-slot-card tar-slot-card' }, [
        e ? app._renderCardStatic(e.card, { seat, zone: 'trick' }) : el('div', { class: 'trix-slot-empty tar-slot-empty' }, ''),
      ]),
    ]);
  });

  area.appendChild(el('div', { class: 'trix-trick-grid tar-trick-grid' }, slots));
  return area;
}

/* ── Player hand ── */

export function buildHandView(app, state) {
  const hand = state.hands?.south || [];
  const ledSuit = state.trick?.[0]?.card?.suit || null;

  const canPlay = (card) => {
    if (state.phase !== 'TRICK_PLAY' || state.turn !== 'south') return false;
    if (app._trickHold && Date.now() < (app._trickHold.until || 0)) return false;
    const legal = legalTrickPlays(hand, ledSuit);
    return legal.some((c) => c.suit === card.suit && c.rank === card.rank);
  };

  const cardBtn = (card) => {
    const enabled = canPlay(card);
    const props = tapGuard(() => {
      if (!enabled) return;
      app.dispatch({ type: 'PLAY_CARD', seat: 'south', card });
    });
    return el('button', {
      class: 'trix-hand-card tar-hand-card' + (enabled ? '' : ' is-disabled'),
      disabled: !enabled,
      ...props,
    }, [app._renderCardStatic(card)]);
  };

  return el('div', { class: 'trix-hand tar-hand' }, [
    el('div', { class: 'trix-hand-title tar-hand-title' }, 'Your Hand'),
    el('div', { class: 'trix-hand-row tar-hand-row' }, hand.map(cardBtn)),
  ]);
}
