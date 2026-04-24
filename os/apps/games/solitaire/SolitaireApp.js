// SolitaireApp — Cosmic Atelier. Thin shell: lifecycle + store wiring +
// toolbar. Board view, modals, intents, and hint glow live in siblings.

import { App } from '../../../core/App.js';
import { el } from '../../../utils/dom.js';
import { createStore } from '../shared/store.js';
import { dealFromSeed } from './engine/deal.js';
import { isWon } from './engine/state.js';
import { isStuck, isAutoFinishReady } from './engine/hints.js';
import { canPlaceOnFoundation } from './engine/rules.js';
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
import { haptic } from './ui/haptics.js';
import { mountPauseOverlay } from './ui/pause.js';
import { showStartScreen } from './ui/StartScreen.js';
import { bindSolitaireKeys } from './ui/keyboard.js';

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

    this._showStartScreen();
  }

  // First-open menu. Also reachable from the New Game ▾ dropdown. When a save
  // exists, "Continue" is primary and resumes without confirming abandon.
  _showStartScreen() {
    const saved = loadSave(this.kernel);
    const hasSave = !!(saved && saved.state && !isWon(saved.state));
    showStartScreen(this.root, { hasSave }, {
      onContinue:   () => hasSave && this._resumeGame(saved),
      onNewGame:    () => this._newGame(),
      onDaily:      () => this._newGame({ seed: dailySeed() }),
      onWinnable:   () => this._startWinnable(),
      onCustomSeed: () => this._startCustomSeed(),
      onStats:      () => this._showStats(),
      onSettings:   () => this._showSettings(),
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
    left.append(this.statMoves, this.statScore, this.statTime);

    const mk = (label) => el('button', { class: 'cosmic-btn', type: 'button' }, label);
    const newBtn = mk('New Game ▾');
    const undoBtn = mk('Undo');
    const redoBtn = mk('Redo');
    const hintBtn = mk('Hint');
    const autoBtn = mk('Auto-Finish');
    this._autoBtn = autoBtn;
    autoBtn.disabled = true;  // enabled only when board is solved-but-not-finished
    const pauseBtn = mk('Pause');
    this._pauseBtn = pauseBtn;
    const statsBtn = mk('Stats');
    const setBtn = mk('Settings');

    newBtn.addEventListener('click', (e) => this._showNewGameMenu(e.currentTarget));
    undoBtn.addEventListener('click', () => this._undo());
    redoBtn.addEventListener('click', () => this._redo());
    hintBtn.addEventListener('click', () => this._showHint());
    autoBtn.addEventListener('click', () => this._autoFinish());
    pauseBtn.addEventListener('click', () => this._togglePause());
    statsBtn.addEventListener('click', () => this._showStats());
    setBtn.addEventListener('click', () => this._showSettings());
    right.append(hintBtn, undoBtn, redoBtn, autoBtn, pauseBtn, statsBtn, setBtn, newBtn);

    tb.append(left, right);
    return tb;
  }

  _newGame(opts = {}) {
    if (this._paused) this._resume();
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

  _confirmAndNewGame() { if (this._confirmAbandon()) this._newGame(); }

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
    this._renderTime();
    if (this._autoBtn) this._autoBtn.disabled = !isAutoFinishReady(state);
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

  // Pause freezes the clock, overlays the board (no peeking in timed mode),
  // and swallows dispatches. _pausedAt lets _resume shift _startTs forward
  // by the paused duration so stats.time doesn't jump.
  _togglePause() {
    if (this._paused) return this._resume();
    this._paused = true;
    this._pausedAt = Date.now();
    this._stopTimer();
    if (this._pauseBtn) this._pauseBtn.textContent = 'Resume';
    this._pauseOverlay = mountPauseOverlay(this.board?.boardEl, () => this._resume());
  }
  _resume() {
    if (!this._paused) return;
    this._paused = false;
    if (this._pausedAt) this._startTs += (Date.now() - this._pausedAt);
    this._pausedAt = 0;
    if (this._pauseBtn) this._pauseBtn.textContent = 'Pause';
    this._pauseOverlay?.remove();
    this._pauseOverlay = null;
    // Re-arm directly — calling _startTimer would reset _startTs.
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
    // Any new user action clears the redo future — symmetric with most editors.
    if (out.state !== prev) {
      this.history.push(prev);
      this.future.length = 0;
      haptic('place');
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

  // Auto-Finish: when stock+waste are empty and every tableau card is face-up,
  // step through the remaining foundation sends on a 40ms cadence so the player
  // sees the cascade instead of an instant jump. Each step goes through the
  // normal reducer so it's individually undoable and plays its own SFX.
  _autoFinish() {
    if (this._autoFinishing) return;
    const s0 = this.store?.getState();
    if (!s0 || !isAutoFinishReady(s0)) { sfx.play('fail'); return; }
    this._autoFinishing = true;
    const tick = () => {
      const s = this.store.getState();
      if (isWon(s)) { this._autoFinishing = false; return; }
      // Pick any tableau top that fits on a foundation — order doesn't matter
      // when the board is fully face-up and stock is empty.
      for (let c = 0; c < 7; c++) {
        const pile = s.tableau[c];
        const top = pile[pile.length - 1];
        if (top && canPlaceOnFoundation(s.foundation, top)) {
          this._dispatch({ type: 'T_TO_FOUND', col: c });
          setTimeout(tick, 40);
          return;
        }
      }
      this._autoFinishing = false;  // nothing to do (shouldn't happen)
    };
    tick();
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
      haptic('win');
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
      scoring: state.scoring,  // cumulative mode rolls score into the persistent bank
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
      if (next.timed !== prev.timed) {
        // Toggling Relaxed on/off only changes the readout and whether the
        // interval runs — never the engine state or the current elapsed time.
        if (!next.timed) this._stopTimer();
        else if (!this._timerId && !this._paused) this._startTimer();
        this._renderTime();
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
      { label: 'Replay This Deal',onClick: () => this._replayDeal() },
      { label: 'Custom Seed…',    onClick: () => this._startCustomSeed() },
      { label: 'Main Menu',       onClick: () => this._showStartScreen() },
    ]);
  }

  // Reuse the current deal's seed → identical card order, fresh move log.
  // Useful when a promising line goes sideways and the player wants to try
  // again from turn 1 with full knowledge of the deal.
  _replayDeal() {
    const s = this.store?.getState();
    if (s && this._confirmAbandon()) this._newGame({ seed: s.seed });
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

  _bindKeyboard() { this._unbindKeys = bindSolitaireKeys(this); }

  destroy() {
    this._stopTimer();
    try { this._unbindKeys?.(); } catch {}
    try { this.board?.destroy(); } catch {}
    super.destroy();
  }
}
