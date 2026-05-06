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
  partnerOf,
  teamOf,
} from './tarneeb/tarneebRules.js';
import {
  buildSetupScreen,
  buildRoundSummary,
  buildGameEnd,
  buildScoresModal,
  buildRulesModal,
  buildHud,
  buildScoreStrip,
  buildBiddingPanel,
  buildCenterTable,
  buildHandView,
} from './tarneeb/tarneebView.js';

function css(href) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  return l;
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
    this._stats = { gamesPlayed: 0, gamesWon: 0 };
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

    this._loadPrefs();
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

  /* ── Persistence ── */

  _loadPrefs() {
    try {
      const d = this.kernel.storage.load('yancotab_tarneeb') || {};
      if (d.difficulty && ['easy','moderate','hard'].includes(d.difficulty)) this._setupDiff = d.difficulty;
      this._stats = {
        gamesPlayed: d.gamesPlayed || 0,
        gamesWon: d.gamesWon || 0,
      };
    } catch {}
  }

  _savePrefs() {
    try {
      this.kernel.storage.save('yancotab_tarneeb', {
        difficulty: this._setupDiff,
        gamesPlayed: this._stats.gamesPlayed,
        gamesWon: this._stats.gamesWon,
      });
    } catch {}
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

  _setupScreen() { return buildSetupScreen(this); }

  _hud(state) { return buildHud(this, state); }
  _scoreStrip(state) { return buildScoreStrip(this, state); }
  _biddingPanel(state) { return buildBiddingPanel(this, state); }
  _centerTable(state) { return buildCenterTable(this, state); }
  _handView(state) { return buildHandView(this, state); }
  _roundSummaryPanel(state) { return buildRoundSummary(this, state); }
  _gameEndPanel(state) { return buildGameEnd(this, state); }

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

  _scoresModal(state) { return buildScoresModal(this, state); }

  _rulesModal() { return buildRulesModal(this); }

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
        try { navigator.vibrate?.(15); } catch {}
        this._anim = { zone: 'trick', seat: ev.seat, cardKey: cardKey(ev.card) };
        clearTimeout(this._animTimer);
        this._animTimer = setTimeout(() => {
          this._anim = null;
          this.render(this.store.getState());
        }, 360);
      } else if (ev.type === 'trick:won') {
        try { navigator.vibrate?.([10, 30, 10]); } catch {}
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
        this._stats.gamesPlayed++;
        if (ev.winnerTeam === 'NS') this._stats.gamesWon++;
        this._savePrefs();
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
