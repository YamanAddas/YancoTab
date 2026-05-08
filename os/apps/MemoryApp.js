/**
 * MemoryApp — "Mirror" cosmic redesign (DOM rebuild).
 *
 * Replaces the full-canvas Neon Recall implementation with a thin
 * shell + pure engine + DOM view, applying the design's 3D flip
 * cards (transform-style: preserve-3d), violet-glowing card backs,
 * and 6 orb-style face fronts.
 *
 * Engine in os/apps/memory/engine.js. View in os/apps/memory/view.js.
 *
 * Storage:
 *   • New canonical key  yancotab_memory_v2
 *   • One-shot migration from yancotab_neon_recall (theme + bestScores
 *     + difficulty fields → bestTimeMs + bestComboStreak)
 *
 * Keyboard:
 *   • Arrow keys / WASD — move cursor across cells
 *   • Enter / Space — flip the cursor's card
 *   • Esc — close app
 *   • R — reset round
 *   • 1 / 2 / 3 — set difficulty (easy / standard / hard)
 */
import { App } from '../core/App.js';
import { el, cssLink } from '../utils/dom.js';
import { memoryReducer, initialState, DIFFICULTIES } from './memory/engine.js';
import { buildView, buildWinOverlay } from './memory/view.js';

const STORAGE_KEY = 'yancotab_memory_v2';
const LEGACY_KEY  = 'yancotab_neon_recall';
const RESOLVE_DELAY_MS = 1000;
const TIMER_TICK_MS = 1000;


export class MemoryApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { id: 'memory', name: 'Memory', icon: 'game:memory' };
    this._state = null;
    this._cursor = 0;
    this._resolveTimer = null;
    this._timerInterval = null;
    this._styleLinks = [];
    this._onKeyDown = null;
  }

  async init() {
    this._styleLinks = [cssLink('css/memory.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));
    this.root = el('div', { class: 'app-window app-memory' });

    this._state = this._loadInitialState();
    // Open straight into a fresh game — no separate menu screen
    this._state = memoryReducer(this._state, { type: 'NEW_GAME', now: Date.now() });

    this._onKeyDown = (e) => this._handleKey(e);
    this.root.tabIndex = 0;
    this.root.addEventListener('keydown', this._onKeyDown);

    this._render();
    this._startTimer();
    setTimeout(() => { try { this.root?.focus?.(); } catch {} }, 0);
  }

  destroy() {
    if (this._resolveTimer) { clearTimeout(this._resolveTimer); this._resolveTimer = null; }
    if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
    if (this._onKeyDown && this.root) {
      try { this.root.removeEventListener('keydown', this._onKeyDown); } catch {}
    }
    this._onKeyDown = null;
    for (const l of this._styleLinks) { try { l.remove(); } catch {} }
    this._styleLinks = [];
    super.destroy();
  }

  /* ── Reducer plumbing ──────────────────────────────────────── */

  dispatch(action) {
    const prev = this._state;
    const next = memoryReducer(prev, action);
    if (next === prev) return;
    this._state = next;

    // Auto-RESOLVE: when the engine locks (mismatched pair on display),
    // schedule a follow-up RESOLVE in 1s so the cards flip back.
    if (next.locked && !prev.locked) {
      if (this._resolveTimer) clearTimeout(this._resolveTimer);
      this._resolveTimer = setTimeout(() => {
        this._resolveTimer = null;
        this.dispatch({ type: 'RESOLVE' });
      }, RESOLVE_DELAY_MS);
    }

    this._save();
    this._render();
  }

  _render() {
    if (!this.root) return;
    const elapsedMs = this._state.startedAt
      ? (this._state.finishedAt || Date.now()) - this._state.startedAt
      : 0;
    this.root.innerHTML = '';
    this.root.appendChild(buildView({
      state: this._state,
      elapsedMs,
      dispatch: (a) => this.dispatch(a),
      onClose: () => this.close(),
    }));
    const overlay = buildWinOverlay(this._state, (a) => this.dispatch(a));
    if (overlay) this.root.appendChild(overlay);
  }

  _startTimer() {
    if (this._timerInterval) clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      // Only re-render to update the live wall-clock; reducer state
      // doesn't change.
      if (this._state?.phase === 'playing') this._render();
    }, TIMER_TICK_MS);
  }

  /* ── Keyboard ──────────────────────────────────────────────── */

  _handleKey(e) {
    const k = e.key;
    if (k === 'Escape') { this.close(); return; }
    if (k === 'r' || k === 'R') {
      e.preventDefault();
      this.dispatch({ type: 'NEW_GAME', now: Date.now() });
      return;
    }
    if (k === '1' || k === '2' || k === '3') {
      const map = { 1: 'easy', 2: 'standard', 3: 'hard' };
      this.dispatch({ type: 'SET_DIFFICULTY', difficulty: map[k], now: Date.now() });
      return;
    }
    const cfg = DIFFICULTIES[this._state.difficulty];
    if (!cfg) return;
    const cols = cfg.cols;
    const rows = cfg.rows;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      this.dispatch({ type: 'FLIP', idx: this._cursor, now: Date.now() });
      return;
    }
    const moveDelta = {
      ArrowLeft: -1, a: -1, A: -1,
      ArrowRight: 1, d: 1, D: 1,
      ArrowUp: -cols, w: -cols, W: -cols,
      ArrowDown: cols, s: cols, S: cols,
    };
    if (moveDelta[k] !== undefined) {
      e.preventDefault();
      const next = this._cursor + moveDelta[k];
      if (next < 0 || next >= cols * rows) return;
      // Constrain horizontal moves to the same row
      if ((moveDelta[k] === 1 || moveDelta[k] === -1) &&
          Math.floor(next / cols) !== Math.floor(this._cursor / cols)) return;
      this._cursor = next;
      this._render();
    }
  }

  /* ── Persistence ──────────────────────────────────────────── */

  _loadInitialState() {
    let stored = null;
    try { stored = this.kernel?.storage?.load?.(STORAGE_KEY) || null; } catch {}
    if (stored && typeof stored === 'object') {
      return memoryReducer(initialState(), { type: 'HYDRATE', state: stored });
    }
    // One-shot migration from the legacy Neon Recall key
    let legacy = null;
    try { legacy = this.kernel?.storage?.load?.(LEGACY_KEY); } catch {}
    if (legacy && typeof legacy === 'object') {
      const migrated = {
        difficulty: ['easy', 'standard', 'hard'].includes(legacy.difficulty) ? legacy.difficulty : 'standard',
        bestTimeMs: {
          easy:     null,
          standard: null,
          hard:     null,
        },
        bestComboStreak: 0,
      };
      // Legacy bestScores was per-difficulty seconds; convert to ms
      const legacyBest = legacy.bestScores || {};
      for (const k of ['easy', 'medium', 'hard']) {
        const v = legacyBest[k];
        if (Number.isFinite(v) && v > 0) {
          // medium → standard mapping
          const dst = k === 'medium' ? 'standard' : k;
          migrated.bestTimeMs[dst] = Math.round(v * 1000);
        }
      }
      const next = memoryReducer(initialState(), { type: 'HYDRATE', state: migrated });
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
      difficulty: state.difficulty,
      bestTimeMs: { ...state.bestTimeMs },
      bestComboStreak: state.bestComboStreak,
    };
  }
}
