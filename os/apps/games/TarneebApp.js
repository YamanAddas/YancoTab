import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';
import { Card } from './cardEngine/Card.js';
import { createStore } from './shared/store.js';
import { tarneebReducer } from './tarneeb/tarneebReducer.js';
import { initTarneebMatch } from './tarneeb/tarneebState.js';
import { chooseBid, chooseMove } from './tarneeb/tarneebAI.js';
import {
  SEATS,
  SEAT_NAMES,
  SUIT_SYMBOLS,
  cardKey,
  computeTeamTotals,
  legalTrickPlays,
  partnerOf,
  teamOf,
} from './tarneeb/tarneebRules.js';

function css(href) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  return l;
}

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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export class TarneebApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { id: 'tarneeb', name: 'Tarneeb', icon: 'game:tarneeb' };
    this._styleLinks = [];
    this._unsub = null;
    this._botTimer = null;
    this._statusText = '';
    this._statusTimer = null;
    this._modal = null;
    this._vhCleanup = null;
    this._trickHold = { trick: null, winner: null, until: 0 };
    this._anim = null;
    this._animTimer = null;
    this._layoutFrame = null;
    this._setupDiff = 'moderate';
  }

  async init() {
    this._styleLinks = [css('css/cards.css'), css('css/trix.css'), css('css/tarneeb.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this.root = el('div', { class: 'app-window trix-remake tarneeb-remake' });
    const setVh = () => this.root.style.setProperty('--app-vh', `${(window.innerHeight || 0) * 0.01}px`);
    setVh();
    const onResize = () => {
      setVh();
      this._scheduleLayoutFit(this.store?.getState?.());
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    window.visualViewport?.addEventListener?.('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener?.('scroll', onResize, { passive: true });
    this._vhCleanup = () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener?.('resize', onResize);
      window.visualViewport?.removeEventListener?.('scroll', onResize);
    };

    this.store = createStore(tarneebReducer, initTarneebMatch());
    this._prevState = this.store.getState();
    this._unsub = this.store.subscribe((state, events = []) => {
      this._handleEvents(events, this._prevState, state);
      this.render(state);
      this._maybeBotMove(state);
      this._prevState = state;
    });

    this.render(this.store.getState());
  }

  destroy() {
    try { this._unsub?.(); } catch {}
    try { this._vhCleanup?.(); } catch {}
    if (this._botTimer) { clearTimeout(this._botTimer); this._botTimer = null; }
    if (this._statusTimer) { clearTimeout(this._statusTimer); this._statusTimer = null; }
    if (this._animTimer) { clearTimeout(this._animTimer); this._animTimer = null; }
    if (this._layoutFrame) { cancelAnimationFrame(this._layoutFrame); this._layoutFrame = null; }
    this._vhCleanup = null;
    for (const l of this._styleLinks) { try { l.remove(); } catch {} }
    this._styleLinks = [];
    super.destroy();
  }

  dispatch(action) {
    try { return this.store.dispatch(action); } catch (e) { console.error(e); }
    return null;
  }

  _playerName(seat) { return SEAT_NAMES[seat] || seat; }
  _suitSymbol(suit) { return SUIT_SYMBOLS[suit] || '🃏'; }
  _rankLabel(rank) {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return String(rank);
  }

  _difficultyIcon(diff) {
    if (diff === 'easy') return '🟢';
    if (diff === 'hard') return '🔴';
    return '🟡';
  }

  _setupScreen() {
    const db = (d, label) => el('button', {
      class: 'trix-setup-btn tar-setup-btn' + (this._setupDiff === d ? ' is-active' : ''),
      onclick: () => { this._setupDiff = d; this.render(this.store.getState()); },
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
          onclick: () => this.dispatch({ type: 'START_MATCH', difficulty: this._setupDiff }),
        }, '▶ Start Game'),
        el('button', { class: 'trix-action-btn tar-action-btn', onclick: () => this.close() }, 'Exit'),
      ]),
    ]);
  }

  _hud(state) {
    const dealer = state.dealer ? this._playerName(state.dealer) : '—';
    const bidTurn = state.phase === 'BIDDING' ? this._playerName(state.turn) : null;
    const trickTurn = state.phase === 'TRICK_PLAY' ? this._playerName(state.turn) : null;
    const status = bidTurn ? `Bid turn: ${bidTurn}` : (trickTurn ? `Turn: ${trickTurn}` : '');

    const row1 = [
      el('div', { class: 'trix-chip tar-chip is-strong' }, `Round ${state.roundNumber || 0}`),
      el('div', { class: 'trix-chip tar-chip' }, `Dealer: ${dealer}`),
      el('div', { class: 'trix-chip tar-chip' }, this._difficultyIcon(state.difficulty || this._setupDiff)),
      el('div', { class: 'trix-chip tar-chip is-team' }, '👥 Us vs Them'),
    ];

    const reveal = state.revealedLastCard
      ? `Reveal: ${this._rankLabel(state.revealedLastCard.rank)}${this._suitSymbol(state.revealedLastCard.suit)} → Trump ${this._suitSymbol(state.trumpSuit)}`
      : 'Reveal pending';

    const row2 = [
      el('div', { class: 'trix-chip tar-chip tar-chip-wide' }, reveal),
      status ? el('div', { class: 'trix-chip tar-chip' }, status) : null,
      this._statusText ? el('div', { class: 'trix-chip tar-chip tar-chip-status' }, this._statusText) : null,
    ].filter(Boolean);

    const actions = el('div', { class: 'trix-actions tar-actions' }, [
      el('button', {
        class: 'trix-action-btn tar-action-btn',
        onclick: () => { this._modal = 'scores'; this.render(this.store.getState()); },
      }, 'Score'),
      el('button', {
        class: 'trix-action-btn tar-action-btn',
        onclick: () => { this._modal = 'rules'; this.render(this.store.getState()); },
      }, 'Rules'),
      el('button', { class: 'trix-action-btn tar-action-btn', onclick: () => this.close() }, 'Exit'),
      el('button', {
        class: 'trix-action-btn tar-action-btn is-danger',
        onclick: () => this.dispatch({ type: 'RESET_MATCH', difficulty: state.difficulty || this._setupDiff }),
      }, 'Reset'),
    ]);

    return el('div', { class: 'trix-hud tar-hud' }, [
      el('div', { class: 'trix-hud-row tar-hud-row' }, row1),
      el('div', { class: 'trix-hud-row tar-hud-row' }, row2),
      actions,
    ]);
  }

  _scoreStrip(state) {
    const teamTotals = computeTeamTotals(state.scores, state.teamBonus);
    const me = 'south';
    const meBid = state.bids?.[me];
    const meTricks = state.tricksWon?.[me] ?? 0;
    const meScore = state.scores?.[me] ?? 0;
    const totalBid = state.bidTotal || 0;
    const info = state.phase === 'BIDDING'
      ? `Bid total: ${totalBid} / 11 minimum`
      : null;

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

  _biddingPanel(state) {
    const row = (seat) => {
      const v = state.bids?.[seat];
      return el('div', { class: 'tar-bid-cell' + (state.turn === seat ? ' is-turn' : '') }, [
        el('span', { class: 'tar-bid-name' }, this._playerName(seat)),
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
        const props = tapGuard(() => this.dispatch({ type: 'PLACE_BID', seat: 'south', bid: b }));
        buttons.push(el('button', { class: 'tar-bid-btn', ...props }, String(b)));
      }
      body.push(el('div', { class: 'tar-bid-actions' }, buttons));
    } else if (state.phase === 'BIDDING') {
      body.push(el('div', { class: 'tar-bid-wait' }, `${this._playerName(state.turn)} is thinking...`));
    }

    return el('div', { class: 'tar-bidding trix-contract-bar' }, [
      el('div', { class: 'tar-bidding-title' }, 'Bidding (One Bid Per Player)'),
      ...body,
    ]);
  }

  _centerTable(state) {
    const area = el('div', { class: 'trix-table tar-table' });

    if (state.phase === 'ROUND_END') {
      area.appendChild(this._roundSummaryPanel(state));
      return area;
    }
    if (state.phase === 'GAME_END') {
      area.appendChild(this._gameEndPanel(state));
      return area;
    }

    const live = Array.isArray(state.trick) ? state.trick : [];
    const holdActive = this._trickHold && Date.now() < (this._trickHold.until || 0);
    const shown = live.length ? live : (holdActive ? (this._trickHold.trick || []) : []);
    const winnerSeat = holdActive ? this._trickHold.winner : null;

    const slots = ['north', 'east', 'south', 'west'].map((seat) => {
      const e = shown.find((x) => x.seat === seat);
      return el('div', { class: `trix-slot trix-slot-${seat} tar-slot tar-slot-${seat}` }, [
        el('div', {
          class: 'trix-seat-banner tar-seat-banner' + (state.turn === seat && state.phase === 'TRICK_PLAY' ? ' is-turn' : '') + (winnerSeat === seat ? ' is-winner' : ''),
        }, this._playerName(seat)),
        el('div', { class: 'trix-slot-card tar-slot-card' }, [
          e ? this._renderCardStatic(e.card, { seat, zone: 'trick' }) : el('div', { class: 'trix-slot-empty tar-slot-empty' }, ''),
        ]),
      ]);
    });

    area.appendChild(el('div', { class: 'trix-trick-grid tar-trick-grid' }, slots));
    return area;
  }

  _handView(state) {
    const hand = state.hands?.south || [];
    const ledSuit = state.trick?.[0]?.card?.suit || null;

    const canPlay = (card) => {
      if (state.phase !== 'TRICK_PLAY' || state.turn !== 'south') return false;
      if (this._trickHold && Date.now() < (this._trickHold.until || 0)) return false;
      const legal = legalTrickPlays(hand, ledSuit);
      return legal.some((c) => c.suit === card.suit && c.rank === card.rank);
    };

    const cardBtn = (card) => {
      const enabled = canPlay(card);
      const props = tapGuard(() => {
        if (!enabled) return;
        this.dispatch({ type: 'PLAY_CARD', seat: 'south', card });
      });
      return el('button', {
        class: 'trix-hand-card tar-hand-card' + (enabled ? '' : ' is-disabled'),
        disabled: !enabled,
        ...props,
      }, [this._renderCardStatic(card)]);
    };

    return el('div', { class: 'trix-hand tar-hand' }, [
      el('div', { class: 'trix-hand-title tar-hand-title' }, 'Your Hand'),
      el('div', { class: 'trix-hand-row tar-hand-row' }, hand.map(cardBtn)),
    ]);
  }

  _roundSummaryPanel(state) {
    const s = state.roundSummary;
    if (!s) return el('div', { class: 'tar-round-summary' }, 'Round complete');

    const playerRows = SEATS.map((seat) => {
      const d = s.playerDeltas?.[seat] || 0;
      const sign = d > 0 ? `+${d}` : `${d}`;
      const cls = d > 0 ? ' is-pos' : (d < 0 ? ' is-neg' : '');
      return el('div', { class: 'tar-round-row' + cls }, [
        el('span', {}, this._playerName(seat)),
        el('span', {}, `Bid ${s.bids?.[seat] ?? 0}`),
        el('span', {}, `Tricks ${s.tricksWon?.[seat] ?? 0}`),
        el('span', {}, sign),
      ]);
    });

    return el('div', { class: 'tar-round-summary' }, [
      el('div', { class: 'tar-round-title' }, `Round ${s.roundNumber} Summary`),
      el('div', { class: 'tar-round-sub' }, `Trump ${this._suitSymbol(s.trumpSuit)} from ${this._rankLabel(s.revealedLastCard?.rank)}${this._suitSymbol(s.revealedLastCard?.suit)} (${this._playerName(s.dealer)} last card)`),
      el('div', { class: 'tar-round-list' }, playerRows),
      el('div', { class: 'tar-round-team' }, `Team adjustment this round — Us:+${s.teamBonusDeltas?.NS || 0} | Them:+${s.teamBonusDeltas?.EW || 0}`),
      el('button', { class: 'tar-next-round', onclick: () => this.dispatch({ type: 'NEXT_ROUND' }) }, 'Next Round'),
    ]);
  }

  _gameEndPanel(state) {
    const summary = state.roundSummary;
    const teamTotals = computeTeamTotals(state.scores, state.teamBonus);
    const winner = state.winnerTeam || '—';

    return el('div', { class: 'tar-game-end' }, [
      el('div', { class: 'tar-game-end-title' }, `🏆 ${winner} wins`),
      el('div', { class: 'tar-game-end-line' }, `Us total: ${teamTotals.NS}  •  Them total: ${teamTotals.EW}`),
      el('div', { class: 'tar-game-end-line' }, `Winning rule: one member reached 41 with partner above 0.`),
      summary ? el('div', { class: 'tar-game-end-line' }, `Final round: ${summary.roundNumber}`) : null,
      el('button', {
        class: 'trix-setup-start tar-setup-start',
        onclick: () => this.dispatch({ type: 'RESET_MATCH', difficulty: state.difficulty || this._setupDiff }),
      }, 'New Game'),
    ]);
  }

  _renderCardStatic(card, opts = null) {
    const c = new Card(card.suit, card.rank);
    c.flip(true);
    const node = c.element;
    node.classList.add('trix-card', 'tar-card');
    try {
      node.dataset.cardKey = cardKey(card);
      if (opts?.seat) node.dataset.seat = opts.seat;
      if (opts?.zone) node.dataset.zone = opts.zone;
      const a = this._anim;
      if (a && a.seat === opts?.seat && a.zone === opts?.zone && a.cardKey === cardKey(card)) node.classList.add('is-place-anim');
    } catch {}
    return node;
  }

  _scoresModal(state) {
    if (this._modal !== 'scores') return null;
    const close = () => { this._modal = null; this.render(this.store.getState()); };

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
          el('div', { class: 'tar-log-title' }, `Round ${r.roundNumber} • Trump ${this._suitSymbol(r.trumpSuit)}`),
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

  _rulesModal() {
    if (this._modal !== 'rules') return null;
    const close = () => { this._modal = null; this.render(this.store.getState()); };
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

  render(state) {
    try {
      this.root.innerHTML = '';

      if (state.phase === 'SETUP') {
        this.root.appendChild(this._setupScreen());
        return;
      }

      const bidding = state.phase === 'BIDDING' ? this._biddingPanel(state) : null;
      const screen = el('div', { class: 'trix-screen' }, [
        el('div', { class: 'trix-area trix-area-hud' }, [this._hud(state)]),
        el('div', { class: 'trix-area trix-area-score' }, [this._scoreStrip(state)]),
        el('div', { class: 'trix-area trix-area-picker tar-area-bid' + (bidding ? '' : ' is-empty') }, [bidding || el('div')]),
        el('div', { class: 'trix-area trix-area-table' }, [this._centerTable(state)]),
        el('div', { class: 'trix-area trix-area-hand' }, [this._handView(state)]),
      ]);
      this.root.appendChild(screen);
      this._scheduleLayoutFit(state);

      const scores = this._scoresModal(state);
      if (scores) this.root.appendChild(scores);
      const rules = this._rulesModal(state);
      if (rules) this.root.appendChild(rules);
    } catch (err) {
      console.error('[TarneebApp] render crash', err);
      const msg = err?.stack || err?.message || String(err);
      this.root.innerHTML = `<div style="padding:16px;color:#fff;font-family:monospace;white-space:pre-wrap;font-size:12px;">${String(msg).replace(/</g, '&lt;')}</div>`;
    }
  }

  _scheduleLayoutFit(state) {
    if (this._layoutFrame) cancelAnimationFrame(this._layoutFrame);
    this._layoutFrame = requestAnimationFrame(() => {
      this._layoutFrame = null;
      this._applyLayoutFit(state || this.store?.getState?.());
    });
  }

  _applyLayoutFit(state) {
    if (!this.root || !state || state.phase === 'SETUP') return;

    const handRow = this.root.querySelector('.tar-hand-row');
    const handRail = this.root.querySelector('.tar-hand');
    if (!handRow || !handRail) return;

    const count = Math.max(1, Number(state.hands?.south?.length || 13));
    const isLandscape = window.matchMedia('(orientation: landscape)').matches;
    const rowWidth = Math.max(0, Math.floor(handRow.clientWidth || handRail.clientWidth || 0));
    if (!rowWidth) return;

    const minW = isLandscape ? 28 : 40;
    const maxW = isLandscape ? 48 : 72;
    const gap = clamp(Math.round(rowWidth * (isLandscape ? 0.007 : 0.012)), isLandscape ? 3 : 6, isLandscape ? 7 : 10);
    const totalGap = gap * Math.max(0, count - 1);
    let cardW = Math.floor((rowWidth - totalGap) / count);
    if (!Number.isFinite(cardW) || cardW <= 0) cardW = minW;

    cardW = clamp(cardW, minW, maxW);
    const minStep = isLandscape ? 11 : 15;
    const normalStep = cardW + gap;
    let step = normalStep;
    let overflow = false;
    if (count > 1) {
      const fitStep = Math.floor((rowWidth - cardW) / (count - 1));
      if (fitStep >= minStep) {
        step = clamp(fitStep, minStep, normalStep);
      } else {
        overflow = true;
        step = normalStep;
      }
    }

    const cardH = Math.round(cardW * 1.42);
    const railH = clamp(cardH + (isLandscape ? 44 : 58), isLandscape ? 90 : 110, isLandscape ? 132 : 210);

    handRow.classList.toggle('is-overflow', overflow);
    this.root.style.setProperty('--tar-hand-count', String(count));
    this.root.style.setProperty('--tar-hand-gap', `${gap}px`);
    this.root.style.setProperty('--tar-hand-step', `${step}px`);
    this.root.style.setProperty('--tar-card-w', `${cardW}px`);
    this.root.style.setProperty('--tar-card-h', `${cardH}px`);
    this.root.style.setProperty('--tar-hand-rail-h', `${railH}px`);
    this.root.classList.toggle('is-tight', (window.innerHeight || 0) <= 560);
  }

  _handleEvents(events, prev, next) {
    if (!events?.length) return;
    for (const ev of events) {
      if (ev.type === 'card:played') {
        this._anim = { zone: 'trick', seat: ev.seat, cardKey: cardKey(ev.card) };
        clearTimeout(this._animTimer);
        this._animTimer = setTimeout(() => {
          this._anim = null;
          this.render(this.store.getState());
        }, 360);
      } else if (ev.type === 'trick:won') {
        const hold = Array.isArray(ev.trick) ? ev.trick : [];
        this._trickHold = {
          trick: hold,
          winner: ev.winner,
          until: Date.now() + 950,
        };
        this.setStatus(`${this._playerName(ev.winner)} won the trick`);
      } else if (ev.type === 'bid:placed') {
        this.setStatus(`${this._playerName(ev.seat)} bid ${ev.bid}`);
      } else if (ev.type === 'bids:redeal') {
        this.setStatus(`Bid total ${ev.total} < 11. Redeal.`);
      } else if (ev.type === 'bids:complete') {
        this.setStatus('Bidding complete. Start trick play.');
      } else if (ev.type === 'round:start') {
        this.setStatus(ev.redeal ? `Redeal round ${ev.roundNumber}` : `Round ${ev.roundNumber}`);
      } else if (ev.type === 'round:end') {
        this.setStatus('Round scored');
      } else if (ev.type === 'game:end') {
        this.setStatus(`${ev.winnerTeam} wins the match`);
      } else if (ev.type === 'match:reset') {
        this.setStatus('Match reset');
      } else if (ev.type === 'error') {
        this.setStatus(`Error: ${ev.message}`);
      }
    }
  }

  setStatus(text) {
    if (!text) return;
    this._statusText = String(text);
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => {
      this._statusText = '';
      this.render(this.store.getState());
    }, 2400);
    this.render(this.store.getState());
  }

  _maybeBotMove(state) {
    if (state.phase === 'SETUP' || state.phase === 'ROUND_END' || state.phase === 'GAME_END') return;

    if (this._trickHold && Date.now() < (this._trickHold.until || 0)) {
      if (!this._botTimer) {
        const wait = Math.max(40, (this._trickHold.until || 0) - Date.now() + 30);
        this._botTimer = setTimeout(() => {
          this._botTimer = null;
          this._trickHold = { trick: null, winner: null, until: 0 };
          this.render(this.store.getState());
          this._maybeBotMove(this.store.getState());
        }, wait);
      }
      return;
    }

    const seat = state.turn;
    if (!seat || state.humans?.[seat]) return;
    if (this._botTimer) return;

    const baseDelay = state.difficulty === 'easy' ? 300 : (state.difficulty === 'hard' ? 520 : 420);
    const delay = baseDelay + randJitter(120);

    if (state.phase === 'BIDDING') {
      const remainingAfterMe = Math.max(0, (state.bidOrder?.length || 0) - (state.bidOrderIndex || 0) - 1);
      const bid = chooseBid({
        seat,
        hand: (state.hands?.[seat] || []).map((c) => ({ suit: c.suit, rank: c.rank })),
        trumpSuit: state.trumpSuit,
        difficulty: state.difficulty,
        bidTotalSoFar: state.bidTotal || 0,
        remainingAfterMe,
      });
      if (!bid) return;

      this._botTimer = setTimeout(() => {
        this._botTimer = null;
        this.dispatch({ type: 'PLACE_BID', seat, bid });
      }, delay);
      return;
    }

    if (state.phase !== 'TRICK_PLAY') return;

    const seatTeam = teamOf(seat);
    const mv = chooseMove({
      seat,
      hand: (state.hands?.[seat] || []).map((c) => ({ suit: c.suit, rank: c.rank })),
      ledSuit: state.trick?.[0]?.card?.suit || null,
      trumpSuit: state.trumpSuit,
      difficulty: state.difficulty,
      currentTrick: (state.trick || []).map((t) => ({ seat: t.seat, card: { suit: t.card.suit, rank: t.card.rank } })),
      playedCards: (state.playedCards || []).map((c) => ({ suit: c.suit, rank: c.rank, seat: c.seat })),
      completedTricks: (state.completedTricks || []).map((t) => ({
        ledSuit: t.ledSuit,
        winner: t.winner,
        cards: (t.cards || []).map((x) => ({ seat: x.seat, card: { suit: x.card.suit, rank: x.card.rank } })),
      })),
      bid: state.bids?.[seat] || 0,
      tricksWon: state.tricksWon?.[seat] || 0,
      opponents: SEATS.filter((s) => teamOf(s) !== seatTeam),
      partner: partnerOf(seat),
    });

    if (!mv?.card) return;
    this._botTimer = setTimeout(() => {
      this._botTimer = null;
      this.dispatch({ type: 'PLAY_CARD', seat, card: mv.card });
    }, delay);
  }
}

function randJitter(max) {
  if (!max || max <= 1) return 0;
  const n = Math.random();
  return Math.floor(n * max);
}
