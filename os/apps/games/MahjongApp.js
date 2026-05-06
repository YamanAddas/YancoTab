
import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';

/**
 * MahjongApp.js — Mahjong Solitaire
 *
 * Classic tile-matching puzzle.  Arcade glass theme consistent with
 * Solitaire / Spider.  DOM-rendered, orientation-aware.
 */

/* ─── Tile Definitions ─── */

const SUITS = {
  circles: { icons: ['①','②','③','④','⑤','⑥','⑦','⑧','⑨'], labels: ['1','2','3','4','5','6','7','8','9'] },
  bamboo:  { icons: ['⑴','⑵','⑶','⑷','⑸','⑹','⑺','⑻','⑼'], labels: ['1','2','3','4','5','6','7','8','9'] },
  chars:   { icons: ['㊀','㊁','㊂','㊃','㊄','㊅','㊆','㊇','㊈'], labels: ['1','2','3','4','5','6','7','8','9'] },
  wind:    { icons: ['東','南','西','北'], labels: ['E','S','W','N'] },
  dragon:  { icons: ['中','發','□'], labels: ['中','發','白'] },
  flower:  { icons: ['梅','蘭','菊','竹'], labels: ['🌸','🌺','🌼','🎋'] },
  season:  { icons: ['春','夏','秋','冬'], labels: ['Sp','Su','Au','Wi'] },
};

function buildDeck() {
  const tiles = [];
  let id = 0;
  // 3 numbered suits × 9 ranks × 4 copies = 108
  for (const suit of ['circles', 'bamboo', 'chars']) {
    const s = SUITS[suit];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 4; c++) {
        tiles.push({ id: id++, suit, rank: r, icon: s.icons[r], label: s.labels[r], matchGroup: `${suit}-${r}` });
      }
    }
  }
  // Winds × 4 = 16
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const s = SUITS.wind;
      tiles.push({ id: id++, suit: 'wind', rank: r, icon: s.icons[r], label: s.labels[r], matchGroup: `wind-${r}` });
    }
  }
  // Dragons × 4 = 12
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const s = SUITS.dragon;
      tiles.push({ id: id++, suit: 'dragon', rank: r, icon: s.icons[r], label: s.labels[r], matchGroup: `dragon-${r}` });
    }
  }
  // Flowers (4 unique, each matches any other flower) = 4
  for (let r = 0; r < 4; r++) {
    const s = SUITS.flower;
    tiles.push({ id: id++, suit: 'flower', rank: r, icon: s.icons[r], label: s.labels[r], matchGroup: 'flower' });
  }
  // Seasons (4 unique, each matches any other season) = 4
  for (let r = 0; r < 4; r++) {
    const s = SUITS.season;
    tiles.push({ id: id++, suit: 'season', rank: r, icon: s.icons[r], label: s.labels[r], matchGroup: 'season' });
  }
  return tiles; // 144 total
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ─── Classic "Turtle" Layout ───
 *
 * Coordinates: col (x), row (y), layer (z).
 * Each tile occupies a 2×2 cell footprint.
 * The layout is defined as a list of (col, row, layer) positions.
 */

function turtleLayout() {
  const positions = [];

  // Layer 0 — base — 109 tiles (108 grid + 1 tail wing)
  // Symmetric diamond centered at col 11, row 7
  const L0 = [
    // Row 0: 14 tiles  (cols -2 to 24)
    ...[...Array(14)].map((_,i) => [i*2 - 2, 0]),
    // Row 1: 12 tiles  (cols 0 to 22, inset)
    ...[...Array(12)].map((_,i) => [i*2, 2]),
    // Row 2: 14 tiles  (cols -2 to 24)
    ...[...Array(14)].map((_,i) => [i*2 - 2, 4]),
    // Row 3: 14 tiles  (cols -2 to 24)
    ...[...Array(14)].map((_,i) => [i*2 - 2, 6]),
    // Row 4: 14 tiles  (cols -2 to 24)
    ...[...Array(14)].map((_,i) => [i*2 - 2, 8]),
    // Row 5: 14 tiles  (cols -2 to 24)
    ...[...Array(14)].map((_,i) => [i*2 - 2, 10]),
    // Row 6: 12 tiles  (cols 0 to 22, inset)
    ...[...Array(12)].map((_,i) => [i*2, 12]),
    // Row 7: 14 tiles  (cols -2 to 24)
    ...[...Array(14)].map((_,i) => [i*2 - 2, 14]),
  ];
  L0.forEach(([c,r]) => positions.push({ col: c, row: r, layer: 0 }));
  // Tail wing — single right extension
  positions.push({ col: 26, row: 14, layer: 0 });
  // L0 total: 109

  // Layer 1 — 6×4 centered — 24 tiles
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      positions.push({ col: c*2+6, row: r*2+4, layer: 1 });
    }
  }

  // Layer 2 — 4×2 centered — 8 tiles
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      positions.push({ col: c*2+8, row: r*2+6, layer: 2 });
    }
  }

  // Layer 3 — 2×1 centered — 2 tiles
  positions.push({ col: 10, row: 7, layer: 3 });
  positions.push({ col: 12, row: 7, layer: 3 });

  // Cap tile (layer 4) — 1 tile
  positions.push({ col: 11, row: 7, layer: 4 });

  // Total: 109 + 24 + 8 + 2 + 1 = 144
  return positions;
}

