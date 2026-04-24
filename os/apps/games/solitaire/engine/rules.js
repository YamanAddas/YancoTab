import { isRed, oppositeColor, SUIT_INDEX } from './state.js';

// Can `card` be placed on top of tableau pile `pile`? Pile may be empty (accepts K only).
export function canPlaceOnTableau(pile, card) {
  if (!card) return false;
  if (pile.length === 0) return card.rank === 13;
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return oppositeColor(top, card) && top.rank === card.rank + 1;
}

// Can `card` go to its foundation pile (only single-card moves to foundation)?
export function canPlaceOnFoundation(foundation, card) {
  if (!card) return false;
  const pile = foundation[SUIT_INDEX[card.suit]];
  if (pile.length === 0) return card.rank === 1;
  const top = pile[pile.length - 1];
  return top.suit === card.suit && top.rank === card.rank - 1;
}

// Is a substring of the tableau pile (starting at `fromIdx`) a valid run to move as a group?
// Valid run: all face-up, alternating colors, strictly descending by 1.
export function isValidRun(pile, fromIdx) {
  if (fromIdx < 0 || fromIdx >= pile.length) return false;
  for (let i = fromIdx; i < pile.length; i++) {
    if (!pile[i].faceUp) return false;
    if (i > fromIdx) {
      const prev = pile[i - 1];
      const cur = pile[i];
      if (!oppositeColor(prev, cur)) return false;
      if (prev.rank !== cur.rank + 1) return false;
    }
  }
  return true;
}

// Does dealing this card to this empty tableau pile or on top of the given top card satisfy rules?
export function canPlaceRunOnTableau(pile, run) {
  if (run.length === 0) return false;
  return canPlaceOnTableau(pile, run[0]);
}
