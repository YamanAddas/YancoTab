// Rule predicates for Spider — all pure, no state mutation. The two-level
// split (placement vs. movable-group) is deliberate: Spider lets ANY card
// land on a card one rank higher regardless of suit, but you can only move
// multiple cards as a GROUP if they form a same-suit descending run. That
// asymmetry is the heart of the game's difficulty curve.

// Empty column accepts anything (including the bottom of a run). Otherwise
// the top face-up card must be exactly one rank higher than the incoming
// card. Suit is NOT checked at drop time.
export function canPlaceOnTableau(pile, card) {
  if (!card) return false;
  if (pile.length === 0) return true;
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return top.rank === card.rank + 1;
}

// A movable group: starting at fromIdx, every card must be face-up, same
// suit, and strictly descending by 1. A single card always qualifies.
export function isValidRun(pile, fromIdx) {
  if (fromIdx < 0 || fromIdx >= pile.length) return false;
  for (let i = fromIdx; i < pile.length; i++) {
    if (!pile[i].faceUp) return false;
    if (i > fromIdx) {
      const prev = pile[i - 1];
      const cur = pile[i];
      if (prev.suit !== cur.suit) return false;
      if (prev.rank !== cur.rank + 1) return false;
    }
  }
  return true;
}

// True when the last 13 cards of `pile` form a complete, same-suit, face-up
// K→A run ready to auto-collect to the foundation. We check only the tail
// because that's where a completion can physically land in Spider: once a
// run is at the tail it has no way to get covered (dealRow adds new face-up
// cards on top, which prevents completion detection after the deal — by
// design, since Spider classically collects *before* the next user action).
export function isCompletedRun(pile) {
  if (pile.length < 13) return false;
  const start = pile.length - 13;
  if (pile[start].rank !== 13) return false;
  const suit = pile[start].suit;
  for (let i = 0; i < 13; i++) {
    const c = pile[start + i];
    if (!c.faceUp) return false;
    if (c.suit !== suit) return false;
    if (c.rank !== 13 - i) return false;
  }
  return true;
}

// Stock deal is only legal when ALL columns are non-empty (classic Spider
// rule — prevents wasting the deal on an empty board) and the stock has at
// least 10 cards remaining. Five deals total: 50 stock / 10 per deal.
export function canDealRow(state) {
  if (state.stock.length < 10) return false;
  for (const col of state.tableau) if (col.length === 0) return false;
  return true;
}