function getLayout() {
  return turtleLayout();
}

/* ─── Game Logic ─── */

class MahjongGame {
  constructor() {
    this.reset();
  }

  reset() {
    const deck = buildDeck();
    shuffle(deck);
    const layout = getLayout();

    this.tiles = layout.map((pos, i) => ({
      ...deck[i],
      col: pos.col,
      row: pos.row,
      layer: pos.layer,
      removed: false,
    }));

    this.selected = null;
    this.moves = 0;
    this.startTime = Date.now();
    this.hintsUsed = 0;
    this.shufflesUsed = 0;
    this.gameOver = false;
  }

  remaining() { return this.tiles.filter(t => !t.removed); }

  isFree(tile) {
    if (tile.removed) return false;
    const alive = this.remaining();

    // Blocked from above? Any tile on a higher layer overlapping this tile's 2×2 footprint.
    const hasAbove = alive.some(t =>
      t.layer > tile.layer &&
      t.col < tile.col + 2 && t.col + 2 > tile.col &&
      t.row < tile.row + 2 && t.row + 2 > tile.row
    );
    if (hasAbove) return false;

    // Blocked on both left AND right on the same layer?
    const hasLeft = alive.some(t =>
      t !== tile && t.layer === tile.layer &&
      t.row < tile.row + 2 && t.row + 2 > tile.row &&
      t.col + 2 === tile.col
    );
    const hasRight = alive.some(t =>
      t !== tile && t.layer === tile.layer &&
      t.row < tile.row + 2 && t.row + 2 > tile.row &&
      t.col === tile.col + 2
    );
    return !(hasLeft && hasRight);
  }

  canMatch(a, b) {
    if (a.id === b.id) return false;
    if (!this.isFree(a) || !this.isFree(b)) return false;
    return a.matchGroup === b.matchGroup;
  }

  trySelect(tile) {
    if (this.gameOver || tile.removed) return null;
    if (!this.isFree(tile)) return null;

    if (!this.selected) {
      this.selected = tile;
      return { type: 'select', tile };
    }

    if (this.selected.id === tile.id) {
      this.selected = null;
      return { type: 'deselect', tile };
    }

    if (this.canMatch(this.selected, tile)) {
      const pair = [this.selected, tile];
      this._lastMatch = pair;
      pair.forEach(t => t.removed = true);
      this.selected = null;
      this.moves++;

      if (this.remaining().length === 0) {
        this.gameOver = true;
        return { type: 'win', pair };
      }
      return { type: 'match', pair };
    }

    // Different tile, no match — switch selection
    const prev = this.selected;
    this.selected = tile;
    return { type: 'switch', prev, tile };
  }

  undo() {
    if (!this._lastMatch || this.gameOver) return null;
    const pair = this._lastMatch;
    pair.forEach(t => t.removed = false);
    this._lastMatch = null;
    this.moves = Math.max(0, this.moves - 1);
    return pair;
  }

  findHint() {
    const free = this.remaining().filter(t => this.isFree(t));
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        if (free[i].matchGroup === free[j].matchGroup) return [free[i], free[j]];
      }
    }
    return null;
  }

  hasValidMoves() { return !!this.findHint(); }

  shuffleRemaining() {
    const alive = this.remaining();
    const positions = alive.map(t => ({ col: t.col, row: t.row, layer: t.layer }));
    const tileData = alive.map(t => ({ suit: t.suit, rank: t.rank, icon: t.icon, label: t.label, matchGroup: t.matchGroup }));
    shuffle(tileData);
    alive.forEach((t, i) => {
      Object.assign(t, tileData[i]);
      t.col = positions[i].col;
      t.row = positions[i].row;
      t.layer = positions[i].layer;
    });
    this.selected = null;
    this.shufflesUsed++;
  }

  elapsedSecs() { return Math.floor((Date.now() - this.startTime) / 1000); }
}


