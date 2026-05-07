/**
 * mahjongGame.js — Pure Mahjong Solitaire engine.
 *
 * Tile definitions, deck construction, turtle-shape layout, and the
 * MahjongGame class. No DOM, no globals — extracted from MahjongApp.js
 * to keep the host shell under the 500-line cap.
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

export function buildDeck() {
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

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ─── Classic "Turtle" Layout ───
 *
 * Coordinates: col (x), row (y), layer (z).
 * Each tile occupies a 2×2 cell footprint.
 */

export function turtleLayout() {
  const positions = [];

  // Layer 0 — base — 109 tiles (108 grid + 1 tail wing)
  const L0 = [
    ...[...Array(14)].map((_, i) => [i * 2 - 2, 0]),
    ...[...Array(12)].map((_, i) => [i * 2,     2]),
    ...[...Array(14)].map((_, i) => [i * 2 - 2, 4]),
    ...[...Array(14)].map((_, i) => [i * 2 - 2, 6]),
    ...[...Array(14)].map((_, i) => [i * 2 - 2, 8]),
    ...[...Array(14)].map((_, i) => [i * 2 - 2, 10]),
    ...[...Array(12)].map((_, i) => [i * 2,     12]),
    ...[...Array(14)].map((_, i) => [i * 2 - 2, 14]),
  ];
  L0.forEach(([c, r]) => positions.push({ col: c, row: r, layer: 0 }));
  positions.push({ col: 26, row: 14, layer: 0 });    // tail wing

  // Layer 1 — 6×4 centered — 24 tiles
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      positions.push({ col: c * 2 + 6, row: r * 2 + 4, layer: 1 });
    }
  }

  // Layer 2 — 4×2 centered — 8 tiles
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      positions.push({ col: c * 2 + 8, row: r * 2 + 6, layer: 2 });
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

export function getLayout() {
  return turtleLayout();
}

/* ─── Game Logic ─── */

export class MahjongGame {
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

  remaining() { return this.tiles.filter((t) => !t.removed); }

  isFree(tile) {
    if (tile.removed) return false;
    const alive = this.remaining();
    const hasAbove = alive.some((t) =>
      t.layer > tile.layer &&
      t.col < tile.col + 2 && t.col + 2 > tile.col &&
      t.row < tile.row + 2 && t.row + 2 > tile.row,
    );
    if (hasAbove) return false;
    const hasLeft = alive.some((t) =>
      t !== tile && t.layer === tile.layer &&
      t.row < tile.row + 2 && t.row + 2 > tile.row &&
      t.col + 2 === tile.col,
    );
    const hasRight = alive.some((t) =>
      t !== tile && t.layer === tile.layer &&
      t.row < tile.row + 2 && t.row + 2 > tile.row &&
      t.col === tile.col + 2,
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
      pair.forEach((t) => { t.removed = true; });
      this.selected = null;
      this.moves++;

      if (this.remaining().length === 0) {
        this.gameOver = true;
        return { type: 'win', pair };
      }
      return { type: 'match', pair };
    }

    const prev = this.selected;
    this.selected = tile;
    return { type: 'switch', prev, tile };
  }

  undo() {
    if (!this._lastMatch || this.gameOver) return null;
    const pair = this._lastMatch;
    pair.forEach((t) => { t.removed = false; });
    this._lastMatch = null;
    this.moves = Math.max(0, this.moves - 1);
    return pair;
  }

  findHint() {
    const free = this.remaining().filter((t) => this.isFree(t));
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
    const positions = alive.map((t) => ({ col: t.col, row: t.row, layer: t.layer }));
    const tileData = alive.map((t) => ({ suit: t.suit, rank: t.rank, icon: t.icon, label: t.label, matchGroup: t.matchGroup }));
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
