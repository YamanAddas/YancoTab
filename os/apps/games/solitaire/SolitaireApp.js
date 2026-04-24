// SolitaireApp — Cosmic Atelier. Thin shell: lifecycle + store wiring +
// toolbar. Board view, modals, intents, and hint glow live in siblings.

import { App } from '../../../core/App.js';
import { el } from '../../../utils/dom.js';
import { createStore } from '../shared/store.js';
import { dealFromSeed } from './engine/deal.js';
import { isWon } from './engine/state.js';
import { isStuck } from './engine/hints.js';
import { solve } from './engine/solver.js';
import { dailySeed } from '../shared/rng.js';
import { Board } from './view/Board.js';
import { sfx } from '../../../ui/sfx.js';
import { shake } from '../../../ui/motion.js';
import {
  loadSave, saveGame, clearSave,
  loadStats, saveStats, applyGameResult,
  loadSettings, saveSettings, defaultSettings,
} from './persistence.js';
import { reducer, DEFAULT_OPTS, hashString } from './engine/reducer.js';
import { handleBoardIntent } from './intents.js';
import { pickBestHint, resolveMoveEls, applyHintGlow, clearHintGlow } from './ui/hintGlow.js';
import { showSettingsPanel } from './ui/SettingsPanel.js';
import { showStatsPanel } from './ui/StatsPanel.js';
import { showWinOverlay } from './ui/WinOverlay.js';
import { showStuckPrompt } from './ui/StuckPrompt.js';
import { showNewGameMenu } from './ui/NewGameMenu.js';
import { playWinCascade } from './ui/winCascade.js';