/* ─── App ─── */

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

    // Header
    this.undoBtn = el('button', { class: 'mj-hdr-btn disabled', onclick: () => this.doUndo() }, 'Undo');
    this.hintBtn = el('button', { class: 'mj-hdr-btn', onclick: () => this.doHint() }, 'Hint');
    this.shuffleBtn = el('button', { class: 'mj-hdr-btn', onclick: () => this.doShuffle() }, 'Shuffle');
    const newBtn = el('button', { class: 'mj-hdr-btn', onclick: () => this.newGame() }, 'New');

    const header = el('div', { class: 'mj-header' }, [
      el('div', { class: 'mj-header-left' }, [this.undoBtn, this.hintBtn, this.shuffleBtn, newBtn]),
      el('div', { class: 'mj-title' }, 'Mahjong'),
      el('button', { class: 'mj-close', onclick: () => this.close() }, '×'),
    ]);

    // Stats
    this.tilesEl = el('span', {}, 'Tiles 144');
    this.movesEl = el('span', {}, 'Moves 0');
    this.timerEl = el('span', {}, 'Time 0:00');
    const stats = el('div', { class: 'mj-stats' }, [this.tilesEl, this.movesEl, this.timerEl]);

    // Board
    this.boardEl = el('div', { class: 'mj-board' });
    this.boardInner = el('div', { class: 'mj-board-inner' });
    this.boardEl.appendChild(this.boardInner);

    this.root.append(header, stats, this.boardEl);

    this.resizeObserver = new ResizeObserver(() => this.fitBoard());
    this.resizeObserver.observe(this.boardEl);

    this._loadStats();
    this.newGame();
  }

  /* ── Persistence ── */

  _loadStats() {
    try {
      const d = this.kernel.storage.load('yancotab_mahjong') || {};
      this.stats = {
        gamesPlayed: d.gamesPlayed || 0,
        gamesWon: d.gamesWon || 0,
        bestTime: d.bestTime || null,
      };
    } catch { this.stats = { gamesPlayed: 0, gamesWon: 0, bestTime: null }; }
  }

  _saveStats() {
    try { this.kernel.storage.save('yancotab_mahjong', this.stats); } catch {}
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

    this.undoBtn?.classList.add('disabled');
    this.startTimer();
    this.renderBoard();
    this.updateStats();
  }

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => this.updateTimer(), 1000);
  }
  stopTimer() { if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; } }
  updateTimer() {
    if (!this.game) return;
    const s = this.game.elapsedSecs();
    const m = Math.floor(s / 60);
    this.timerEl.textContent = `Time ${m}:${(s%60).toString().padStart(2,'0')}`;
  }
  updateStats() {
    if (!this.game) return;
    this.tilesEl.textContent = `Tiles ${this.game.remaining().length}`;
    this.movesEl.textContent = `Moves ${this.game.moves}`;
    this.updateTimer();
  }

  /* ── Rendering ── */

  renderBoard() {
    this.boardInner.innerHTML = '';
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
      onclick: () => this.onTileClick(tile),
    }, [body]);

    return tileEl;
  }

  fitBoard() {
    if (!this.game || !this.boardEl) return;
    const rect = this.boardEl.getBoundingClientRect();
    const pad = 8;
    const aW = rect.width - pad * 2;
    const aH = rect.height - pad * 2;
    if (aW <= 0 || aH <= 0) return;
    const isPortrait = rect.height > rect.width;
    this.root.classList.toggle('mj-portrait', isPortrait);

    // Compute layout extents
    const alive = this.game.tiles; // include removed for stable sizing
    let maxCol = 0, maxRow = 0, maxLayer = 0;
    alive.forEach(t => {
      if (t.col + 2 > maxCol) maxCol = t.col + 2;
      if (t.row + 2 > maxRow) maxRow = t.row + 2;
      if (t.layer > maxLayer) maxLayer = t.layer;
    });

    // Normalise negative cols
    let minCol = Infinity;
    alive.forEach(t => { if (t.col < minCol) minCol = t.col; });
    const colOffset = minCol < 0 ? -minCol : 0;
    maxCol += colOffset;

    // Layer offset (px) — 3D effect
    const layerPx = isPortrait ? 2 : 3;
    const totalLayerShift = maxLayer * layerPx;

    // Tile cell size (portrait uses rotated board, so width/height are swapped for fitting)
    const fitW = isPortrait ? aH : aW;
    const fitH = isPortrait ? aW : aH;
    const cellW = (fitW - totalLayerShift) / maxCol;
    const cellH = (fitH - totalLayerShift) / maxRow;
    const cell = Math.max(4, Math.min(cellW, cellH));

    const tileW = cell * 2;
    const tileH = cell * 2;

    const iconSize = Math.max(8, tileW * 0.38);
    const labelSize = Math.max(6, tileW * 0.22);
    const placedTiles = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    this.game.tiles.forEach(tile => {
      const tileEl = this.tileEls.get(tile.id);
      if (!tileEl) return;
      const x = (tile.col + colOffset) * cell + tile.layer * layerPx;
      const y = tile.row * cell + tile.layer * layerPx;
      const w = tileW - 2;
      const h = tileH - 2;
      placedTiles.push({ tileEl, x, y, w, h, z: tile.layer * 100 + tile.row * 2 + 1 });
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    });

    if (!placedTiles.length) return;

    this.boardInner.style.width = `${Math.ceil(maxX - minX)}px`;
    this.boardInner.style.height = `${Math.ceil(maxY - minY)}px`;

    placedTiles.forEach(({ tileEl, x, y, w, h, z }) => {
      tileEl.style.left = `${x - minX}px`;
      tileEl.style.top = `${y - minY}px`;
      tileEl.style.setProperty('--mj-tile-w', `${w}px`);
      tileEl.style.setProperty('--mj-tile-h', `${h}px`);
      tileEl.style.zIndex = z;

      const iconEl = tileEl.querySelector('.mj-tile-icon');
      const lblEl = tileEl.querySelector('.mj-tile-label');
      if (iconEl) iconEl.style.fontSize = `${iconSize}px`;
      if (lblEl) lblEl.style.fontSize = `${labelSize}px`;
    });
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
        this.animateRemove(result.pair);
        this.undoBtn.classList.remove('disabled');
        break;

      case 'win':
        this.animateRemove(result.pair);
        this.undoBtn.classList.add('disabled');
        this.stopTimer();
        setTimeout(() => this.showWin(), 400);
        break;
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
      this.updateStats();
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
    const pair = this.game.findHint();
    if (!pair) { this.showStuck(); return; }
    this.clearHighlights();
    this.game.selected = null;
    pair.forEach(t => this.tileEls.get(t.id)?.classList.add('hint'));
    this.game.hintsUsed++;
    // Auto-clear hint after 2 seconds
    setTimeout(() => {
      pair.forEach(t => this.tileEls.get(t.id)?.classList.remove('hint'));
    }, 2000);
  }

  doShuffle() {
    if (this.game.gameOver) return;
    this.game.shuffleRemaining();
    this.renderBoard();
    this.updateStats();
  }

  doUndo() {
    const pair = this.game.undo();
    if (!pair) return;
    this.renderBoard();
    this.updateStats();
    this.undoBtn.classList.add('disabled');
  }

  /* ── Overlays ── */

  clearOverlay() {
    const existing = this.root.querySelector('.mj-overlay');
    if (existing) existing.remove();
  }

  showWin() {
    const s = this.game.elapsedSecs();
    const m = Math.floor(s / 60);
    const timeStr = `${m}:${(s%60).toString().padStart(2,'0')}`;

    if (this.stats) {
      this.stats.gamesWon++;
      if (this.stats.bestTime === null || s < this.stats.bestTime) this.stats.bestTime = s;
      this._saveStats();
    }

    const bestStr = this.stats?.bestTime != null
      ? `Best: ${Math.floor(this.stats.bestTime / 60)}:${(this.stats.bestTime % 60).toString().padStart(2, '0')}`
      : '';

    const overlay = el('div', { class: 'mj-overlay' }, [
      el('div', { class: 'mj-overlay-title win' }, '🎉 You Win!'),
      el('div', { class: 'mj-overlay-sub' },
        `Moves: ${this.game.moves}  •  Time: ${timeStr}\nHints: ${this.game.hintsUsed}  •  Shuffles: ${this.game.shufflesUsed}`
        + (bestStr ? `\n${bestStr}` : '')),
      el('button', { class: 'mj-overlay-btn', onclick: () => this.newGame() }, '▶ Play Again'),
    ]);
    this.root.appendChild(overlay);
  }

  showStuck() {
    if (this.game.gameOver) return;
    this.stopTimer();
    this.game.gameOver = true;

    const overlay = el('div', { class: 'mj-overlay' }, [
      el('div', { class: 'mj-overlay-title stuck' }, 'No Moves'),
      el('div', { class: 'mj-overlay-sub' }, `${this.game.remaining().length} tiles remaining.\nShuffle or start a new game.`),
      el('div', { style: 'display:flex; gap:12px;' }, [
        el('button', { class: 'mj-overlay-btn', onclick: () => { this.clearOverlay(); this.game.gameOver = false; this.doShuffle(); this.startTimer(); } }, '🔀 Shuffle'),
        el('button', { class: 'mj-overlay-btn', onclick: () => this.newGame() }, '⟳ New'),
      ]),
    ]);
    this.root.appendChild(overlay);
  }

  /* ── Cleanup ── */

  destroy() {
    this.stopTimer();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    super.destroy();
  }
}
