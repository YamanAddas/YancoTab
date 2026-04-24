// SpiderSolitaireApp — Cosmic Atelier Spider. Thin shell: lifecycle + store
// wiring + toolbar. Board view, modals, intents, and hint glow live in
// siblings. Mirrors os/apps/games/solitaire/SolitaireApp.js so a developer
// who knows one knows the other.

import { App } from '../../../core/App.js';
import { el } from '../../../utils/dom.js';
import { createStore } from '../shared/store.js';
import { dealFromSeed } from './engine/deal.js';
import { isWon } from './engine/state.js';
import { isStuck } from './engine/hints.js';
import { Board } from './view/Board.js';
import { sfx } from '../../../ui/sfx.js';
import { shake } from '../../../ui/motion.js';
import {
  loadSave, saveGame, clearSave,
  loadStats, saveStats, applyGameResult,
  loadSettings, saveSettings, defaultSettings,
} from './persistence.js';
import { reducer, DEFAULT_OPTS } from './engine/reducer.js';
import { handleBoardIntent } from './intents.js';
import { pickBestHint, resolveMoveEls, applyHintGlow, clearHintGlow } from './ui/hintGlow.js';
import { showSettingsPanel } from './ui/SettingsPanel.js';
import { showStatsPanel } from './ui/StatsPanel.js';
import { showWinOverlay } from './ui/WinOverlay.js';
import { showStuckPrompt } from './ui/StuckPrompt.js';
import { showStartScreen } from './ui/StartScreen.js';
import { haptic } from './ui/haptics.js';
import { bindSpiderKeys } from './ui/keyboard.js';

