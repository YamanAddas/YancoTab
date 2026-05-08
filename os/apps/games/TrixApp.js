import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';
import { safeSave } from '../../utils/safeSave.js';
import { createStore } from './shared/store.js';
import { trixReducer } from './trix/trixReducer.js';
import { SEAT_NAMES, SEATS, partnerOf } from './trix/trixRules.js';
import { initMatch } from './trix/trixState.js';
import { chooseMove, chooseBotContract } from './trix/trixAI.js';
import {
  cardKey, CONTRACT_META,
  buildSetupScreen, buildHud, buildContractBlurb, buildScoreStrip,
  buildContractPickerBar, buildCenterTable, buildHandView,
  buildScoresheetModal, buildRulesModal, buildDoublingModal,
} from './trix/trixView.js';
import { TableShell } from './table/TableShell.js';
import { BanterDispatcher } from './table/banter.js';
import { createHandHistory } from './table/handHistory.js';
import TRIX_BANTER from './trix/trixBanter.js';
import TRIX_PRESETS from './trix/trixPresets.js';
import { buildTrixScoresheet, buildTrixHistoryEntry } from './trix/trixSalonView.js';
import { buildTrixFelt, buildTrixActions } from './trix/trixFeltView.js';

function css(href) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; return l; }

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
    this._stats = { gamesPlayed: 0, gamesWon: 0 };
  }

  async init(config = {}) {
    this._styleLinks = [css('css/cards.css'), css('css/trix.css'), css('css/table.css')];
    this._styleLinks.forEach(l => document.head.appendChild(l));
    this.root = el('div', { class: 'app-window trix-remake' });
    const setVh = () => { this.root.style.setProperty('--app-vh', `${(window.innerHeight || 0) * 0.01}px`); };
    setVh();
    const onR = () => { setVh(); this._syncAdaptivePrefs(); };
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

    this._loadPrefs();
    this.store = createStore(trixReducer, initMatch());

    // Salon shell — banter + presets + history
    this._history = createHandHistory(this.kernel, 'trix');
    this._banter = new BanterDispatcher({
      pack: TRIX_BANTER,
      onUpdate: () => {},
      getName: (seat) => SEAT_NAMES[seat] || seat,
      roleOf: (seat) => {
        if (seat === 'south') return 'you';
        // Partner mapping depends on the match mode at update time.
        // Default to 'opponent' for non-partner mode, partner-aware mapping
        // happens in the trixFeltView where we know mode.
        const mode = this.store?.getState?.()?.mode;
        if (mode === 'partners' && partnerOf('south') === seat) return 'partner';
        return 'opponent';
      },
    });
    this._shell = new TableShell({
      kernel: this.kernel,
      app: this,
      gameId: 'trix',
      gameLabel: 'Trix',
      presets: TRIX_PRESETS,
      history: this._history,
      banter: this._banter,
      renderFelt: (state) => this._renderFelt(state),
      getScoresheet: (state) => buildTrixScoresheet(state),
      renderSidePanel: (state) => buildTrixActions(this, state),
      onPresetApply: (preset) => preset.apply(this.dispatch.bind(this)),
      isSetupPhase: (state) => state?.phase === 'SETUP',
    });
    this._shell.mount(this.root);

    this._prevState = this.store.getState();
    this._unsub = this.store.subscribe((state, events = []) => {
      this._handleEvents(events, this._prevState, state);
      try { this._banter?.handleEvents(events); } catch (e) { console.warn('[TrixApp] banter dispatch failed', e); }
      this._appendHistoryFromEvents(events, state);
      this.render(state);
      this._maybeBotMove(state);
      this._prevState = state;
    });

    // Optional preset launch via spawn config
    if (config?.preset) {
      const p = TRIX_PRESETS.find((x) => x.id === config.preset);
      if (p) try { p.apply(this.dispatch.bind(this)); } catch {}
    }

    this._syncAdaptivePrefs({ force: true });
    this.render(this.store.getState());
  }

  destroy() {
    try { this._unsub?.(); } catch {}
    try { this._vhCleanup?.(); } catch {}
    try { this._shell?.destroy(); } catch {}
    this._vhCleanup = null;
    this._shell = null;
    this._banter = null;
    this._history = null;
    if (this._botTimer) { clearTimeout(this._botTimer); this._botTimer = null; }
    if (this._statusTimer) { clearTimeout(this._statusTimer); this._statusTimer = null; }
    if (this._animTimer) { clearTimeout(this._animTimer); this._animTimer = null; }
    for (const l of this._styleLinks) { try { l.remove(); } catch {} }
    this._styleLinks = []; super.destroy();
  }

  dispatch(action) { try { return this.store.dispatch(action); } catch (e) { console.error(e); } }

  /* ── Persistence ── */

  _loadPrefs() {
    try {
      const d = this.kernel.storage.load('yancotab_trix') || {};
      if (d.mode && ['single', 'partners'].includes(d.mode)) this._setupMode = d.mode;
      if (d.difficulty && ['easy', 'moderate', 'hard'].includes(d.difficulty)) this._setupDiff = d.difficulty;
      if (d.rules && ['classic', 'jawaker2025'].includes(d.rules)) this._setupRules = d.rules;
      this._stats = { gamesPlayed: d.gamesPlayed || 0, gamesWon: d.gamesWon || 0 };
    } catch {}
  }

  _savePrefs() {
    safeSave(this.kernel, 'yancotab_trix', {
      mode: this._setupMode, difficulty: this._setupDiff, rules: this._setupRules,
      gamesPlayed: this._stats.gamesPlayed, gamesWon: this._stats.gamesWon,
    }, 'Trix prefs');
  }

  _contractHint(id, state = null) {
    const meta = CONTRACT_META[id] || { icon: '🃏', title: '', goal: '', score: '' };
    const profile = state?.ruleProfile || this._setupRules || 'classic';
    if (id === 'queens' && profile === 'jawaker2025') {
      return { ...meta, score: '−25 each / doubled queens −50' };
    }
    return meta;
  }

  _playerName(seat) { return seat === 'south' ? 'You' : (SEAT_NAMES[seat] || seat); }
  _suitSymbol(s) { return s === 'spades' ? '♠' : s === 'hearts' ? '♥' : s === 'diamonds' ? '♦' : s === 'clubs' ? '♣' : '🃏'; }
  _rankLabel(r) { if (r === 1) return 'A'; if (r === 11) return 'J'; if (r === 12) return 'Q'; if (r === 13) return 'K'; return String(r); }
  _doubleCardLabel(k) {
    const [suit, rankStr] = String(k || '').split(':');
    const rank = Number(rankStr || 0);
    if (!suit || !rank) return String(k || '');
    return `${this._rankLabel(rank)}${this._suitSymbol(suit)}`;
  }

  _recommendedCompactScore() {
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    return (w > h) || h <= 740 || w <= 420;
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

  /* ── View delegates ── */

  _setupScreen() { return buildSetupScreen(this); }
  _hud(state) { return buildHud(this, state); }
  _contractBlurb(state) { return buildContractBlurb(this, state); }
  _scoreStrip(state) { return buildScoreStrip(this, state); }
  _contractPickerBar(state) { return buildContractPickerBar(this, state); }
  _centerTable(state) { return buildCenterTable(this, state); }
  _handView(state) { return buildHandView(this, state); }
  _scoresheetModal(state) { return buildScoresheetModal(this, state); }
  _rulesModal(state) { return buildRulesModal(this, state); }
  _doublingModal(state) { return buildDoublingModal(this, state); }

  /* ── RENDER ── */

  render(state) {
    try {
      this.root.dataset.scoreDensity = this._scoreCompact ? 'compact' : 'full';

      // Drop any prior modal overlays before re-rendering them
      const oldModals = this.root.querySelectorAll(':scope > .trix-modal-overlay, :scope > .trix-modal');
      oldModals.forEach((n) => { try { n.remove(); } catch {} });

      // Note: while phase === SETUP, the user's local _setup* picks
      // ARE the source of truth — they flow into the START_MATCH
      // dispatch on the Start button. Pulling them back FROM state on
      // every render here would clobber every click on the Mode /
      // Difficulty / Ruleset buttons, because the store keeps its
      // initial defaults until the match starts.

      this._shell?.update(state);

      // Modals (rules / scoresheet / doubling) live OUTSIDE the salon shell
      // as overlays attached to the app root, mirroring the pre-salon
      // behavior. The shell owns the rest of the chrome.
      const doubling = this._doublingModal(state);
      if (doubling) this.root.appendChild(doubling);
      const sheet = this._scoresheetModal(state);
      if (sheet) this.root.appendChild(sheet);
      const rules = this._rulesModal(state);
      if (rules) this.root.appendChild(rules);
    } catch (err) {
      console.error('[TrixApp] render crash', err);
      const msg = (err?.stack || err?.message || String(err));
      this.root.innerHTML = `<div style="padding:16px;color:#fff;font-family:monospace;white-space:pre-wrap;font-size:12px;">${String(msg).replace(/</g, '&lt;')}</div>`;
    }
  }

  /** Build the felt-slot DOM. Called by TableShell. */
  _renderFelt(state) {
    if (!state) return el('div');
    if (state.phase === 'SETUP') {
      return this._setupScreen();
    }
    return buildTrixFelt(this, state);
  }

  /** Append history entries when a deal completes. */
  _appendHistoryFromEvents(events, state) {
    if (!Array.isArray(events) || !this._history) return;
    for (const ev of events) {
      if (ev.type !== 'deal:end') continue;
      const entry = buildTrixHistoryEntry(state);
      if (entry) this._history.append(entry);
    }
  }

  /* ── EVENTS ── */

  _handleEvents(events, prev, next) {
    if (!events?.length) return;
    for (const ev of events) {
      if (ev.type === 'card:played') {
        this._anim = { zone: 'trick', seat: ev.seat, cardKey: cardKey(ev.card) };
        clearTimeout(this._animTimer);
        this._animTimer = setTimeout(() => { this._anim = null; this.render(this.store.getState()); }, 420);
        try { navigator.vibrate?.(15); } catch {}
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
        try { navigator.vibrate?.([10, 30, 10]); } catch {}
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
        this.setStatus(`${SEAT_NAMES[ev.seat] || '?'} out (#${ev.place})`);
      } else if (ev.type === 'error') {
        this.setStatus(`Error: ${ev.message}`);
      } else if (ev.type === 'match:reset') {
        this._scorePrefLocked = false;
        this._syncAdaptivePrefs({ force: true });
        this.setStatus('Match reset');
      }
    }
    if (next.phase === 'GAME_END' && prev.phase !== 'GAME_END') {
      this._stats.gamesPlayed++;
      if (next.mode === 'partners') {
        if ((next.teamScores?.A ?? 0) > (next.teamScores?.B ?? 0)) this._stats.gamesWon++;
      } else {
        const sorted = ['south', 'east', 'north', 'west'].sort((a, b) => (next.scores[b] || 0) - (next.scores[a] || 0));
        if (sorted[0] === 'south') this._stats.gamesWon++;
      }
      this._savePrefs();
    }
  }

  setStatus(text) {
    if (!text) return;
    this._statusText = String(text);
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => { this._statusText = ''; this.render(this.store.getState()); }, 2600);
    this.render(this.store.getState());
  }

  /* ── BOT LOGIC ── */

  _maybeBotMove(state) {
    if (state.phase === 'SETUP' || state.phase === 'GAME_END') return;

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
      phase: state.phase, seat,
      hand: (state.hands[seat] || []).map(c => ({ suit: c.suit, rank: c.rank })),
      ledSuit: state.trick?.[0]?.card?.suit || null,
      contractId: state.currentContract?.id || null,
      layoutBySuit: JSON.parse(JSON.stringify(state.layoutBySuit || {})),
      difficulty: state.difficulty || 'moderate',
      currentTrick: (state.trick || []).map(t => ({ seat: t.seat, card: { suit: t.card.suit, rank: t.card.rank } })),
      playedCards: (state.playedCards || []).map(c => ({ suit: c.suit, rank: c.rank, seat: c.seat })),
      completedTricks: (state.completedTricks || []).map((t) => ({
        ledSuit: t.ledSuit, winner: t.winner,
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
