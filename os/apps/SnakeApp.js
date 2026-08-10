/**
 * SnakeApp — "Comet" cosmic redesign (host shell).
 *
 * Engine + color constants live in os/apps/snake/snakeEngine.js.
 * Side-rail and HUD DOM builders live in os/apps/snake/snakeSideView.js.
 *
 * This file owns: app lifecycle, cosmic chrome (titlebar + 1fr|250px
 * stage), canvas mount, side-rail polling, and resize plumbing.
 *
 * The canvas engine renders the menu / settings / playing / gameover
 * states internally — it's untouched. The DOM chrome wraps it with
 * the design package's "Comet" look: Playfair italic title, oval
 * board container, side rail with score card + active power-ups +
 * personal-bests leaderboard + D-pad legend.
 */
import { App } from '../core/App.js';
import { el, cssLink } from '../utils/dom.js';
import { NeonSerpent, POWERUP_TYPES } from './snake/snakeEngine.js';
import { buildHud, buildSideRail } from './snake/snakeSideView.js';

const PERSONAL_BESTS_KEY = 'yancotab_snake_personal_bests';
const PERSONAL_BESTS_CAP = 5;
const SIDE_POLL_MS = 500;


export class SnakeApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = {
      name: 'Snake',
      id: 'snake',
      icon: 'game:snake',
    };
    this.game = null;
    this._sidePollInterval = null;
    this._lastEndedScore = 0;
  }

  async init() {
    this._styleLinks = [cssLink('css/snake.css')];
    this._styleLinks.forEach((l) => document.head.appendChild(l));

    this.root = el('div', { class: 'app-window app-snake' });

    // Build cosmic chrome — titlebar, stage, board-wrap (canvas mount),
    // side rail. The HUD bar lives above the canvas as a DOM overlay.
    this.titlebar = el('div', { class: 'snk-titlebar' }, [
      el('div', { class: 'snk-name' }, 'Snake'),
    ]);

    this.hudSlot = el('div', { class: 'snk-hud-slot' });

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'snk-canvas';
    this.canvas.tabIndex = 0;

    this.boardWrap = el('div', { class: 'snk-board-wrap' }, [
      this.hudSlot,
      el('div', { class: 'snk-board' }, [this.canvas]),
    ]);

    this.sideSlot = el('div', { class: 'snk-side-slot' });

    const stage = el('div', { class: 'snk-stage' }, [this.boardWrap, this.sideSlot]);
    const frame = el('div', { class: 'snk-app-frame' }, [this.titlebar, stage]);
    this.root.appendChild(frame);

    this.game = new NeonSerpent(this.kernel, this.canvas, () => this._checkResize());

    this._loadPersonalBests();
    this._renderSide();

    // Poll until the canvas's parent has size, then start the game loop
    this._pollStart();
  }

  _pollStart() {
    const r = this.canvas.parentElement?.getBoundingClientRect?.() || { width: 0, height: 0 };
    if (r.width >= 40 && r.height >= 40) {
      this._resize();
      this.game.start();
      this.canvas.focus();
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.canvas.parentElement);
      // Poll the side rail at 500ms — much cheaper than rebuilding on
      // every animation frame and lets the game state tick freely.
      this._sidePollInterval = setInterval(() => {
        this._capturePersonalBest();
        this._renderSide();
      }, SIDE_POLL_MS);
    } else {
      setTimeout(() => this._pollStart(), 50);
    }
  }

  _checkResize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    const w = Math.floor(r.width);
    const h = Math.floor(r.height);
    if (w < 40 || h < 40) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.game.resize(w, h);
    }
  }

  _resize() {
    this._checkResize();
    this.canvas.focus();
  }

  destroy() {
    if (this._ro) this._ro.disconnect();
    if (this._sidePollInterval) { clearInterval(this._sidePollInterval); this._sidePollInterval = null; }
    if (this.game) this.game.stop();
    for (const l of (this._styleLinks || [])) { try { l.remove(); } catch { /* best-effort */ } }
    this._styleLinks = [];
    super.destroy();
  }

  /**
   * Window-manager signal. Minimize pauses the sim (a hidden window
   * doesn't set document.hidden, so before this the snake kept moving —
   * and dying — at full rAF speed while minimized) and stops the render
   * loop to save CPU. Restore re-arms the loop but stays paused: the
   * pause overlay is showing, and the player resumes deliberately.
   */
  onSignal(signal) {
    const g = this.game;
    if (!g) return;
    if (signal === 'pause') {
      if (g.state === 'PLAYING') g.setPaused(true);
      // Only remember to restart a loop WE stopped — minimizing before
      // _pollStart has started the loop must not let resume race it
      // into a second concurrent loop.
      this._loopHeld = g.running;
      g.stop();
    } else if (signal === 'resume') {
      if (this._loopHeld && !g.running) g.start();
      this._loopHeld = false;
    }
  }

  /* ── Side-rail rendering ── */

  _renderSide() {
    if (!this.game) return;
    const state = this._snapshot();
    this.hudSlot.replaceChildren(buildHud(state));
    this.sideSlot.replaceChildren(buildSideRail(state));
  }

  _snapshot() {
    const g = this.game;
    const speedMult = g.speed > 0 ? Math.max(1, g.baseSpeed / g.speed) : 1;
    // active power-ups → array with remaining ms (frames × 16.67ms ≈ ms)
    const activePowers = [];
    for (const [id, frames] of Object.entries(g.activePowers || {})) {
      const meta = POWERUP_TYPES.find((p) => p.id === id);
      if (!meta) continue;
      activePowers.push({
        id,
        label: meta.label,
        remainingMs: Number.isFinite(frames) ? Math.floor(frames * 16.67) : Infinity,
      });
    }
    const elapsedMs = g.roundElapsedMs ? g.roundElapsedMs() : 0;
    return {
      score: g.score || 0,
      length: (g.snake || []).length,
      elapsedMs,
      speedMult,
      best: g.best || 0,
      foodsEaten: g.foodsEaten || 0,
      activePowers,
      personalBests: this._buildLeaderboard(),
    };
  }

  /** Merge the persistent personal-best list with the current run for the leaderboard. */
  _buildLeaderboard() {
    const persisted = Array.isArray(this._personalBests) ? this._personalBests.slice() : [];
    const all = persisted.slice();
    if (this.game?.state === 'PLAYING' && this.game.score > 0) {
      all.push({ score: this.game.score, label: 'this run', isCurrent: true });
    }
    all.sort((a, b) => (b.score || 0) - (a.score || 0));
    return all.slice(0, 6);
  }

  _loadPersonalBests() {
    try {
      const d = this.kernel.storage.load(PERSONAL_BESTS_KEY);
      this._personalBests = Array.isArray(d?.entries) ? d.entries.slice(0, PERSONAL_BESTS_CAP) : [];
    } catch {
      this._personalBests = [];
    }
  }

  /** Detect end of run + push the score to personal-bests if it's a top-N. */
  _capturePersonalBest() {
    if (!this.game) return;
    if (this.game.state !== 'GAMEOVER') {
      this._lastEndedScore = 0;
      return;
    }
    const finalScore = this.game.score;
    if (!finalScore || finalScore === this._lastEndedScore) return;
    this._lastEndedScore = finalScore;
    const arr = Array.isArray(this._personalBests) ? this._personalBests.slice() : [];
    arr.push({
      score: finalScore,
      label: this._runLabel(),
      ts: Date.now(),
    });
    arr.sort((a, b) => (b.score || 0) - (a.score || 0));
    while (arr.length > PERSONAL_BESTS_CAP) arr.pop();
    this._personalBests = arr;
    try { this.kernel.storage.save(PERSONAL_BESTS_KEY, { entries: arr }); } catch { /* best-effort */ }
  }

  _runLabel() {
    // Simple label for the entry — "today HH:MM" so the user can tell
    // their runs apart without going full username/leaderboard.
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `today ${hh}:${mm}`;
  }
}