export class SolitaireApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Solitaire', icon: '🂡', id: 'solitaire' };

    this.store = null;
    this.board = null;
    this.history = [];   // past states for undo
    this.future = [];    // future states for redo; cleared by any user action
    this.settings = defaultSettings();
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
    this._ensureStylesheet('css/cosmic/card.css');
    this._ensureStylesheet('css/cosmic/solitaire.css');

    this.settings = loadSettings(this.kernel);

    this.board = new Board({
      onIntent: (kind, p) => handleBoardIntent(this._intentCtx(), kind, p),
    });
    this.board.setLayoutOpts({ leftHanded: !!this.settings.leftHanded });
    this._applyVisualSettings();

    this.toolbar = this._buildToolbar();

    const frame = el('div', {
      class: 'cosmic-solitaire-frame',
      style: 'position:relative; flex:1 1 auto; min-height:0;',
    });
    this.board.mount(frame);
    frame.append(this.toolbar);
    this.root.append(frame);

    const saved = loadSave(this.kernel);
    if (saved && saved.state && !isWon(saved.state)) this._resumeGame(saved);
    else this._newGame();
  }

  _intentCtx() {
    return {
      getState: () => this.store.getState(),
      dispatch: (a) => this._dispatch(a),
      flashIllegal: (pile, idx) => this._flashIllegal(pile, idx),
    };
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

    const mk = (label) => el('button', { class: 'cosmic-btn', type: 'button' }, label);
    const newBtn = mk('New Game ▾');
    const undoBtn = mk('Undo');
    const redoBtn = mk('Redo');
    const hintBtn = mk('Hint');
    const autoBtn = mk('Auto-Collect');
    const statsBtn = mk('Stats');
    const setBtn = mk('Settings');

    newBtn.addEventListener('click', (e) => this._showNewGameMenu(e.currentTarget));
    undoBtn.addEventListener('click', () => this._undo());
    redoBtn.addEventListener('click', () => this._redo());
    hintBtn.addEventListener('click', () => this._showHint());
    autoBtn.addEventListener('click', () => this._dispatch({ type: 'AUTO_COLLECT' }));
    statsBtn.addEventListener('click', () => this._showStats());
    setBtn.addEventListener('click', () => this._showSettings());
    right.append(hintBtn, undoBtn, redoBtn, autoBtn, statsBtn, setBtn, newBtn);

    tb.append(left, right);
    return tb;
  }

  _newGame(opts = {}) {
    if (this.store) {
      const cur = this.store.getState();
      if (cur && !isWon(cur) && cur.moves > 0) this._recordResult({ won: false, state: cur });
    }
    const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
    const engineOpts = {
      ...DEFAULT_OPTS,
      drawCount: this.settings.drawCount === 3 ? 3 : 1,
      scoring: this.settings.scoring || 'standard',
      ...opts,
    };
    const initial = dealFromSeed(seed, engineOpts);
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
    this._startTs = Date.now() - (this.stats.time * 1000);
    if (this._timerId) clearInterval(this._timerId);
    this._timerId = setInterval(() => {
      this.stats.time = Math.floor((Date.now() - this._startTs) / 1000);
      this._renderTime();
    }, 500);
    sfx.play('tick');
  }

  _confirmAndNewGame() { if (this._confirmAbandon()) this._newGame(); }

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
    if (!this.store) return false;
    const prev = this.store.getState();
    const out = this.store.dispatch(action);
    const illegal = out.events?.some((e) => e.type === 'illegal');
    if (illegal) { sfx.play('fail'); return false; }
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
    this.future.push(this.store.getState());
    this.store.dispatch({ type: 'UNDO', payload: prev });
    sfx.play('tick');
  }

  _redo() {
    if (this.future.length === 0) { sfx.play('fail'); return; }
    const next = this.future.pop();
    this.history.push(this.store.getState());
    this.store.dispatch({ type: 'REDO', payload: next });
    sfx.play('tick');
  }

  _onStateChange(state, events) {
    this.board.setState(state);
    this._updateStats(state);
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
      playWinCascade(this.board?.boardEl);
      showWinOverlay(this.root, {
        score: this.stats.score,
        moves: this.stats.moves,
        time: this.statTime.textContent.replace('Time ', ''),
      }, () => this._newGame());
      return;
    }
    if (state.moves > 0 && isStuck(state) && !this._stuckPromptOpen) {
      this._stuckPromptOpen = true;
      showStuckPrompt(this.root, {
        onUndo: () => this._undo(),
        onNew: () => this._newGame(),
        onClose: () => { this._stuckPromptOpen = false; },
      });
    }
  }

  _persist(state) {
    if (!this.kernel) return;
    saveGame(this.kernel, { state, history: this.history, timeSec: this.stats.time });
  }

  _recordResult({ won, state }) {
    if (!this.kernel) return;
    const stats = loadStats(this.kernel);
    const next = applyGameResult(stats, {
      won, timeSec: this.stats.time, moves: state.moves, score: state.score,
    });
    saveStats(this.kernel, next);
  }

  // Visual-only settings (4-color, lefty, card back). Engine options take effect on next deal.
  _applyVisualSettings() {
    const root = this.board?.root;
    if (!root) return;
    root.classList.toggle('four-color', !!this.settings.fourColor);
    root.classList.toggle('left-handed', !!this.settings.leftHanded);
    // Mutually-exclusive card-back variant — strip any prior back-* then apply.
    for (const c of [...root.classList]) if (c.startsWith('back-')) root.classList.remove(c);
    root.classList.add(`back-${this.settings.cardBack || 'nebula'}`);
  }

  _showSettings() {
    const prev = this.settings;
    showSettingsPanel(this.root, prev, (next) => {
      const engineChanged = next.drawCount !== prev.drawCount || next.scoring !== prev.scoring;
      this.settings = next;
      saveSettings(this.kernel, next);
      this._applyVisualSettings();
      if (next.leftHanded !== prev.leftHanded) {
        this.board.setLayoutOpts({ leftHanded: next.leftHanded });
      }
      if (engineChanged && confirm('Draw or scoring changed. Start a new deal now?')) {
        this._newGame();
      }
    });
  }

  _showStats() { showStatsPanel(this.root, loadStats(this.kernel)); }

  _showNewGameMenu(anchor) {
    showNewGameMenu(this.root, anchor, [
      { label: 'Random Deal',     onClick: () => this._confirmAndNewGame() },
      { label: 'Winnable Random', onClick: () => this._startWinnable() },
      { label: 'Daily Deal',      onClick: () => this._startDailyDeal() },
      { label: 'Custom Seed…',    onClick: () => this._startCustomSeed() },
    ]);
  }

  _startWinnable() {
    if (!this._confirmAbandon()) return;
    // Bounded: 3 attempts × 8k nodes each ≤ ~600ms on a laptop. Falls through
    // to the last seed even if no attempt proves winnable in budget.
    const probeOpts = {
      drawCount: this.settings.drawCount === 3 ? 3 : 1,
      scoring: this.settings.scoring || 'standard',
    };
    let chosenSeed = Math.floor(Math.random() * 0xffffffff);
    for (let i = 0; i < 3; i++) {
      const seed = Math.floor(Math.random() * 0xffffffff);
      const { result } = solve(dealFromSeed(seed, probeOpts), { budget: 8000 });
      chosenSeed = seed;
      if (result === 'win') break;
    }
    this._newGame({ seed: chosenSeed });
  }

  _startDailyDeal() {
    if (this._confirmAbandon()) this._newGame({ seed: dailySeed() });
  }

  _startCustomSeed() {
    const raw = prompt('Enter a seed (number or text):');
    if (raw == null) return;
    const seed = /^\d+$/.test(raw.trim()) ? +raw.trim() : hashString(raw);
    if (this._confirmAbandon()) this._newGame({ seed });
  }

  _confirmAbandon() {
    const cur = this.store?.getState();
    if (cur && !isWon(cur) && cur.moves > 0) {
      return confirm('Abandon this game and start a new deal? This counts as a loss.');
    }
    return true;
  }

  _showHint() {
    const s = this.store?.getState();
    if (!s) return;
    const move = pickBestHint(s);
    if (!move) { sfx.play('fail'); return; }
    const { srcEl, dstEl } = resolveMoveEls(this.board.boardEl, s, move);
    applyHintGlow(this.board.boardEl, srcEl, dstEl);
    sfx.play('tick');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => clearHintGlow(this.board.boardEl), 1200);
  }

  _flashIllegal(pile, idx) {
    sfx.play('fail');
    const sel = `.cosmic-card[data-pile="${pile}"]${idx != null ? `[data-index="${idx}"]` : ''}`;
    const target = this.board.boardEl.querySelector(sel);
    if (target) shake(target);
  }

  _bindKeyboard() {
    this._onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.isComposing) return;
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
