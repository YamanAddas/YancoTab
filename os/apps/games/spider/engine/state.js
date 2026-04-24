// Pure state model for Spider Solitaire — no DOM, no I/O. Mirrors the
// solitaire/engine/state.js shape so the view + persistence patterns carry
// across: plain card objects, a single dealNewGame entry, cloneState for
// immutability, isWon as a predicate.
//
// Spider differs from Klondike in a few load-bearing ways:
//   • 104 cards (2 full decks "worth"), suit coverage varies with difficulty
//   • 10 tableau columns (not 7)
//   • Foundation is a LIST of completed K→A same-suit runs (0..8), not a
//     per-suit pile of ascending cards — a completed run auto-moves as a unit
//   • No waste pile; stock is dealt 10-at-a-time as a whole row
//   • Difficulty is a property of the DECK, not the rules: 1 = all Spades
//     (8 copies), 2 = Spades+Hearts (4 each), 4 = every suit (2 each)

export const SUITS = ['H', 'D', 'C', 'S'];
export const RED_SUITS = new Set(['H', 'D']);

// Card id embeds the duplicate index so the 2-deck pool has unique ids
// (e.g. 'S7_0' and 'S7_1' are the two Spades-7s in 4-suit mode). View-layer
// keyed diffing depends on this being stable across moves.
export function makeCard(suit, rank, copy = 0) {
  return { suit, rank, copy, faceUp: false, id: `${suit}${rank}_${copy}` };
}

export function isRed(card) {
  return RED_SUITS.has(card.suit);
}

// Build the 104-card pool for a given difficulty. Always exactly 104 cards
// so the deal is identical in shape regardless of difficulty — only the suit
// distribution changes, which is what makes 1-suit easier (every card is a
// valid run-builder for every other card of the right rank).
export function buildDeck(difficulty = 1) {
  const suits =
    difficulty === 1 ? ['S']
    : difficulty === 2 ? ['S', 'H']
    : SUITS;
  const copiesPerSuit = 8 / suits.length;
  const deck = [];
  for (const suit of suits) {
    for (let copy = 0; copy < copiesPerSuit; copy++) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push(makeCard(suit, rank, copy));
      }
    }
  }
  return deck;
}

// Initial deal: columns 0-3 get 6 cards, columns 4-9 get 5 cards (54 total);
// the remaining 50 go to the stock as 5 face-down rows ready to deal.
// `shuffled` is consumed by .pop() so callers pass a shuffled clone.
export function dealNewGame(shuffled, opts = {}) {
  const deck = shuffled.slice();
  const tableau = Array.from({ length: 10 }, () => []);
  for (let col = 0; col < 10; col++) {
    const rows = col < 4 ? 6 : 5;
    for (let row = 0; row < rows; row++) {
      const c = deck.pop();
      c.faceUp = (row === rows - 1);
      tableau[col].push(c);
    }
  }
  // Top of stock = last element, so .pop() draws the next card to deal.
  const stock = deck.reverse();
  for (const c of stock) c.faceUp = false;
  return {
    tableau,
    foundation: [],              // array of completed K→A runs (each length 13)
    stock,
    difficulty: opts.difficulty || 1,
    // Standard Spider scoring: start at 500, -1 per move, +100 per suit.
    score: 500,
    moves: 0,
    startedAt: null,
    elapsedMs: 0,
    seed: opts.seed ?? 0,
    won: false,
  };
}

export function cloneState(s) {
  return {
    ...s,
    tableau: s.tableau.map((p) => p.map((c) => ({ ...c }))),
    foundation: s.foundation.map((p) => p.map((c) => ({ ...c }))),
    stock: s.stock.map((c) => ({ ...c })),
  };
}

export function isWon(s) {
  return s.foundation.length === 8;
}
