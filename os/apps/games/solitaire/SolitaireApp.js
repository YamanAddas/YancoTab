// SolitaireApp — Cosmic Atelier rewrite (S2).
// Replaces os/apps/games/SolitaireApp.js. Wires engine + Board + toolbar.
//
// S2 scope: render, click-to-move, double-click-to-foundation, new game,
// undo (single step), stock recycle. No drag, no animations cascade, no
// winnable-only, no solver — those land in S3/S5.

import { App } from '../../../core/App.js';
import { el } from '../../../utils/dom.js';
import { createStore } from '../shared/store.js';
import { dealFromSeed } from './engine/deal.js';
import {
  drawFromStock,
  moveWasteToTableau,
  moveWasteToFoundation,
  moveTableauToFoundation,
  moveFoundationToTableau,
  moveTableauToTableau,
  autoCollect,
} from './engine/moves.js';
import { canPlaceOnFoundation, canPlaceOnTableau, isValidRun } from './engine/rules.js';
import { SUIT_INDEX, isWon } from './engine/state.js';
import { isStuck, enumerateMoves } from './engine/hints.js';
import { solve } from './engine/solver.js';
import { dailySeed } from '../shared/rng.js';
import { Board } from './view/Board.js';
import { sfx } from '../../../ui/sfx.js';
import { shake, pulse } from '../../../ui/motion.js';
import {
  loadSave, saveGame, clearSave,
  loadStats, saveStats, applyGameResult,
} from './persistence.js';

const DEFAULT_OPTS = { drawCount: 1, scoring: 'standard' };

// Reducer dispatches to move functions. Each action is pure.
function reducer(state, action) {
  if (!state) return { state: action.payload, events: [{ type: 'reset' }] };

  const apply = (next, eventType) => {
    if (!next) return { state, events: [{ type: 'illegal' }] };
    return { state: next, events: [{ type: eventType }] };
  };

  switch (action.type) {
    case 'DRAW':            return apply(drawFromStock(state), 'draw');
    case 'WASTE_TO_FOUND':  return apply(moveWasteToFoundation(state), 'moveFound');
    case 'WASTE_TO_TABLEAU':return apply(moveWasteToTableau(state, action.col), 'moveTableau');
    case 'T_TO_FOUND':      return apply(moveTableauToFoundation(state, action.col), 'moveFound');
    case 'F_TO_T':          return apply(moveFoundationToTableau(state, action.suit, action.col), 'moveTableau');
    case 'T_TO_T':          return apply(moveTableauToTableau(state, action.from, action.idx, action.to), 'moveTableau');
    case 'AUTO_COLLECT':    return { state: autoCollect(state), events: [{ type: 'moveFound' }] };
    case 'RESET':           return { state: action.payload, events: [{ type: 'reset' }] };
    case 'UNDO':            return { state: action.payload, events: [{ type: 'undo' }] };
    case 'REDO':            return { state: action.payload, events: [{ type: 'redo' }] };
    default:                return { state, events: [] };
  }
}

