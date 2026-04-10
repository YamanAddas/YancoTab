import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';
import { createStore } from './shared/store.js';
import { trixReducer } from './trix/trixReducer.js';
import { SEAT_NAMES, CONTRACTS, SEATS, legalLayoutPlays, TEAMS, TEAM_NAMES, partnerOf } from './trix/trixRules.js';
import { initMatch } from './trix/trixState.js';
import { chooseMove, chooseBotContract } from './trix/trixAI.js';
import { Card } from './cardEngine/Card.js';

function css(href) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; return l; }

const CONTRACT_META = {
  king:     { icon: '👑', title: 'King of Hearts', goal: 'Avoid taking K♥', score: '−75 / −150' },
  queens:   { icon: '👸', title: 'Queens', goal: 'Avoid taking queens', score: '−25 each' },
  diamonds: { icon: '💎', title: 'Diamonds', goal: 'Avoid taking diamonds', score: '−10 each' },
  ltoosh:   { icon: '🪤', title: 'Ltoosh', goal: 'Avoid taking tricks', score: '−15/trick' },
  trix:     { icon: '🧩', title: 'Trix (Layout)', goal: 'Lay sequences from J', score: '+200→+50' },
};

function cardKey(card) { return `${card?.suit||'x'}-${card?.rank||'0'}`; }

function tapGuard(handler, { movePx = 12 } = {}) {
  let sx = 0, sy = 0, moved = false;
  return {
    onpointerdown(e) { moved = false; sx = e.clientX; sy = e.clientY; try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch {} },
    onpointermove(e) { if (Math.abs(e.clientX-sx) > movePx || Math.abs(e.clientY-sy) > movePx) moved = true; },
    onpointerup(e) { try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {} if (moved) return; try { e.preventDefault(); } catch {} handler(e); },
    onpointercancel(e) { try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {} },
    onclick(e) { try { e.preventDefault(); } catch {} handler(e); },
  };
}

