/**
 * TicTacToeApp.js — Cosmic TicTacToe (DOM rebuild).
 *
 * Replaces the legacy 1200-line canvas implementation with a thin
 * shell that wires the engine + AI + view modules. All rendering is
 * DOM (no canvas) so the cosmic glass + clip-path design language
 * applies cleanly without re-implementing gradients in canvas.
 *
 * Storage:
 *   • Reads new key `yancotab_tictactoe_v1` (preferred)
 *   • One-shot migrates from the old `yancotab_neon_tactics` shape
 *     (theme/playerWins/aiWins/draws/streak/bestStreak) on first run
 *
 * Keyboard:
 *   • Arrows / WASD — move cursor across cells
 *   • Enter / Space — place at cursor
 *   • Esc — close app
 *   • R — reset round
 *   • 1 / 2 / 3 — set difficulty (when not mid-game)
 */
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { ttReducer, initialState } from './tictactoe/engine.js';
import { chooseMove } from './tictactoe/ai.js';
import { buildView } from './tictactoe/view.js';

const STORAGE_KEY = 'yancotab_tictactoe_v1';
const LEGACY_KEY = 'yancotab_neon_tactics';
const AI_THINK_MS_MIN = 320;
const AI_THINK_MS_MAX = 720;

function css(href) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  return l;
}

export class TicTacToeApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { id: 'tictactoe', name: 'Tic-Tac-Toe', icon: 'game:tictactoe' };
    this._state = null;
    this._activeTab = 'felt';
    this._cursor = 4;          // keyboard cursor cell index
    this._aiTimer = null;
    this._styleLinks = [];
    this._onKeyDown = null;
  }

  async init() {
    this._styleLinks = [css('css/tictactoe.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));
    this.root = el('div', { class: 'app-window app-tictactoe' });

    // Load + migrate persisted state
    this._state = this._loadInitialState();

    // Keyboard
    this._onKeyDown = (e) => this._handleKey(e);
    this.root.tabIndex = 0;
    this.root.addEventListener('keydown', this._onKeyDown);
    setTimeout(() => { try { this.root?.focus?.(); } catch {} }, 0);

    this._render();
    this._maybeAiMove();
  }

  destroy() {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    if (this._onKeyDown && this.root) {
      try { this.root.removeEventListener('keydown', this._onKeyDown); } catch {}
    }
    this._onKeyDown = null;
    for (const l of this._styleLinks) { try { l.remove(); } catch {} }
    this._styleLinks = [];
    super.destroy();
  }

  /* ── Internal state plumbing ───────────────────────────────── */

  dispatch(action) {
    const next = ttReducer(this._state, action);
    if (next === this._state) return;
    this._state = next;
    this._save();
    this._render();
    this._maybeAiMove();
  }

  _setTab(tab) {
    if (tab !== 'felt' && tab !== 'stats') return;
    if (this._activeTab === tab) return;
    this._activeTab = tab;
    this._render();
  }

  _setMode(mode) {
    this.dispatch({ type: 'SET_MODE', mode });
  }

  _render() {
    if (!this.root) return;
    this.root.innerHTML = '';
    const view = buildView({
      state: this._state,
      dispatch: (a) => this.dispatch(a),
      onClose: () => this.close(),
      activeTab: this._activeTab,
      onSetTab: (t) => this._setTab(t),
      onModeTab: (m) => this._setMode(m),
    });
    this.root.appendChild(view);
  }

  _maybeAiMove() {
    if (this._aiTimer) return;
    const s = this._state;
    if (!s || s.winner != null) return;
    if (s.mode !== 'ai' || s.current !== 'O') return;
    const delay = AI_THINK_MS_MIN + Math.floor(Math.random() * (AI_THINK_MS_MAX - AI_THINK_MS_MIN));
    this._aiTimer = setTimeout(() => {
      this._aiTimer = null;
      const idx = chooseMove(s.board, s.difficulty);
      if (idx >= 0) this.dispatch({ type: 'PLACE', idx });
    }, delay);
  }

  /* ── Keyboard ──────────────────────────────────────────────── */

  _handleKey(e) {
    const k = e.key;
    if (k === 'Escape') { this.close(); return; }
    if (this._activeTab !== 'felt') return;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      this.dispatch({ type: 'PLACE', idx: this._cursor });
      return;
    }
    if (k === 'r' || k === 'R') {
      e.preventDefault();
      this.dispatch({ type: 'RESET' });
      return;
    }
    if (k === '1' || k === '2' || k === '3') {
      const map = { 1: 'easy', 2: 'medium', 3: 'hard' };
      this.dispatch({ type: 'SET_DIFFICULTY', difficulty: map[k] });
      return;
    }
    const moveDelta = {
      ArrowLeft: -1, a: -1, A: -1,
      ArrowRight: 1, d: 1, D: 1,
      ArrowUp: -3, w: -3, W: -3,
      ArrowDown: 3, s: 3, S: 3,
    };
    if (moveDelta[k] !== undefined) {
      e.preventDefault();
      const next = this._cursor + moveDelta[k];
      if (next >= 0 && next < 9) {
        // Constrain horizontal moves to within row
        const row = Math.floor(this._cursor / 3);
        if ((k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D')
            && Math.floor(next / 3) !== row) return;
        this._cursor = next;
        this._render();
      }
    }
  }

  /* ── Persistence ──────────────────────────────────────────── */

  _loadInitialState() {
    let stored = null;
    try { stored = this.kernel?.storage?.load?.(STORAGE_KEY) || null; } catch {}
    if (stored && typeof stored === 'object') {
      return ttReducer(initialState(), { type: 'HYDRATE', state: stored });
    }
    // Migrate the legacy canvas key once
    let legacy = null;
    try { legacy = this.kernel?.storage?.load?.(LEGACY_KEY); } catch {}
    if (legacy && typeof legacy === 'object') {
      const migrated = {
        mode: 'ai',
        difficulty: legacy.difficulty || 'medium',
        score: {
          X: Number(legacy.playerWins || 0),
          O: Number(legacy.aiWins || 0),
          draws: Number(legacy.draws || 0),
          streak: Number(legacy.streak || 0),
          bestStreak: Number(legacy.bestStreak || 0),
        },
      };
      const next = ttReducer(initialState(), { type: 'HYDRATE', state: migrated });
      try { this.kernel?.storage?.save?.(STORAGE_KEY, this._serialize(next)); } catch {}
      return next;
    }
    return initialState();
  }

  _save() {
    try { this.kernel?.storage?.save?.(STORAGE_KEY, this._serialize(this._state)); } catch {}
  }

  _serialize(state) {
    return {
      mode: state.mode,
      difficulty: state.difficulty,
      score: { ...state.score },
    };
  }
}