export class SolitaireApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Solitaire', icon: '🂡', id: 'solitaire' };

    this.store = null;
    this.board = null;
    this.history = [];   // past states for undo
    this.future = [];    // future states for redo; cleared by any user action
    this.stats = { moves: 0, score: 0, time: 0 };
    this._timerId = null;
    this._startTs = 0;
  }

  async init(args = {}) {
    await super.init(args);
    this.root.classList.add('app-fullbleed');
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.root.style.height = '100%';
    this.render();
    this._bindKeyboard();
  }

  render() {
    this.root.innerHTML = '';

    // Ensure CSS included. If Settings loads global solitaire.css elsewhere this
    // is redundant; the browser dedupes.
    this._ensureStylesheet('css/cosmic/card.css');
    this._ensureStylesheet('css/cosmic/solitaire.css');

    // Board
    this.board = new Board({ onIntent: (kind, p) => this._onBoardIntent(kind, p) });

    // Toolbar
    this.toolbar = this._buildToolbar();

    // Layout
    const frame = el('div', { class: 'cosmic-solitaire-frame', style: 'position:relative; flex:1 1 auto; min-height:0;' });
    this.board.mount(frame);
    frame.append(this.toolbar);
    this.root.append(frame);

    // Resume if a save exists, otherwise new deal.
    const saved = loadSave(this.kernel);
    if (saved && saved.state && !isWon(saved.state)) {
      this._resumeGame(saved);
    } else {
      this._newGame();
    }
  }

  _ensureStylesheet(href) {
    if (document.querySelector(`link[href$="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }

  _buildToolbar() {
    const tb = el('div', { class: 'cosmic-toolbar' });
    const left = el('div', { class: 'cosmic-toolbar-group' });
    const right = el('div', { class: 'cosmic-toolbar-group' });

    this.statMoves = el('span', { class: 'cosmic-stat' });
    this.statScore = el('span', { class: 'cosmic-stat' });
    this.statTime  = el('span', { class: 'cosmic-stat' });
    left.append(this.statMoves, this.statScore, this.statTime);

    const newBtn = el('button', { class: 'cosmic-btn', type: 'button' }, 'New Game ▾');
    const undoBtn = el('button', { class: 'cosmic-btn', type: 'button' }, 'Undo');
    const redoBtn = el('button', { class: 'cosmic-btn', type: 'button' }, 'Redo');
    const hintBtn = el('button', { class: 'cosmic-btn', type: 'button' }, 'Hint');
    const autoBtn = el('button', { class: 'cosmic-btn', type: 'button' }, 'Auto-Collect');
    const statsBtn = el('button', { class: 'cosmic-btn', type: 'button' }, 'Stats');
    newBtn.addEventListener('click', (e) => this._showNewGameMenu(e.currentTarget));
    undoBtn.addEventListener('click', () => this._undo());
    redoBtn.addEventListener('click', () => this._redo());
    hintBtn.addEventListener('click', () => this._showHint());
    autoBtn.addEventListener('click', () => this._dispatch({ type: 'AUTO_COLLECT' }));
    statsBtn.addEventListener('click', () => this._showStats());
    right.append(hintBtn, undoBtn, redoBtn, autoBtn, statsBtn, newBtn);

    tb.append(left, right);
    return tb;
  }

  _newGame(opts = {}) {
    // Record an abandonment if leaving an unfinished game mid-flight.
    if (this.store) {
      const cur = this.store.getState();
      if (cur && !isWon(cur) && cur.moves > 0) {
        this._recordResult({ won: false, state: cur });
      }
    }
    const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
    const initial = dealFromSeed(seed, { ...DEFAULT_OPTS, ...opts });
    this.history = [];
    this.future = [];
    this.stats = { moves: 0, score: 0, time: 0 };
    this.store = createStore(reducer, initial);
    this.store.subscribe((state, events) => this._onStateChange(state, events));
    this.board.setState(initial);
    this.board.playDealAnimation();
    this._updateStats(initial);
    this._startTimer();
    this._persist(initial);
    sfx.play('swoosh');
  }

  _resumeGame(saved) {
    const s = saved.state;
    this.history = Array.isArray(saved.history) ? saved.history : [];
    this.future = [];
    this.stats = { moves: s.moves || 0, score: s.score || 0, time: saved.timeSec || 0 };
    this.store = createStore(reducer, s);
    this.store.subscribe((state, events) => this._onStateChange(state, events));
    this.board.setState(s);
    this._updateStats(s);
    // Resume the clock from saved elapsed seconds.
    this._startTs = Date.now() - (this.stats.time * 1000);
    if (this._timerId) clearInterval(this._timerId);
    this._timerId = setInterval(() => {
      this.stats.time = Math.floor((Date.now() - this._startTs) / 1000);
      this._renderTime();
    }, 500);
    sfx.play('tick');
  }

  _confirmAndNewGame() {
    if (this._confirmAbandon()) this._newGame();
  }

  _startTimer() {
    if (this._timerId) clearInterval(this._timerId);
    this._startTs = Date.now();
    this._timerId = setInterval(() => {
      this.stats.time = Math.floor((Date.now() - this._startTs) / 1000);
      this._renderTime();
    }, 500);
  }
  _stopTimer() { if (this._timerId) { clearInterval(this._timerId); this._timerId = null; } }

  _updateStats(state) {
    this.stats.moves = state.moves;
    this.stats.score = state.score;
    this.statMoves.innerHTML = `Moves <strong>${state.moves}</strong>`;
    this.statScore.innerHTML = `Score <strong>${state.score}</strong>`;
    this._renderTime();
  }
  _renderTime() {
    const s = this.stats.time;
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    this.statTime.innerHTML = `Time <strong>${mm}:${ss}</strong>`;
  }

  _dispatch(action) {
    if (!this.store) return;
    const prev = this.store.getState();
    const out = this.store.dispatch(action);
    const illegal = out.events?.some((e) => e.type === 'illegal');
    if (illegal) {
      sfx.play('fail');
      return false;
    }
    // Push prev to history only if state actually changed.
    // Any new user action clears the redo future — symmetric with most editors.
    if (out.state !== prev) {
      this.history.push(prev);
      this.future.length = 0;
    }
    return true;
  }

  _undo() {
    if (this.history.length === 0) { sfx.play('fail'); return; }
    const prev = this.history.pop();
    const cur = this.store.getState();
    this.future.push(cur);
    this.store.dispatch({ type: 'UNDO', payload: prev });
    sfx.play('tick');
  }

  _redo() {
    if (this.future.length === 0) { sfx.play('fail'); return; }
    const next = this.future.pop();
    const cur = this.store.getState();
    this.history.push(cur);
    this.store.dispatch({ type: 'REDO', payload: next });
    sfx.play('tick');
  }

  _onStateChange(state, events) {
    this.board.setState(state);
    this._updateStats(state);
    // Sounds per event
    if (events?.length) {
      const kinds = new Set(events.map((e) => e.type));
      if (kinds.has('moveFound')) sfx.play('chime');
      else if (kinds.has('moveTableau')) sfx.play('tick');
      else if (kinds.has('draw')) sfx.play('swoosh');
      else if (kinds.has('undo')) sfx.play('tick');
    }
    this._persist(state);
    if (isWon(state)) {
      this._stopTimer();
      sfx.play('win');
      this._recordResult({ won: true, state });
      clearSave(this.kernel);
      this._playWinCascade();
      this._showWin();
      return;
    }
    // Stuck detection: only offer prompt when truly no moves remain.
    if (state.moves > 0 && isStuck(state) && !this._stuckPromptOpen) {
      this._showStuckPrompt();
    }
  }

  _persist(state) {
    if (!this.kernel) return;
    const payload = { state, history: this.history, timeSec: this.stats.time };
    saveGame(this.kernel, payload);
  }

  _recordResult({ won, state }) {
    if (!this.kernel) return;
    const stats = loadStats(this.kernel);
    const next = applyGameResult(stats, {
      won,
      timeSec: this.stats.time,
      moves: state.moves,
      score: state.score,
    });
    saveStats(this.kernel, next);
  }

  _showStats() {
    const stats = loadStats(this.kernel);
    const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    const fmtTime = (s) => s == null ? '—' : `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

    const row = (label, val) => el('div', { class: 'cosmic-stat-row' }, [el('span', {}, label), el('strong', {}, val)]);
    const overlay = el('div', { class: 'cosmic-win-overlay' }, [
      el('div', { class: 'cosmic-win-card' }, [
        el('div', { class: 'cosmic-win-title' }, 'Statistics'),
        el('div', { class: 'cosmic-stats-grid' }, [
          row('Played',         String(stats.played)),
          row('Won',            String(stats.won)),
          row('Win %',          `${winPct}%`),
          row('Current streak', String(stats.currentStreak || 0)),
          row('Longest streak', String(stats.longestStreak || 0)),
          row('Best time',      fmtTime(stats.bestTimeSec)),
          row('Fewest moves',   stats.bestMoves == null ? '—' : String(stats.bestMoves)),
          row('Best score',     String(stats.bestScore || 0)),
        ]),
        el('button', { class: 'cosmic-btn', type: 'button', style: 'margin-top:16px;' }, 'Close'),
      ]),
    ]);
    overlay.querySelector('button').addEventListener('click', () => overlay.remove());
    this.root.append(overlay);
    setTimeout(() => overlay.classList.add('visible'), 20);
  }

  _showNewGameMenu(anchor) {
    // Dismiss any existing menu.
    this.root.querySelector('.cosmic-menu')?.remove();
    const mk = (label, onClick) => {
      const b = el('button', { class: 'cosmic-menu-item', type: 'button' }, label);
      b.addEventListener('click', () => { menu.remove(); onClick(); });
      return b;
    };
    const menu = el('div', { class: 'cosmic-menu' }, [
      mk('Random Deal', () => this._confirmAndNewGame()),
      mk('Winnable Random', () => this._startWinnable()),
      mk('Daily Deal', () => this._startDailyDeal()),
      mk('Custom Seed…', () => this._startCustomSeed()),
    ]);
    // Position above the toolbar anchor.
    const rect = anchor.getBoundingClientRect();
    const frameRect = this.root.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.right = `${Math.max(12, frameRect.right - rect.right)}px`;
    menu.style.bottom = `${frameRect.bottom - rect.top + 8}px`;
    this.root.append(menu);
    const dismiss = (e) => {
      if (menu.contains(e.target) || anchor.contains(e.target)) return;
      menu.remove();
      document.removeEventListener('pointerdown', dismiss, true);
    };
    setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);
  }

  _startWinnable() {
    if (!this._confirmAbandon()) return;
    // Bounded: 3 attempts × 8k nodes each ≤ ~600ms on a laptop. If no attempt
    // proves winnable in budget, fall through to the last seed anyway.
    const maxAttempts = 3;
    let chosenSeed = Math.floor(Math.random() * 0xffffffff);
    for (let i = 0; i < maxAttempts; i++) {
      const seed = Math.floor(Math.random() * 0xffffffff);
      const { result } = solve(dealFromSeed(seed, DEFAULT_OPTS), { budget: 8000 });
      chosenSeed = seed;
      if (result === 'win') break;
    }
    this._newGame({ seed: chosenSeed });
  }

  _startDailyDeal() {
    const seed = dailySeed();
    if (this._confirmAbandon()) this._newGame({ seed });
  }

  _startCustomSeed() {
    const raw = prompt('Enter a seed (number or text):');
    if (raw == null) return;
    const seed = /^\d+$/.test(raw.trim())
      ? +raw.trim()
      : hashString(raw);
    if (this._confirmAbandon()) this._newGame({ seed });
  }

  _confirmAbandon() {
    const cur = this.store?.getState();
    if (cur && !isWon(cur) && cur.moves > 0) {
      return confirm('Abandon this game and start a new deal? This counts as a loss.');
    }
    return true;
  }

  _showStuckPrompt() {
    this._stuckPromptOpen = true;
    const overlay = el('div', { class: 'cosmic-win-overlay' }, [
      el('div', { class: 'cosmic-win-card' }, [
        el('div', { class: 'cosmic-win-title' }, 'No moves left'),
        el('div', { class: 'cosmic-win-sub' }, 'The board is stuck. Undo the last move or start a new deal.'),
        el('div', { class: 'cosmic-stuck-actions', style: 'display:flex; gap:10px; justify-content:center; margin-top:16px;' }, [
          el('button', { class: 'cosmic-btn', type: 'button', 'data-act': 'undo' }, 'Undo'),
          el('button', { class: 'cosmic-btn', type: 'button', 'data-act': 'new' }, 'New Deal'),
        ]),
      ]),
    ]);
    const close = () => { overlay.remove(); this._stuckPromptOpen = false; };
    overlay.querySelector('[data-act="undo"]').addEventListener('click', () => { close(); this._undo(); });
    overlay.querySelector('[data-act="new"]').addEventListener('click', () => { close(); this._newGame(); });
    this.root.append(overlay);
    setTimeout(() => overlay.classList.add('visible'), 20);
  }

  _playWinCascade() {
    const host = this.board?.boardEl;
    if (!host) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const rect = host.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;z-index:9999;`;
    host.append(canvas);
    const ctx = canvas.getContext('2d');
    const colors = ['#00e5c1', '#6b5cff', '#ffd166', '#ff4757', '#ffffff'];
    const parts = [];
    for (let i = 0; i < 140; i++) {
      parts.push({
        x: rect.width * (0.2 + Math.random() * 0.6),
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 3,
        r: 3 + Math.random() * 4,
        a: Math.random() * Math.PI * 2,
        va: (Math.random() - 0.5) * 0.3,
        c: colors[i % colors.length],
      });
    }
    const start = performance.now();
    const DURATION = 3500;
    const tick = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.vy += 0.08;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - t / DURATION);
        ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        ctx.restore();
      }
      if (t < DURATION) requestAnimationFrame(tick);
      else canvas.remove();
    };
    requestAnimationFrame(tick);
  }

  _showWin() {
    const overlay = el('div', { class: 'cosmic-win-overlay' }, [
      el('div', { class: 'cosmic-win-card' }, [
        el('div', { class: 'cosmic-win-title' }, 'Victory'),
        el('div', { class: 'cosmic-win-sub' }, `Score ${this.stats.score} · Moves ${this.stats.moves} · Time ${this.statTime.textContent.replace('Time ', '')}`),
        el('button', { class: 'cosmic-btn', type: 'button', style: 'margin-top: 16px;' }, 'New Game'),
      ]),
    ]);
    overlay.querySelector('button').addEventListener('click', () => {
      overlay.remove();
      this._newGame();
    });
    this.root.append(overlay);
    setTimeout(() => overlay.classList.add('visible'), 20);
  }

  // ── Intent handler — Board click/dblclick → engine moves ──────
  _onBoardIntent(kind, payload) {
    if (kind === 'dragDrop') { this._handleDrop(payload.from, payload.to); return; }
    const { pile, index } = payload || {};
    const s = this.store.getState();
    if (kind === 'stockClick') {
      this._dispatch({ type: 'DRAW' });
      return;
    }
    if (kind === 'cardClick') {
      if (pile === 'stock') { this._dispatch({ type: 'DRAW' }); return; }

      // Single click on tableau top or waste → try foundation first, else no-op
      // (full drag-drop lands in S3). We DO auto-send to foundation when legal.
      if (pile === 'waste') {
        const card = s.waste[s.waste.length - 1];
        if (card && canPlaceOnFoundation(s.foundation, card)) {
          this._dispatch({ type: 'WASTE_TO_FOUND' });
          return;
        }
      }
      if (pile.startsWith('t')) {
        const col = +pile.slice(1);
        const tp = s.tableau[col];
        // Only act on the top card for now; middle-of-pile requires drag (S3).
        if (index !== tp.length - 1) { this._flashIllegal(pile, index); return; }
        const card = tp[tp.length - 1];
        if (card && canPlaceOnFoundation(s.foundation, card)) {
          this._dispatch({ type: 'T_TO_FOUND', col });
          return;
        }
      }
      if (pile.startsWith('f')) {
        // Click on a foundation top — highlight; no default move yet.
        return;
      }
      this._flashIllegal(pile, index);
      return;
    }
    if (kind === 'cardDblClick') {
      // Double-click: auto-collect as much as possible from the clicked pile's top.
      if (pile === 'waste') { this._tryAuto('waste'); return; }
      if (pile.startsWith('t')) { this._tryAuto(pile); return; }
    }
  }

  // Translate a drag drop (from pile+idx, to pile) into an engine action.
  _handleDrop(from, to) {
    if (!from || !to || from.pile === to) return;
    const s = this.store.getState();

    // Waste → Foundation / Tableau
    if (from.pile === 'waste') {
      if (to.startsWith('f')) { this._dispatch({ type: 'WASTE_TO_FOUND' }) || this._flashIllegal('waste'); return; }
      if (to.startsWith('t')) {
        const col = +to.slice(1);
        if (!this._dispatch({ type: 'WASTE_TO_TABLEAU', col })) this._flashIllegal('waste');
        return;
      }
    }

    // Tableau → Foundation / Tableau
    if (from.pile.startsWith('t')) {
      const fromCol = +from.pile.slice(1);
      const fromIdx = from.idx;
      const tp = s.tableau[fromCol];
      const isTop = fromIdx === tp.length - 1;

      if (to.startsWith('f')) {
        if (!isTop) { this._flashIllegal(from.pile, fromIdx); return; }
        if (!this._dispatch({ type: 'T_TO_FOUND', col: fromCol })) this._flashIllegal(from.pile, fromIdx);
        return;
      }
      if (to.startsWith('t')) {
        const toCol = +to.slice(1);
        if (!this._dispatch({ type: 'T_TO_T', from: fromCol, idx: fromIdx, to: toCol })) {
          this._flashIllegal(from.pile, fromIdx);
        }
        return;
      }
    }

    // Foundation → Tableau
    if (from.pile.startsWith('f') && to.startsWith('t')) {
      const sIdx = +from.pile.slice(1);
      const suit = ['H', 'D', 'C', 'S'][sIdx];
      const col = +to.slice(1);
      if (!this._dispatch({ type: 'F_TO_T', suit, col })) this._flashIllegal(from.pile);
      return;
    }

    this._flashIllegal(from.pile, from.idx);
  }

  // Attempt to send one legal top card to foundation; if it worked, try again
  // (handy for "rapid ascend" via double-click).
  _tryAuto(pileKey) {
    const s = this.store.getState();
    if (pileKey === 'waste') {
      const c = s.waste[s.waste.length - 1];
      if (c && canPlaceOnFoundation(s.foundation, c)) {
        this._dispatch({ type: 'WASTE_TO_FOUND' });
      } else { this._flashIllegal(pileKey); }
      return;
    }
    if (pileKey.startsWith('t')) {
      const col = +pileKey.slice(1);
      const tp = s.tableau[col];
      const c = tp[tp.length - 1];
      if (c && canPlaceOnFoundation(s.foundation, c)) {
        this._dispatch({ type: 'T_TO_FOUND', col });
      } else { this._flashIllegal(pileKey); }
    }
  }

  // Hint: show the highest-ranked productive move by pulsing its source and
  // destination. Falls back to DRAW only if nothing else is available.
  _showHint() {
    const s = this.store?.getState();
    if (!s) return;
    const moves = enumerateMoves(s);
    // Prefer a non-DRAW productive move; fall back to DRAW if that's all there is.
    const move = moves.find((m) => m.type !== 'DRAW') || moves[0];
    if (!move) { sfx.play('fail'); return; }

    const pick = (pile, idx) => {
      if (pile === 'stock') {
        return this.board.boardEl.querySelector('.cosmic-pile-slot[data-pile="stock"]')
          || this.board.boardEl.querySelector('.cosmic-card[data-pile="stock"]');
      }
      // Prefer a specific card-index when given, else top card, else slot.
      if (idx != null) {
        const c = this.board.boardEl.querySelector(
          `.cosmic-card[data-pile="${pile}"][data-index="${idx}"]`);
        if (c) return c;
      }
      const cards = this.board.boardEl.querySelectorAll(`.cosmic-card[data-pile="${pile}"]`);
      if (cards.length) return cards[cards.length - 1];
      return this.board.boardEl.querySelector(`.cosmic-pile-slot[data-pile="${pile}"]`);
    };

    let srcEl = null, dstEl = null;
    switch (move.type) {
      case 'DRAW':
        srcEl = pick('stock');
        break;
      case 'WASTE_TO_FOUND': {
        const c = s.waste[s.waste.length - 1];
        srcEl = pick('waste');
        dstEl = pick(`f${SUIT_INDEX[c.suit]}`);
        break;
      }
      case 'WASTE_TO_TABLEAU':
        srcEl = pick('waste');
        dstEl = pick(`t${move.col}`);
        break;
      case 'T_TO_FOUND': {
        const pile = s.tableau[move.col];
        const top = pile[pile.length - 1];
        srcEl = pick(`t${move.col}`, pile.length - 1);
        dstEl = pick(`f${SUIT_INDEX[top.suit]}`);
        break;
      }
      case 'T_TO_T':
        srcEl = pick(`t${move.from}`, move.idx);
        dstEl = pick(`t${move.to}`);
        break;
    }

    this._clearHintGlow();
    if (srcEl) srcEl.classList.add('cosmic-hint-src');
    if (dstEl && dstEl !== srcEl) dstEl.classList.add('cosmic-hint-dst');
    sfx.play('tick');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this._clearHintGlow(), 1200);
  }

  _clearHintGlow() {
    if (!this.board?.boardEl) return;
    this.board.boardEl.querySelectorAll('.cosmic-hint-src, .cosmic-hint-dst')
      .forEach((e) => e.classList.remove('cosmic-hint-src', 'cosmic-hint-dst'));
  }

  _flashIllegal(pile, idx) {
    sfx.play('fail');
    const el = this.board.boardEl.querySelector(`.cosmic-card[data-pile="${pile}"]${idx != null ? `[data-index="${idx}"]` : ''}`);
    if (el) shake(el);
  }

  _bindKeyboard() {
    this._onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.isComposing) return;
      // Only handle if our window is in focus (root is in the DOM)
      if (!this.root?.isConnected) return;
      switch (e.key.toLowerCase()) {
        case 'n': this._confirmAndNewGame(); e.preventDefault(); break;
        case 'u': this._undo(); e.preventDefault(); break;
        case 'r': this._redo(); e.preventDefault(); break;
        case 'h': this._showHint(); e.preventDefault(); break;
        case 'a': this._dispatch({ type: 'AUTO_COLLECT' }); e.preventDefault(); break;
        case ' ': this._dispatch({ type: 'DRAW' }); e.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  destroy() {
    this._stopTimer();
    if (this._onKey) window.removeEventListener('keydown', this._onKey);
    try { this.board?.destroy(); } catch {}
    super.destroy();
  }
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