export class TrixApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { id: 'trix', name: 'Trix', icon: '🂡' };
    this._unsub = null; this._botTimer = null; this._styleLinks = [];
    this._statusText = ''; this._statusTimer = null;
    this._trickHold = { trick: null, until: 0 };
    this._anim = null; this._animTimer = null;
    this._modal = null; this._vhCleanup = null;
    this._setupMode = 'single'; this._setupDiff = 'moderate'; this._setupRules = 'classic';
    this._scoreCompact = false;
    this._scorePrefLocked = false;
  }

  async init() {
    this._styleLinks = [css('css/cards.css'), css('css/trix.css')];
    this._styleLinks.forEach(l => document.head.appendChild(l));
    this.root = el('div', { class: 'app-window trix-remake' });
    const setVh = () => { this.root.style.setProperty('--app-vh', `${(window.innerHeight||0)*0.01}px`); };
    setVh();
    const onR = () => {
      setVh();
      this._syncAdaptivePrefs();
    };
    window.addEventListener('resize', onR, { passive: true });
    window.addEventListener('orientationchange', onR, { passive: true });
    window.visualViewport?.addEventListener?.('resize', onR, { passive: true });
    window.visualViewport?.addEventListener?.('scroll', onR, { passive: true });
    this._vhCleanup = () => {
      window.removeEventListener('resize', onR);
      window.removeEventListener('orientationchange', onR);
      window.visualViewport?.removeEventListener?.('resize', onR);
      window.visualViewport?.removeEventListener?.('scroll', onR);
    };

    this.store = createStore(trixReducer, initMatch());
    this._prevState = this.store.getState();
    this._unsub = this.store.subscribe((state, events = []) => {
      this._handleEvents(events, this._prevState, state);
      this.render(state);
      this._maybeBotMove(state);
      this._prevState = state;
    });
    this._syncAdaptivePrefs({ force: true });
    this.render(this.store.getState());
  }

  destroy() {
    try { this._unsub?.(); } catch {}
    try { this._vhCleanup?.(); } catch {}
    this._vhCleanup = null;
    if (this._botTimer) { clearTimeout(this._botTimer); this._botTimer = null; }
    if (this._statusTimer) { clearTimeout(this._statusTimer); this._statusTimer = null; }
    if (this._animTimer) { clearTimeout(this._animTimer); this._animTimer = null; }
    for (const l of this._styleLinks) { try { l.remove(); } catch {} }
    this._styleLinks = []; super.destroy();
  }

  dispatch(action) { try { return this.store.dispatch(action); } catch (e) { console.error(e); } }
  _contractHint(id, state = null) {
    const meta = CONTRACT_META[id] || { icon: '🃏', title: '', goal: '', score: '' };
    const profile = state?.ruleProfile || this._setupRules || 'classic';
    if (id === 'queens' && profile === 'jawaker2025') {
      return { ...meta, score: '−25 each / doubled queens −50' };
    }
    return meta;
  }
  _playerName(seat) { return seat === 'south' ? 'You' : (SEAT_NAMES[seat] || seat); }
  _suitSymbol(s) { return s==='spades'?'♠':s==='hearts'?'♥':s==='diamonds'?'♦':s==='clubs'?'♣':'🃏'; }
  _rankLabel(r) { if(r===1)return'A'; if(r===11)return'J'; if(r===12)return'Q'; if(r===13)return'K'; return String(r); }
  _doubleCardLabel(k) {
    const [suit, rankStr] = String(k || '').split(':');
    const rank = Number(rankStr || 0);
    if (!suit || !rank) return String(k || '');
    return `${this._rankLabel(rank)}${this._suitSymbol(suit)}`;
  }

  _recommendedCompactScore() {
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    const landscape = w > h;
    return landscape || h <= 740 || w <= 420;
  }

  _syncAdaptivePrefs({ force = false } = {}) {
    if (!force && this._scorePrefLocked) return;
    const next = this._recommendedCompactScore();
    if (this._scoreCompact === next) return;
    this._scoreCompact = next;
    if (this.store) this.render(this.store.getState());
  }

  _toggleScoreDensity() {
    this._scorePrefLocked = true;
    this._scoreCompact = !this._scoreCompact;
    this.render(this.store.getState());
  }

  /* ── SETUP SCREEN ────────────────────────────────────── */

  _setupScreen() {
    const mb = (m, label) => el('button', {
      class: 'trix-setup-btn' + (this._setupMode === m ? ' is-active' : ''),
      onclick: () => { this._setupMode = m; this.render(this.store.getState()); }
    }, label);

    const db = (d, label) => el('button', {
      class: 'trix-setup-btn' + (this._setupDiff === d ? ' is-active' : ''),
      onclick: () => { this._setupDiff = d; this.render(this.store.getState()); }
    }, label);

    const rb = (r, label) => el('button', {
      class: 'trix-setup-btn' + (this._setupRules === r ? ' is-active' : ''),
      onclick: () => { this._setupRules = r; this.render(this.store.getState()); },
    }, label);

    const teamInfo = this._setupMode === 'partners'
      ? el('div', { class: 'trix-setup-teams' }, [
          el('div', { class: 'trix-setup-team' }, 'Team A: You + CatByte'),
          el('div', { class: 'trix-setup-team' }, 'Team B: Zbayder-man + Abu Yousif'),
        ])
      : el('div', { class: 'trix-setup-teams' }, [el('div', { class: 'trix-setup-team' }, '4 players, individual scores')]);

    return el('div', { class: 'trix-setup' }, [
      el('div', { class: 'trix-setup-title' }, '🂡 TRIX'),
      el('div', { class: 'trix-setup-section' }, [
        el('div', { class: 'trix-setup-label' }, 'Mode'),
        el('div', { class: 'trix-setup-row' }, [mb('single', '👤 Single'), mb('partners', '👥 Partners')]),
      ]),
      teamInfo,
      el('div', { class: 'trix-setup-section' }, [
        el('div', { class: 'trix-setup-label' }, 'Difficulty'),
        el('div', { class: 'trix-setup-row' }, [db('easy', '🟢 Easy'), db('moderate', '🟡 Moderate'), db('hard', '🔴 Hard')]),
      ]),
      el('div', { class: 'trix-setup-section' }, [
        el('div', { class: 'trix-setup-label' }, 'Ruleset'),
        el('div', { class: 'trix-setup-row' }, [rb('classic', 'Classic'), rb('jawaker2025', 'Jawaker 2025')]),
      ]),
      el('div', { class: 'trix-setup-actions' }, [
        el('button', {
          class: 'trix-setup-start',
          onclick: () => {
            this._scorePrefLocked = false;
            this._syncAdaptivePrefs({ force: true });
            this.dispatch({
              type: 'START_MATCH',
              mode: this._setupMode,
              difficulty: this._setupDiff,
              ruleProfile: this._setupRules,
            });
          },
        }, '▶ Start Game'),
        el('button', { class: 'trix-action-btn', onclick: () => this.close() }, 'Exit'),
      ]),
    ]);
  }

  /* ── HUD ─────────────────────────────────────────────── */

  _hud(state) {
    const ownerName = state.kingdomOwner ? SEAT_NAMES[state.kingdomOwner] : '—';
    const cName = state.currentContract ? state.currentContract.name : (state.phase === 'KINGDOM_PICK_CONTRACT' ? 'Choose…' : '—');
    const turnName = state.turn ? SEAT_NAMES[state.turn] : '—';
    const diffIcon = state.difficulty === 'easy' ? '🟢' : state.difficulty === 'hard' ? '🔴' : '🟡';
    const profile = state.ruleProfile === 'jawaker2025' ? 'Jawaker 2025' : 'Classic';

    const r1 = [
      el('div', { class: 'trix-chip is-strong' }, `K${state.kingdomNumber}/4`),
      el('div', { class: 'trix-chip' }, ownerName),
      el('div', { class: 'trix-chip' }, diffIcon),
      el('div', { class: 'trix-chip' }, profile),
    ];
    if (state.mode === 'partners') r1.push(el('div', { class: 'trix-chip is-partner' }, '👥'));

    const r2 = [
      el('div', { class: 'trix-chip' }, cName),
      el('div', { class: 'trix-chip trix-chip-turn' }, `Turn: ${turnName}`),
    ];
    if (this._statusText) r2.push(el('div', { class: 'trix-chip trix-chip-status' }, this._statusText));

    const acts = el('div', { class: 'trix-actions' }, [
      el('button', { class: 'trix-action-btn', onclick: () => this._toggleScoreDensity() }, this._scoreCompact ? 'View: Full' : 'View: Compact'),
      el('button', { class: 'trix-action-btn', onclick: () => { this._modal = 'scoresheet'; this.render(this.store.getState()); } }, 'Score'),
      el('button', { class: 'trix-action-btn', onclick: () => { this._modal = 'rules'; this.render(this.store.getState()); } }, 'Rules'),
      el('button', { class: 'trix-action-btn', onclick: () => this.close() }, 'Exit'),
      el('button', { class: 'trix-action-btn is-danger', onclick: () => this.dispatch({ type: 'RESET_MATCH' }) }, 'Reset'),
    ]);

    return el('div', { class: 'trix-hud' }, [
      el('div', { class: 'trix-hud-row trix-hud-row-1' }, r1),
      el('div', { class: 'trix-hud-row trix-hud-row-2' }, r2),
      acts,
    ]);
  }

  _contractBlurb(state) {
    const cid = state.currentContract?.id;
    if (!cid) return el('div', { class: 'trix-subhint' }, 'Waiting for game selection…');
    const m = this._contractHint(cid, state);
    return el('div', { class: 'trix-subhint' }, `${m.icon} ${m.goal}  •  ${m.score}`);
  }

  /* ── SCORE STRIP ─────────────────────────────────────── */

  _scoreStrip(state) {
    const compact = !!this._scoreCompact;

    if (state.mode === 'partners') {
      if (compact) {
        const makeCompactTeam = (id, label) => {
          const total = state.teamScores?.[id] ?? 0;
          const turnHere = TEAMS[id]?.includes(state.turn);
          return el('div', { class: 'trix-scoreitem is-team is-compact' + (turnHere ? ' is-turn' : '') + (id==='A' ? ' is-you' : '') }, [
            el('span', { class: 'trix-scoreitem-name' }, label),
            el('span', { class: 'trix-scoreitem-score' }, String(total)),
          ]);
        };
        return el('div', { class: 'trix-scorestrip is-compact' }, [
          makeCompactTeam('A', 'Us'),
          makeCompactTeam('B', 'Them'),
          el('div', { class: 'trix-scoreitem is-compact is-meta' }, [
            el('span', { class: 'trix-scoreitem-name' }, 'You'),
            el('span', { class: 'trix-scoreitem-score' }, String(state.scores?.south ?? 0)),
            el('span', { class: 'trix-scoreitem-cards' }, `${state.hands?.south?.length ?? 0} cards`),
          ]),
        ]);
      }

      const ti = (id) => {
        const seats = TEAMS[id];
        const total = state.teamScores?.[id] ?? 0;
        const names = TEAM_NAMES[id] || seats.map(s => SEAT_NAMES[s]).join('+');
        const ht = seats.includes(state.turn);
        return el('div', { class: 'trix-scoreitem is-team' + (ht ? ' is-turn' : '') + (id==='A' ? ' is-you' : '') }, [
          el('span', { class: 'trix-scoreitem-name' }, `${id}: ${names}`),
          el('span', { class: 'trix-scoreitem-score' }, String(total)),
        ]);
      };
      return el('div', { class: 'trix-scorestrip' + (compact ? ' is-compact' : '') }, [ti('A'), ti('B')]);
    }

    const item = (seat) => el('div', {
      class: 'trix-scoreitem' + (seat==='south'?' is-you':'') + (state.turn===seat?' is-turn':'')
    }, [
      el('span', { class: 'trix-scoreitem-name' }, SEAT_NAMES[seat]),
      el('span', { class: 'trix-scoreitem-score' }, String(state.scores?.[seat] ?? 0)),
      compact ? null : el('span', { class: 'trix-scoreitem-cards' }, `(${state.hands?.[seat]?.length ?? 0})`),
    ]);
    return el('div', { class: 'trix-scorestrip' + (compact ? ' is-compact' : '') }, SEATS.map(item));
  }

  /* ── REVEALED 2s BADGE ───────────────────────────────── */

  _revealed2sBadge(state) {
    if (state.mode !== 'partners' || !state.revealed2s) return null;
    const items = [];
    for (const seat of SEATS) {
      const twos = state.revealed2s[seat];
      if (!twos?.length) continue;
      items.push(el('span', { class: 'trix-r2-item' }, `${SEAT_NAMES[seat]}: ${twos.map(c=>'2'+this._suitSymbol(c.suit)).join(' ')}`));
    }
    if (!items.length) return null;
    return el('div', { class: 'trix-revealed2s' }, [el('span', { class: 'trix-r2-label' }, '🃏 2s: '), ...items]);
  }

  /* ── CONTRACT PICKER ─────────────────────────────────── */

  _contractPickerBar(state) {
    if (state.phase !== 'KINGDOM_PICK_CONTRACT' || state.kingdomOwner !== 'south') return null;
    const owner = state.kingdomOwner;
    const rem = new Set(state.contractsRemaining[owner] || []);
    const btn = (c) => {
      const en = rem.has(c.id);
      const m = this._contractHint(c.id, state);
      const props = tapGuard(() => { this.dispatch({ type: 'PICK_CONTRACT', seat: owner, contractId: c.id }); });
      return el('button', { class: 'trix-contract-btn' + (en ? '' : ' is-disabled'), disabled: !en, ...props }, [
        el('div', { class: 'trix-contract-btn-icon' }, m.icon),
        el('div', { class: 'trix-contract-btn-title' }, m.title),
      ]);
    };
    return el('div', { class: 'trix-contract-bar' }, [
      el('div', { class: 'trix-contract-bar-title' }, 'Choose a game'),
      el('div', { class: 'trix-contract-bar-row' }, CONTRACTS.map(btn)),
    ]);
  }

  /* ── CENTER TABLE ────────────────────────────────────── */

  _centerTable(state) {
    const area = el('div', { class: 'trix-table' });

    if (state.phase === 'TRICK_PLAY' || (this._trickHold && Date.now() < (this._trickHold.until || 0))) {
      const at = Array.isArray(state.trick) ? state.trick : [];
      const ha = (this._trickHold && Date.now() < (this._trickHold.until || 0) && Array.isArray(this._trickHold.trick));
      const ht = ha ? this._trickHold.trick : [];
      const show = at.length ? at : ht;
      const ws = ha ? this._trickHold.winner : null;
      const slots = ['north','east','south','west'].map(seat => {
        const t = show.find(x => x.seat === seat);
        return el('div', { class: 'trix-slot trix-slot-' + seat }, [
          el('div', { class: 'trix-seat-banner' + (state.turn===seat?' is-turn':'') + (ws===seat?' is-winner':'') }, SEAT_NAMES[seat]),
          el('div', { class: 'trix-slot-card' }, [
            t ? this._renderCardStatic(t.card, { seat, zone: 'trick' }) : el('div', { class: 'trix-slot-empty' }, '')
          ]),
        ]);
      });
      area.appendChild(el('div', { class: 'trix-trick-grid' }, slots));
      return area;
    }

    if (state.phase === 'TRIX_LAYOUT_PLAY') {
      area.appendChild(this._renderLayoutTable(state));
      const r2 = this._revealed2sBadge(state);
      if (r2) area.appendChild(r2);
      return area;
    }

    if (state.phase === 'GAME_END') {
      area.appendChild(this._gameEndView(state));
      return area;
    }

    area.appendChild(el('div', { class: 'trix-placeholder' }, 'Waiting…'));
    return area;
  }

  _gameEndView(state) {
    const lines = [];
    if (state.mode === 'partners') {
      const a = state.teamScores?.A ?? 0, b = state.teamScores?.B ?? 0;
      const winner = a > b ? 'Team A' : b > a ? 'Team B' : 'Tie';
      lines.push(el('div', { class: 'trix-end-title' }, `🏆 ${winner} wins!`));
      lines.push(el('div', { class: 'trix-end-line' }, `Team A: ${a} | Team B: ${b}`));
    } else {
      const sorted = SEATS.slice().sort((a,b) => (state.scores[b]||0) - (state.scores[a]||0));
      lines.push(el('div', { class: 'trix-end-title' }, `🏆 ${SEAT_NAMES[sorted[0]]} wins!`));
      for (const s of sorted) lines.push(el('div', { class: 'trix-end-line' }, `${SEAT_NAMES[s]}: ${state.scores[s]}`));
    }
    lines.push(el('button', { class: 'trix-setup-start', onclick: () => this.dispatch({ type: 'RESET_MATCH' }) }, 'New Game'));
    return el('div', { class: 'trix-end' }, lines);
  }

  _renderLayoutTable(state) {
    const suits = ['spades','hearts','diamonds','clubs'];
    const row = (suit) => {
      const st = state.layoutBySuit?.[suit] || { started: false, low: 11, high: 11 };
      const started = st.started === true;
      const lo = started && st.low > 2 ? st.low - 1 : (started ? null : 11);
      const hi = started ? ((st.high === 13) ? 1 : (st.high === 1 ? null : st.high + 1)) : 11;
      const cnt = started ? this._layoutCountForSuit(st) : 0;
      const prog = Math.min(100, Math.round((cnt / 13) * 100));
      return el('div', { class: 'trix-layout-compact-row' }, [
        el('div', { class: 'trix-layout-compact-suit ' + suit }, [el('div', { class: 'trix-layout-suit-icon' }, this._suitSymbol(suit))]),
        el('div', { class: 'trix-layout-compact-info' }, [
          !started ? el('div', { class: 'trix-layout-compact-next' }, 'J to start')
            : el('div', { class: 'trix-layout-compact-next' }, `${lo ? this._rankLabel(lo) : '—'} / ${hi ? this._rankLabel(hi) : '—'}`),
          el('div', { class: 'trix-layout-compact-bar' }, [el('div', { class: 'trix-layout-compact-barfill', style: `width:${prog}%` }, '')]),
        ]),
      ]);
    };
    return el('div', { class: 'trix-layout-compact' }, [el('div', { class: 'trix-layout-title' }, 'Trix Layout'), ...suits.map(row)]);
  }

  _layoutCountForSuit(st) {
    if (!st?.started) return 0;
    const down = Math.max(0, 11 - (st.low ?? 11));
    const up = st.high === 1 ? 3 : Math.max(0, (st.high ?? 11) - 11);
    return 1 + down + up;
  }

  /* ── HAND VIEW ───────────────────────────────────────── */

  _handView(state) {
    const seat = 'south';
    const hand = state.hands[seat] || [];
    const trickArr = Array.isArray(state.trick) ? state.trick : [];
    const ledSuit = trickArr[0]?.card?.suit || null;
    const layoutLegal = state.phase === 'TRIX_LAYOUT_PLAY'
      ? new Set(legalLayoutPlays(hand, state.layoutBySuit).map((c) => cardKey(c)))
      : new Set();

    const canPlay = (card) => {
      if (this._trickHold && Date.now() < (this._trickHold.until || 0)) return false;
      if (state.phase === 'TRICK_PLAY' && state.turn === seat) {
        const hasLed = ledSuit && hand.some(c => c.suit === ledSuit);
        if (!ledSuit) return true;
        return hasLed ? (card.suit === ledSuit) : true;
      }
      if (state.phase === 'TRIX_LAYOUT_PLAY' && state.turn === seat) return layoutLegal.has(cardKey(card));
      return false;
    };

    const cardBtn = (card) => {
      const en = canPlay(card);
      const p = tapGuard(() => {
        if (!en) return;
        if (state.phase === 'TRICK_PLAY') this.dispatch({ type: 'PLAY_CARD', seat, card });
        else if (state.phase === 'TRIX_LAYOUT_PLAY') this.dispatch({ type: 'LAYOUT_PLAY', seat, card });
      });
      return el('button', { class: 'trix-hand-card' + (en ? '' : ' is-disabled'), disabled: !en, ...p }, [this._renderCardStatic(card)]);
    };

    const hasLM = layoutLegal.size > 0;
    const children = [
      el('div', { class: 'trix-hand-title' }, 'Your hand'),
      el('div', { class: 'trix-hand-row' }, hand.map(cardBtn)),
    ];
    if (state.phase === 'TRIX_LAYOUT_PLAY') {
      children.push(el('button', {
        class: 'trix-pass',
        onclick: () => this.dispatch({ type: 'LAYOUT_PASS', seat }),
        disabled: !(state.phase === 'TRIX_LAYOUT_PLAY' && state.turn === seat && !hasLM),
      }, 'Pass'));
    }
    return el('div', { class: 'trix-hand' }, children);
  }

  _renderCardStatic(card, opts = null) {
    const c = new Card(card.suit, card.rank); c.flip(true);
    const node = c.element; node.classList.add('trix-card');
    try {
      node.dataset.cardKey = cardKey(card);
      if (opts?.seat) node.dataset.seat = opts.seat;
      if (opts?.zone) node.dataset.zone = opts.zone;
      const a = this._anim;
      if (a && a.seat === opts?.seat && a.zone === opts?.zone && a.cardKey === cardKey(card)) node.classList.add('is-place-anim');
    } catch {}
    return node;
  }

  /* ── SCORESHEET MODAL ────────────────────────────────── */

  _scoresheetModal(state) {
    if (this._modal !== 'scoresheet') return null;
    const close = () => { this._modal = null; this.render(this.store.getState()); };
    const seats = ['south','east','north','west'];
    const log = Array.isArray(state.dealLog) ? state.dealLog : [];
    const lookup = new Map();
    for (const e of log) lookup.set(`${e.kingdomNumber}:${e.contractId}`, e);
    const fmt = (n) => { const v = Number(n||0); if(!v) return '—'; return v>0?`+${v}`:`${v}`; };

    const dealRow = (label, contractId, kn) => {
      const e = lookup.get(`${kn}:${contractId}`) || null;
      const d = e?.deltas || {};
      const cell = (s) => el('div', { class: 'trix-sheet-cell' + ((d[s]||0)>0?' is-pos':(d[s]||0)<0?' is-neg':'') }, fmt(d[s]));
      return el('div', { class: 'trix-sheet-grid trix-sheet-row' }, [
        el('div', { class: 'trix-sheet-cell is-label' }, label), cell('south'), cell('east'), cell('north'), cell('west'),
      ]);
    };

    const colHead = el('div', { class: 'trix-sheet-grid trix-sheet-head' }, [
      el('div', { class: 'trix-sheet-cell is-label' }, ''),
      ...seats.map(s => el('div', { class: 'trix-sheet-cell is-head' }, SEAT_NAMES[s])),
    ]);

    const kb = (k) => el('div', { class: 'trix-kingdom-block' }, [
      el('div', { class: 'trix-kingdom-block-title' }, `Kingdom ${k}`),
      dealRow('King♥','king',k), dealRow('Queens','queens',k), dealRow('Dia','diamonds',k),
      dealRow('Ltoosh','ltoosh',k), dealRow('Trix','trix',k),
    ]);

    const playerTotals = el('div', { class: 'trix-sheet-grid trix-sheet-total' }, [
      el('div', { class: 'trix-sheet-cell is-label' }, 'Player'),
      ...seats.map(s => el('div', { class: 'trix-sheet-cell is-head' }, String(state.scores[s]??0))),
    ]);

    const sections = [
      el('div', { class: 'trix-modal-head' }, [
        el('div', { class: 'trix-modal-title2' }, 'Scoresheet'),
        el('button', { class: 'trix-modal-x', onclick: close }, '✕'),
      ]),
      colHead, kb(1), kb(2), kb(3), kb(4), playerTotals,
    ];

    if (state.mode === 'partners') {
      const tA = state.teamScores?.A ?? 0, tB = state.teamScores?.B ?? 0;
      sections.push(el('div', { class: 'trix-sheet-teamrow' }, [
        el('div', { class: 'trix-sheet-teamcell' + (tA>=tB?' is-lead':'') }, `Team A: ${tA}`),
        el('div', { class: 'trix-sheet-teamcell' + (tB>tA?' is-lead':'') }, `Team B: ${tB}`),
      ]));
    }

    return el('div', { class: 'trix-modal', onclick: (e) => { if(e.target?.classList?.contains('trix-modal')) close(); } }, [
      el('div', { class: 'trix-modal-panel trix-sheet' }, sections),
    ]);
  }

  /* ── RULES MODAL ─────────────────────────────────────── */

  _rulesModal(state) {
    if (this._modal !== 'rules') return null;
    const close = () => { this._modal = null; this.render(this.store.getState()); };
    const cid = state.currentContract?.id;
    const meta = cid ? this._contractHint(cid, state) : null;
    const profile = state.ruleProfile || 'classic';
    const rules = {
      king: profile === 'jawaker2025'
        ? ['Follow suit.', 'Taking K♥ = −75.', 'If doubled, taker gets −150 and doubler gets +75 unless self-captured.', 'Doubling is closed in Jawaker 2025 profile.']
        : ['Follow suit.', 'Taking K♥ = −75.', 'Tadbeel doubles to −150.'],
      queens: profile === 'jawaker2025'
        ? ['Each queen = −25.', 'Doubled queen = −50 to taker and +25 to doubler unless self-captured.', 'Follow suit; highest wins.']
        : ['Each queen = −25.', 'Follow suit; highest wins.'],
      diamonds: ['Each diamond = −10.', 'Follow suit; highest wins.'],
      ltoosh: ['Each trick = −15.', 'Follow suit; highest wins.'],
      trix: ['Play J to start suits.', 'Build down to 2, up to A.', '1st: +200, 2nd: +150, 3rd: +100, 4th: +50.'],
    };
    let body;
    if (!cid) { body = el('div', { class: 'trix-rules' }, 'No game selected yet.'); }
    else {
      const lines = (rules[cid]||[]).map(l => el('li', {}, l));
      if (state.mode === 'partners' && cid === 'trix') lines.push(el('li', { class: 'trix-rules-partner' }, 'Partners: After 1st round, all 2s revealed.'));
      body = el('div', { class: 'trix-rules' }, [
        el('div', { class: 'trix-rules-title' }, `${meta.icon} ${meta.title}`),
        el('ul', {}, lines),
      ]);
    }
    return el('div', { class: 'trix-modal', onclick: (e) => { if(e.target?.classList?.contains('trix-modal')) close(); } }, [
      el('div', { class: 'trix-modal-panel trix-rules-panel' }, [
        el('div', { class: 'trix-modal-head' }, [
          el('div', { class: 'trix-modal-title2' }, 'Rules'),
          el('button', { class: 'trix-modal-x', onclick: close }, '✕'),
        ]),
        el('div', { class: 'trix-rules-profile' }, `Profile: ${profile === 'jawaker2025' ? 'Jawaker 2025' : 'Classic'}`),
        body,
      ]),
    ]);
  }

  _doublingModal(state) {
    if (state.phase !== 'DOUBLING_DECISION') return null;
    const opts = Array.isArray(state.doubling?.options) ? state.doubling.options : [];
    const chosen = new Set(opts.map((o) => o.key));
    const submit = (withDoubles) => this.dispatch({
      type: 'SET_DOUBLES',
      doubledKeys: withDoubles ? Array.from(chosen) : [],
    });
    const title = state.currentContract?.id === 'queens' ? 'Queens Doubling' : 'Tadbeel (Double)';
    const subtitle = opts.length
      ? `Your cards: ${opts.map((o) => this._doubleCardLabel(o.key)).join(', ')}`
      : 'No doubling options';
    const info = state.doubling?.closed
      ? 'Closed doubling enabled: selection is private.'
      : 'Open doubling: selection is visible in scoring.';

    return el('div', { class: 'trix-modal' }, [
      el('div', { class: 'trix-modal-panel trix-tadbeel' }, [
        el('div', { class: 'trix-modal-title2' }, title),
        el('div', { class: 'trix-tadbeel-sub' }, subtitle),
        el('div', { class: 'trix-tadbeel-sub' }, info),
        el('div', { class: 'trix-tadbeel-actions' }, [
          el('button', { class: 'trix-tadbeel-btn is-primary', onclick: () => submit(true) }, 'Double'),
          el('button', { class: 'trix-tadbeel-btn', onclick: () => submit(false) }, 'Continue'),
        ]),
      ]),
    ]);
  }

  /* ── RENDER ──────────────────────────────────────────── */

  render(state) {
    try {
      this.root.innerHTML = '';
      this.root.dataset.scoreDensity = this._scoreCompact ? 'compact' : 'full';

      // Setup screen
      if (state.phase === 'SETUP') {
        this._setupMode = state.mode || this._setupMode;
        this._setupDiff = state.difficulty || this._setupDiff;
        this._setupRules = state.ruleProfile || this._setupRules;
        this.root.appendChild(this._setupScreen());
        return;
      }

      const picker = this._contractPickerBar(state);
      const screen = el('div', { class: 'trix-screen' }, [
        el('div', { class: 'trix-area trix-area-hud' }, [this._hud(state)]),
        el('div', { class: 'trix-area trix-area-note' }, [this._contractBlurb(state)]),
        el('div', { class: 'trix-area trix-area-score' }, [this._scoreStrip(state)]),
        el('div', { class: 'trix-area trix-area-picker' + (picker ? '' : ' is-empty') }, [picker || el('div')]),
        el('div', { class: 'trix-area trix-area-table' }, [this._centerTable(state)]),
        el('div', { class: 'trix-area trix-area-hand' }, [this._handView(state)]),
      ]);
      this.root.appendChild(screen);

      const doubling = this._doublingModal(state);
      if (doubling) this.root.appendChild(doubling);
      const sheet = this._scoresheetModal(state);
      if (sheet) this.root.appendChild(sheet);
      const rules = this._rulesModal(state);
      if (rules) this.root.appendChild(rules);
    } catch (err) {
      console.error('[TrixApp] render crash', err);
      const msg = (err?.stack || err?.message || String(err));
      this.root.innerHTML = `<div style="padding:16px;color:#fff;font-family:monospace;white-space:pre-wrap;font-size:12px;">${String(msg).replace(/</g,'&lt;')}</div>`;
    }
  }

  /* ── EVENTS ──────────────────────────────────────────── */

  _handleEvents(events, prev, next) {
    if (!events?.length) return;
    for (const ev of events) {
      if (ev.type === 'card:played') {
        this._anim = { zone: 'trick', seat: ev.seat, cardKey: cardKey(ev.card) };
        clearTimeout(this._animTimer);
        this._animTimer = setTimeout(() => { this._anim = null; this.render(this.store.getState()); }, 420);
      } else if (ev.type === 'layout:played') {
        this._anim = { zone: 'layout', seat: ev.seat, cardKey: cardKey(ev.card) };
        clearTimeout(this._animTimer);
        this._animTimer = setTimeout(() => { this._anim = null; this.render(this.store.getState()); }, 420);
      } else if (ev.type === 'trick:won') {
        const wn = this._playerName(ev.winner);
        const holdTrick = Array.isArray(ev.trick) ? ev.trick : [];
        this._trickHold = holdTrick.length
          ? { trick: holdTrick, until: Date.now() + 1100, winner: ev.winner }
          : { trick: null, until: Date.now() + 800, winner: ev.winner };
        this.setStatus(wn === 'You' ? 'You won the trick' : `${wn} won the trick`);
      } else if (ev.type === 'deal:start') {
        const meta = this._contractHint(ev.contractId, next);
        if (next.kingdomOwner && next.kingdomOwner !== 'south') {
          this.setStatus(`${SEAT_NAMES[next.kingdomOwner]} chose ${meta.title}`);
        } else { this.setStatus(`New deal: ${meta.title}`); }
      } else if (ev.type === 'doubling:prompt') {
        this.setStatus('Choose doubling options');
      } else if (ev.type === 'doubling:set') {
        if (ev.count > 0) this.setStatus(`Doubled ${ev.count} card${ev.count > 1 ? 's' : ''}`);
        else this.setStatus('No double');
      } else if (ev.type === 'layout:out') {
        this.setStatus(`${SEAT_NAMES[ev.seat]||'?'} out (#${ev.place})`);
      } else if (ev.type === 'error') {
        this.setStatus(`Error: ${ev.message}`);
      } else if (ev.type === 'match:reset') {
        this._scorePrefLocked = false;
        this._syncAdaptivePrefs({ force: true });
        this.setStatus('Match reset');
      }
    }
  }

  setStatus(text) {
    if (!text) return;
    this._statusText = String(text);
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => { this._statusText = ''; this.render(this.store.getState()); }, 2600);
    this.render(this.store.getState());
  }

  /* ── BOT LOGIC ───────────────────────────────────────── */

  _maybeBotMove(state) {
    if (state.phase === 'SETUP' || state.phase === 'GAME_END') return;

    // Respect trick-hold
    if (this._trickHold && Date.now() < (this._trickHold.until || 0)) {
      if (!this._botTimer) {
        const wait = Math.max(50, (this._trickHold.until || 0) - Date.now() + 50);
        this._botTimer = setTimeout(() => {
          this._botTimer = null; this._trickHold = null;
          this.render(this.store.getState());
          this._maybeBotMove(this.store.getState());
        }, wait);
      }
      return;
    }
    if (this._trickHold && Date.now() >= (this._trickHold.until || 0)) this._trickHold = null;

    // Bot-owned kingdom: auto-pick contract
    if (state.phase === 'KINGDOM_PICK_CONTRACT' && state.kingdomOwner && state.kingdomOwner !== 'south') {
      if (this._botTimer) return;
      const owner = state.kingdomOwner;
      const pick = chooseBotContract(state, owner);
      if (!pick) return;
      this._botTimer = setTimeout(() => {
        this._botTimer = null;
        this.dispatch({ type: 'PICK_CONTRACT', seat: owner, contractId: pick });
      }, 420);
      return;
    }

    if (state.phase === 'DOUBLING_DECISION') return;

    const seat = state.turn;
    if (!seat || seat === 'south') return;
    if (!(state.phase === 'TRICK_PLAY' || state.phase === 'TRIX_LAYOUT_PLAY')) return;
    if (this._botTimer) return;

    const view = {
      phase: state.phase,
      seat,
      hand: (state.hands[seat] || []).map(c => ({ suit: c.suit, rank: c.rank })),
      ledSuit: state.trick?.[0]?.card?.suit || null,
      contractId: state.currentContract?.id || null,
      layoutBySuit: JSON.parse(JSON.stringify(state.layoutBySuit || {})),
      difficulty: state.difficulty || 'moderate',
      currentTrick: (state.trick || []).map(t => ({ seat: t.seat, card: { suit: t.card.suit, rank: t.card.rank } })),
      playedCards: (state.playedCards || []).map(c => ({ suit: c.suit, rank: c.rank, seat: c.seat })),
      completedTricks: (state.completedTricks || []).map((t) => ({
        ledSuit: t.ledSuit,
        winner: t.winner,
        cards: (t.cards || []).map((x) => ({ seat: x.seat, card: { suit: x.card.suit, rank: x.card.rank } })),
      })),
      mode: state.mode || 'single',
      partner: partnerOf(seat),
    };

    const mv = chooseMove(view);
    if (!mv) return;

    this._botTimer = setTimeout(() => {
      this._botTimer = null;
      if (mv.type === 'PLAY_CARD') this.dispatch({ type: 'PLAY_CARD', seat, card: mv.card });
      else if (mv.type === 'LAYOUT_PLAY') this.dispatch({ type: 'LAYOUT_PLAY', seat, card: mv.card });
      else if (mv.type === 'LAYOUT_PASS') this.dispatch({ type: 'LAYOUT_PASS', seat });
    }, 450);
  }
}