export class SpiderSolitaireApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Spider', icon: '🕸', id: 'spider-solitaire' };

    this.store = null;
    this.board = null;
    this.history = [];
    this.future = [];
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
    this._ensureStylesheet('css/cosmic/spider.css');

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

    this._showStartScreen();
  }

  _showStartScreen() {
    const saved = loadSave(this.kernel);
    const hasSave = !!(saved && saved.state && !isWon(saved.state));
    showStartScreen(this.root, { hasSave, difficulty: this.settings.difficulty }, {
      onContinue: () => hasSave && this._resumeGame(saved),
      onNewGame:  (difficulty) => this._newGame({ difficulty }),
      onStats:    () => this._showStats(),
      onSettings: () => this._showSettings(),
    });
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
    this.statSuits = el('span', { class: 'cosmic-stat' });
    left.append(this.statMoves, this.statScore, this.statTime, this.statSuits);

    const mk = (label) => el('button', { class: 'cosmic-btn', type: 'button' }, label);
    const undoBtn = mk('Undo');
    const redoBtn = mk('Redo');
    const hintBtn = mk('Hint');
    const dealBtn = mk('Deal');
    const pauseBtn = mk('Pause');
    this._pauseBtn = pauseBtn;
    const statsBtn = mk('Stats');
    const setBtn = mk('Settings');
    const newBtn = mk('Main Menu');

    undoBtn.addEventListener('click', () => this._undo());
    redoBtn.addEventListener('click', () => this._redo());
    hintBtn.addEventListener('click', () => this._showHint());
    dealBtn.addEventListener('click', () => this._dispatch({ type: 'DEAL' }));
    pauseBtn.addEventListener('click', () => this._togglePause());
    statsBtn.addEventListener('click', () => this._showStats());
    setBtn.addEventListener('click', () => this._showSettings());
    newBtn.addEventListener('click', () => this._showStartScreen());
    right.append(hintBtn, undoBtn, redoBtn, dealBtn, pauseBtn, statsBtn, setBtn, newBtn);

    tb.append(left, right);
    return tb;
  }

  _newGame(opts = {}) {
    if (this._paused) this._resume();
    if (this.store) {
      const cur = this.store.getState();
      if (cur && !isWon(cur) && cur.moves > 0) this._recordResult({ won: false, state: cur });
    }
    const difficulty = opts.difficulty || this.settings.difficulty || 1;
    // Persist difficulty choice from the menu so re-opening remembers it.
    if (difficulty !== this.settings.difficulty) {
      this.settings = { ...this.settings, difficulty };
      saveSettings(this.kernel, this.settings);
    }
    const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
    const initial = dealFromSeed(seed, { ...DEFAULT_OPTS, difficulty });
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
    this._paused = false; this._pausedAt = 0;
    if (this._pauseBtn) this._pauseBtn.textContent = 'Pause';
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
    if (this.settings.timed) {
      this._timerId = setInterval(() => {
        if (this._paused) return;
        this.stats.time = Math.floor((Date.now() - this._startTs) / 1000);
        this._renderTime();
      }, 500);
    }
    this._renderTime();
    sfx.play('tick');
  }

  _confirmAndNewGame() {
    if (this._confirmAbandon()) this._newGame({ difficulty: this.settings.difficulty });
  }

  _startTimer() {
    if (this._timerId) clearInterval(this._timerId);
    this._startTs = Date.now();
    if (!this.settings.timed) { this._renderTime(); return; }
    this._timerId = setInterval(() => {
      if (this._paused) return;
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
    this.statSuits.innerHTML = `Suits <strong>${state.foundation.length}/8</strong>`;
    this._renderTime();
  }
  _renderTime() {
    if (!this.settings.timed) {
      this.statTime.style.display = 'none';
      return;
    }
    this.statTime.style.display = '';
    const s = this.stats.time;
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    this.statTime.innerHTML = `Time <strong>${mm}:${ss}</strong>`;
  }

  _togglePause() {
    if (this._paused) return this._resume();
    this._paused = true;
    this._pausedAt = Date.now();
    this._stopTimer();
    if (this._pauseBtn) this._pauseBtn.textContent = 'Resume';
    this._showStartScreen();
  }
  _resume() {
    if (!this._paused) return;
    this._paused = false;
    if (this._pausedAt) this._startTs += (Date.now() - this._pausedAt);
    this._pausedAt = 0;
    if (this._pauseBtn) this._pauseBtn.textContent = 'Pause';
    this.root.querySelector('.cosmic-start-overlay')?.remove();
    if (this.settings.timed && !this._timerId) {
      this._timerId = setInterval(() => {
        if (this._paused) return;
        this.stats.time = Math.floor((Date.now() - this._startTs) / 1000);
        this._renderTime();
      }, 500);
    }
  }

  _dispatch(action) {
    if (!this.store) return false;
    if (this._paused) return false;
    const prev = this.store.getState();
    const out = this.store.dispatch(action);
    const illegal = out.events?.some((e) => e.type === 'illegal');
    if (illegal) { sfx.play('fail'); haptic('invalid'); return false; }
    if (out.state !== prev) {
      this.history.push(prev);
      this.future.length = 0;
      haptic('place');
      this._persist(out.state);
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
      if (kinds.has('deal')) sfx.play('swoosh');
      else if (kinds.has('moveTableau')) sfx.play('tick');
      else if (kinds.has('undo')) sfx.play('tick');
    }
    this._persist(state);
    if (isWon(state)) {
      this._stopTimer();
      sfx.play('win');
      haptic('win');
      this._recordResult({ won: true, state });
      clearSave(this.kernel);
      showWinOverlay(this.root, {
        score: this.stats.score,
        moves: this.stats.moves,
        time: this.statTime.textContent.replace('Time ', ''),
        difficulty: state.difficulty,
      }, () => this._newGame({ difficulty: state.difficulty }));
      return;
    }
    if (state.moves > 0 && isStuck(state) && !this._stuckPromptOpen) {
      this._stuckPromptOpen = true;
      showStuckPrompt(this.root, {
        onUndo: () => this._undo(),
        onNew: () => this._newGame({ difficulty: state.difficulty }),
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
      difficulty: state.difficulty || 1,
    });
    saveStats(this.kernel, next);
  }

  _applyVisualSettings() {
    const root = this.board?.root;
    if (!root) return;
    root.classList.toggle('four-color', !!this.settings.fourColor);
    root.classList.toggle('left-handed', !!this.settings.leftHanded);
    for (const c of [...root.classList]) if (c.startsWith('back-')) root.classList.remove(c);
    root.classList.add(`back-${this.settings.cardBack || 'nebula'}`);
  }

  _showSettings() {
    const prev = this.settings;
    showSettingsPanel(this.root, prev, (next) => {
      const diffChanged = next.difficulty !== prev.difficulty;
      this.settings = next;
      saveSettings(this.kernel, next);
      this._applyVisualSettings();
      if (next.leftHanded !== prev.leftHanded) {
        this.board.setLayoutOpts({ leftHanded: next.leftHanded });
      }
      if (next.timed !== prev.timed) {
        if (!next.timed) this._stopTimer();
        else if (!this._timerId && !this._paused) this._startTimer();
        this._renderTime();
      }
      if (diffChanged && this.store && confirm('Difficulty changed. Start a new deal now?')) {
        this._newGame({ difficulty: next.difficulty });
      }
    });
  }

  _showStats() { showStatsPanel(this.root, loadStats(this.kernel)); }

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

  _bindKeyboard() { this._unbindKeys = bindSpiderKeys(this); }

  destroy() {
    this._stopTimer();
    try { this._unbindKeys?.(); } catch {}
    try { this.board?.destroy(); } catch {}
    super.destroy();
  }
}
