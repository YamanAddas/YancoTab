// Pure state model — no DOM. A card is { suit, rank, faceUp, id }.
// suit: 'H'|'D'|'C'|'S', rank: 1..13. id is stable across moves for view diffing.

export const SUITS = ['H', 'D', 'C', 'S'];
export const RED_SUITS = new Set(['H', 'D']);

export function makeCard(suit, rank) {
  return { suit, rank, faceUp: false, id: `${suit}${rank}` };
}

export function isRed(card) {
  return RED_SUITS.has(card.suit);
}

export function oppositeColor(a, b) {
  return isRed(a) !== isRed(b);
}

// Build a fresh 52-card ordered deck.
export function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push(makeCard(suit, rank));
    }
  }
  return deck;
}

// Create a fresh initial state. Caller provides a shuffled deck.
// Shape:
// {
//   tableau: Card[][]  (7 piles)
//   foundation: Card[][] (4 piles, by suit order H,D,C,S — but any suit may fill any pile; we use fixed suit piles)
//   stock: Card[]
//   waste: Card[]
//   drawCount: 1 | 3
//   moves: number
//   score: number
//   startedAt: number | null
//   elapsedMs: number
//   scoring: 'standard' | 'vegas' | 'cumulative'
//   vegasBank: number
//   seed: number
//   history: [] (handled by store/undo layer)
// }
export function dealNewGame(shuffledDeck, opts = {}) {
  const deck = shuffledDeck.slice();
  const tableau = [[], [], [], [], [], [], []];
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const c = deck.pop();
      c.faceUp = (row === col);
      tableau[col].push(c);
    }
  }
  const stock = deck.reverse(); // remaining 24 cards; top of stock = last element
  for (const c of stock) c.faceUp = false;
  return {
    tableau,
    foundation: [[], [], [], []], // indexed by suit: H=0, D=1, C=2, S=3
    stock,
    waste: [],
    drawCount: opts.drawCount === 3 ? 3 : 1,
    scoring: opts.scoring || 'standard',
    moves: 0,
    // Vegas and Cumulative Vegas both charge a $52 buy-in at deal time.
    // Cumulative carries the bank across hands (persisted in stats).
    score: (opts.scoring === 'vegas' || opts.scoring === 'cumulative') ? -52 : 0,
    vegasBank: 0,
    startedAt: null,
    elapsedMs: 0,
    seed: opts.seed ?? 0,
    won: false,
  };
}

export const SUIT_INDEX = { H: 0, D: 1, C: 2, S: 3 };

// Deep clone (shallow clones card objects — callers should avoid mutating card fields in-place).
export function cloneState(s) {
  return {
    ...s,
    tableau: s.tableau.map((p) => p.map((c) => ({ ...c }))),
    foundation: s.foundation.map((p) => p.map((c) => ({ ...c }))),
    stock: s.stock.map((c) => ({ ...c })),
    waste: s.waste.map((c) => ({ ...c })),
  };
}

export function isWon(s) {
  return s.foundation.every((p) => p.length === 13);
}
