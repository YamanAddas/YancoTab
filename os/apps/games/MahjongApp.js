
import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';
import { MahjongGame } from './mahjong/mahjongGame.js';
import {
  buildLayoutPicker,
  buildMatchCounter,
  buildShuffleBar,
  buildSideRail,
} from './mahjong/mahjongSideView.js';
import { MahjongConstellation } from './mahjong/mahjongConstellation.js';
import { computeBoardLayout, countFreePairs } from './mahjong/mahjongLayout.js';
import { buildWinOverlay, buildStuckOverlay } from './mahjong/mahjongOverlays.js';

// MahjongApp host shell — engine in mahjong/mahjongGame, side rail in
// mahjongSideView, constellation overlay in mahjongConstellation, board
// fit math in mahjongLayout, win/stuck cards in mahjongOverlays.

export class MahjongApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'Mahjong', id: 'mahjong', icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#111827'/><stop offset='1' stop-color='#14b8a6'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><rect x='42' y='34' width='44' height='60' rx='10'/><path d='M54 50v28M64 46v32M74 50v28'/><path d='M52 78h26'/><circle cx='78' cy='42' r='4' fill='rgba(255,80,120,0.95)' stroke='none'/></g></svg>` };
    this.game = null;
    this.tileEls = new Map();
    this.timerInterval = null;
  }

  async init() {
    this.root = el('div', { class: 'app-window app-mahjong' });

    const link = el('link', { rel: 'stylesheet', href: 'css/mahjong.css' });
    this.root.appendChild(link);

    // Salon-style chrome — title pill + (no traffic lights) + tab pills
    // for layouts. Yaman dropped the macOS dots from the salon; same here.
    this._activeLayout = 'turtle';
    this.titlebar = el('div', { class: 'mj-titlebar' }, [
      el('div', { class: 'mj-name' }, 'Mahjong'),
      el('div', { class: 'mj-layout-tabs' }, []),  // populated in render
    ]);

    // Stage = board area on left, side rail on right (1fr | 240px)
    this.boardArea = el('div', { class: 'mj-board-area' });

    // Layout picker pill row at top of board
    this.layoutPickerSlot = el('div', { class: 'mj-layout-picker-slot' });

    // Match counter pill (top-right of board)
    this.matchCounterSlot = el('div', { class: 'mj-match-counter-slot' });

    // The actual tile grid (sized by fitBoard based on container size)
    this.boardEl = el('div', { class: 'mj-board' });
    this.boardInner = el('div', { class: 'mj-board-inner' });
    this.boardEl.appendChild(this.boardInner);

    // Constellation overlay sits inside boardInner so it shares coords
    this.constellation = new MahjongConstellation();
    this.constellation.mount(this.boardInner);

    // Shuffle bar (bottom of board) — replaces old mj-header buttons
    this.shuffleBarSlot = el('div', { class: 'mj-shuffle-bar-slot' });

    this.boardArea.append(
      this.layoutPickerSlot,
      this.matchCounterSlot,
      this.boardEl,
      this.shuffleBarSlot,
    );

    // Side rail (recent matches + stats + daily card)
    this.sideEl = el('aside', { class: 'mj-side-slot' });

    const stage = el('div', { class: 'mj-stage' }, [this.boardArea, this.sideEl]);
    const frame = el('div', { class: 'mj-app-frame' }, [this.titlebar, stage]);
    this.root.appendChild(frame);

    this.resizeObserver = new ResizeObserver(() => this.fitBoard());
    this.resizeObserver.observe(this.boardEl);

    // In-game UI state (resets per game)
    this._uiState = {
      recent: [],
      comboStreak: 0,
      hintsUsed: 0,
      shufflesUsed: 0,
    };
    this.HINT_LIMIT = 5;
    this.SHUFFLE_LIMIT = 3;

    this._loadStats();
    this.newGame();
    this._renderChrome();
  }

  /* ── Persistence ── */

  _loadStats() {
    try {
      const d = this.kernel.storage.load('yancotab_mahjong') || {};
      this.stats = {
        gamesPlayed: d.gamesPlayed || 0,
        gamesWon: d.gamesWon || 0,
        bestTime: d.bestTime || null,
        bestComboStreak: d.bestComboStreak || 0,
      };
    } catch {
      this.stats = { gamesPlayed: 0, gamesWon: 0, bestTime: null, bestComboStreak: 0 };
    }
  }

  _saveStats() {
    try { this.kernel.storage.save('yancotab_mahjong', this.stats); } catch {}
  }

  _formatTime(secs) {
    const m = Math.floor(secs / 60);
    return `${m}:${(secs % 60).toString().padStart(2, '0')}`;
  }

  /* ── Game lifecycle ── */

  newGame() {
    this.clearOverlay();
    this.game = new MahjongGame();

    // Guarantee the initial board is solvable (best effort: if no moves, reshuffle)
    let tries = 0;
    while (!this.game.hasValidMoves() && tries++ < 20) {
      this.game.shuffleRemaining();
      this.game.shufflesUsed = 0;
    }

    if (this.stats) { this.stats.gamesPlayed++; this._saveStats(); }

    // Reset in-game UI state
    this._uiState = {
      recent: [],
      comboStreak: 0,
      hintsUsed: 0,
      shufflesUsed: 0,
    };
    this.constellation?.clear();

    this.startTimer();
    this.renderBoard();
    this._renderChrome();
  }

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => this._renderChrome(), 1000);
  }
  stopTimer() { if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; } }

  /* ── Chrome render ── */

  /**
   * Re-render the layout picker, match counter, shuffle bar, and side
   * rail based on current game + UI state. Called after every action
   * (match, hint, shuffle, undo, timer tick).
   */
  _renderChrome() {
    if (!this.game) return;

    // Layout picker (only TURTLE wired in v1)
    this.layoutPickerSlot.replaceChildren(buildLayoutPicker(this._activeLayout, (id, disabledId) => {
      if (id === '__disabled') {
        this.kernel?.emit?.('toast', {
          type: 'info',
          message: `${(disabledId || '').toUpperCase()} layout · coming soon`,
        });
      }
    }));

    // Match counter — total pairs = total tiles / 2 (144 → 72)
    const totalPairs = Math.floor(this.game.tiles.length / 2);
    const matchedPairs = totalPairs - Math.floor(this.game.remaining().length / 2);
    this.matchCounterSlot.replaceChildren(buildMatchCounter(matchedPairs, totalPairs));

    // Shuffle bar — timer + free pairs + tiles left + 4 buttons
    const elapsed = this.game.elapsedSecs();
    const freePairs = this._countFreePairs();
    const tilesLeft = this.game.remaining().length;
    this.shuffleBarSlot.replaceChildren(buildShuffleBar({
      timeStr: this._formatTime(elapsed),
      freePairs,
      tilesLeft,
      comboStreak: this._uiState.comboStreak,
      handlers: {
        canUndo: !!this.game._lastMatch && !this.game.gameOver,
        onUndo: () => this.doUndo(),
        onHint: () => this.doHint(),
        onShuffle: () => this.doShuffle(),
        onNew: () => this.newGame(),
      },
    }));

    // Side rail
    const bestClearStr = this.stats?.bestTime != null ? this._formatTime(this.stats.bestTime) : null;
    this.sideEl.replaceChildren(buildSideRail({
      matched: matchedPairs,
      total: totalPairs,
      recent: this._uiState.recent,
      stats: {
        comboStreak: this._uiState.comboStreak,
        bestComboStreak: this.stats?.bestComboStreak || 0,
        bestClearStr,
        hintsUsed: this._uiState.hintsUsed,
        hintsLimit: this.HINT_LIMIT,
        shufflesUsed: this._uiState.shufflesUsed,
        shufflesLimit: this.SHUFFLE_LIMIT,
      },
    }));
  }

  _countFreePairs() {
    return countFreePairs(this.game);
  }

  /* ── Rendering ── */

  renderBoard() {
    // Remove only the tile DOM — preserve the constellation SVG which
    // also lives inside .mj-board-inner.
    for (const t of this.tileEls.values()) {
      try { t.remove(); } catch {}
    }
    this.tileEls.clear();

    this.game.tiles.forEach(tile => {
      if (tile.removed) return;
      const tileEl = this.createTileEl(tile);
      this.boardInner.appendChild(tileEl);
      this.tileEls.set(tile.id, tileEl);
    });

    this.fitBoard();
    this.updateFreeState();
  }

  createTileEl(tile) {
    const body = el('div', { class: 'mj-tile-body' }, [
      el('div', { class: 'mj-tile-icon' }, tile.icon),
      el('div', { class: 'mj-tile-label' }, tile.label),
    ]);

    const tileEl = el('div', {
      class: 'mj-tile',
      'data-id': tile.id,
      'data-suit': tile.suit,
      'data-rank': String(tile.rank),
      onclick: () => this.onTileClick(tile),
    }, [body]);

    return tileEl;
  }

  fitBoard() {
    if (!this.game || !this.boardEl) return;
    const rect = this.boardEl.getBoundingClientRect();
    const isPortrait = rect.height > rect.width;
    this.root.classList.toggle('mj-portrait', isPortrait);

    const layout = computeBoardLayout({
      tiles: this.game.tiles, // include removed for stable sizing
      width: rect.width,
      height: rect.height,
      isPortrait,
    });
    if (!layout) return;
    const { iconSize, labelSize, minX, minY, maxX, maxY, placed } = layout;

    this.boardInner.style.width = `${Math.ceil(maxX - minX)}px`;
    this.boardInner.style.height = `${Math.ceil(maxY - minY)}px`;

    for (const p of placed) {
      const tileEl = this.tileEls.get(p.id);
      if (!tileEl) continue;
      tileEl.style.left = `${p.x - minX}px`;
      tileEl.style.top = `${p.y - minY}px`;
      tileEl.style.setProperty('--mj-tile-w', `${p.w}px`);
      tileEl.style.setProperty('--mj-tile-h', `${p.h}px`);
      tileEl.style.zIndex = p.z;
      const iconEl = tileEl.querySelector('.mj-tile-icon');
      const lblEl = tileEl.querySelector('.mj-tile-label');
      if (iconEl) iconEl.style.fontSize = `${iconSize}px`;
      if (lblEl) lblEl.style.fontSize = `${labelSize}px`;
    }

    // Constellation overlay must follow the inner-board's actual size
    this.constellation?.resize(Math.ceil(maxX - minX), Math.ceil(maxY - minY));
  }

  updateFreeState() {
    if (!this.game) return;
    this.game.tiles.forEach(tile => {
      if (tile.removed) return;
      const tileEl = this.tileEls.get(tile.id);
      if (!tileEl) return;
      const free = this.game.isFree(tile);
      tileEl.classList.toggle('free', free);
      tileEl.classList.toggle('blocked', !free);
    });
  }

  /* ── Interaction ── */

  onTileClick(tile) {
    if (this.game.gameOver) return;
    const result = this.game.trySelect(tile);
    if (!result) return;

    // Clear previous highlights
    this.clearHighlights();

    switch (result.type) {
      case 'select':
        this.tileEls.get(tile.id)?.classList.add('selected');
        break;

      case 'deselect':
        break;

      case 'switch':
        this.tileEls.get(result.tile.id)?.classList.add('selected');
        break;

      case 'match':
        this._recordMatch(result.pair);
        this.animateRemove(result.pair);
        break;

      case 'win':
        this._recordMatch(result.pair);
        this.animateRemove(result.pair);
        this.stopTimer();
        setTimeout(() => this.showWin(), 400);
        break;
    }
    this._renderChrome();
  }

  /**
   * Push a matched pair to the recent buffer (newest-first), bump the
   * combo streak, draw a constellation curve. Score per pair is 8
   * (tile suit/rank doesn't affect score in classic Mahjong solitaire,
   * but we add a +2 bonus when the streak is ≥2 to reward chains).
   */
  _recordMatch(pair) {
    if (!Array.isArray(pair) || pair.length !== 2) return;
    this._uiState.comboStreak += 1;
    if (this.stats && this._uiState.comboStreak > (this.stats.bestComboStreak || 0)) {
      this.stats.bestComboStreak = this._uiState.comboStreak;
      this._saveStats();
    }
    const baseScore = 8;
    const comboBonus = this._uiState.comboStreak >= 2 ? 2 * (this._uiState.comboStreak - 1) : 0;
    const score = baseScore + comboBonus;
    const elapsed = this.game.elapsedSecs();
    const entry = {
      pair: pair.map((t) => ({
        suit: t.suit, rank: t.rank, icon: t.icon, label: t.label, matchGroup: t.matchGroup,
      })),
      score,
      time: this._formatTime(elapsed),
    };
    this._uiState.recent.unshift(entry);
    while (this._uiState.recent.length > 12) this._uiState.recent.pop();

    // Draw constellation curve between the two tile DOM nodes
    const elA = this.tileEls.get(pair[0].id);
    const elB = this.tileEls.get(pair[1].id);
    if (elA && elB) {
      try { this.constellation.drawBetween(elA, elB); } catch {}
    }
  }

  animateRemove(pair) {
    pair.forEach(t => {
      const tileEl = this.tileEls.get(t.id);
      if (tileEl) {
        tileEl.classList.add('removing');
        setTimeout(() => {
          tileEl.remove();
          this.tileEls.delete(t.id);
        }, 300);
      }
    });

    setTimeout(() => {
      this.updateFreeState();
      this._renderChrome();
      if (!this.game.gameOver && !this.game.hasValidMoves()) {
        this.showStuck();
      }
    }, 320);
  }

  clearHighlights() {
    this.tileEls.forEach(el => el.classList.remove('selected', 'hint'));
  }

  /* ── Actions ── */

  doHint() {
    if (this.game.gameOver) return;
    if (this._uiState.hintsUsed >= this.HINT_LIMIT) {
      this.kernel?.emit?.('toast', { type: 'info', message: 'No hints left this game' });
      return;
    }
    const pair = this.game.findHint();
    if (!pair) { this.showStuck(); return; }
    this.clearHighlights();
    this.game.selected = null;
    pair.forEach(t => this.tileEls.get(t.id)?.classList.add('hint'));
    this.game.hintsUsed++;
    this._uiState.hintsUsed++;
    this._uiState.comboStreak = 0;       // hints break combo
    setTimeout(() => {
      pair.forEach(t => this.tileEls.get(t.id)?.classList.remove('hint'));
    }, 2000);
    this._renderChrome();
  }

  doShuffle() {
    if (this.game.gameOver) return;
    if (this._uiState.shufflesUsed >= this.SHUFFLE_LIMIT) {
      this.kernel?.emit?.('toast', { type: 'info', message: 'No shuffles left this game' });
      return;
    }
    this.game.shuffleRemaining();
    this._uiState.shufflesUsed++;
    this._uiState.comboStreak = 0;       // shuffles break combo
    this.constellation?.clear();
    this.renderBoard();
    this._renderChrome();
  }

  doUndo() {
    const pair = this.game.undo();
    if (!pair) return;
    // Drop the most-recent recorded match + roll back the combo
    if (this._uiState.recent.length > 0) this._uiState.recent.shift();
    this._uiState.comboStreak = Math.max(0, this._uiState.comboStreak - 1);
    this.renderBoard();
    this._renderChrome();
  }

  /* ── Overlays ── */

  clearOverlay() {
    const existing = this.root.querySelector('.mj-overlay');
    if (existing) existing.remove();
  }

  showWin() {
    const s = this.game.elapsedSecs();
    if (this.stats) {
      this.stats.gamesWon++;
      if (this.stats.bestTime === null || s < this.stats.bestTime) this.stats.bestTime = s;
      this._saveStats();
    }
    this.root.appendChild(buildWinOverlay({
      moves: this.game.moves,
      elapsed: s,
      hintsUsed: this.game.hintsUsed,
      shufflesUsed: this.game.shufflesUsed,
      bestTime: this.stats?.bestTime,
      comboStreak: this.stats?.bestComboStreak || 0,
      onNew: () => this.newGame(),
    }));
  }

  showStuck() {
    if (this.game.gameOver) return;
    this.stopTimer();
    this.game.gameOver = true;
    this.root.appendChild(buildStuckOverlay({
      tilesLeft: this.game.remaining().length,
      onShuffle: () => {
        this.clearOverlay();
        this.game.gameOver = false;
        this.doShuffle();
        this.startTimer();
      },
      onNew: () => this.newGame(),
    }));
  }

  /* ── Cleanup ── */

  destroy() {
    this.stopTimer();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    try { this.constellation?.destroy(); } catch {}
    this.constellation = null;
    super.destroy();
  }
}
