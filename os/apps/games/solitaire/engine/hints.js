// hints.js — Enumerate productive moves from a state.
// "Productive" means: foundation progress, flipping a face-down card, or
// moving a run to open a column. Used for stuck detection and (future) hints.

import { canPlaceOnFoundation, canPlaceOnTableau, isValidRun } from './rules.js';
import { SUIT_INDEX } from './state.js';

export function enumerateMoves(state) {
  const moves = [];

  // Stock draw / recycle
  if (state.stock.length > 0) {
    moves.push({ type: 'DRAW', score: 1 });
  } else if (state.waste.length > 0 && state.scoring !== 'vegas') {
    moves.push({ type: 'DRAW', score: 0 }); // recycle
  }

  // Waste → foundation
  const wTop = state.waste[state.waste.length - 1];
  if (wTop && canPlaceOnFoundation(state.foundation, wTop)) {
    moves.push({ type: 'WASTE_TO_FOUND', score: 8 });
  }

  // Tableau top → foundation
  for (let c = 0; c < 7; c++) {
    const pile = state.tableau[c];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (top.faceUp && canPlaceOnFoundation(state.foundation, top)) {
      // bigger score if it uncovers a face-down card
      const flips = pile.length >= 2 && !pile[pile.length - 2].faceUp ? 3 : 0;
      moves.push({ type: 'T_TO_FOUND', col: c, score: 6 + flips });
    }
  }

  // Waste → tableau
  if (wTop) {
    for (let c = 0; c < 7; c++) {
      if (canPlaceOnTableau(state.tableau[c], wTop)) {
        moves.push({ type: 'WASTE_TO_TABLEAU', col: c, score: 3 });
      }
    }
  }

  // Tableau run → tableau (only productive if it flips a card or empties a column
  // onto a non-empty destination that accepts a K). Pure shuffles are skipped.
  for (let from = 0; from < 7; from++) {
    const src = state.tableau[from];
    for (let i = 0; i < src.length; i++) {
      if (!src[i].faceUp) continue;
      if (!isValidRun(src, i)) continue;
      const runHead = src[i];
      for (let to = 0; to < 7; to++) {
        if (to === from) continue;
        if (!canPlaceOnTableau(state.tableau[to], runHead)) continue;
        const wouldFlip = i > 0 && !src[i - 1].faceUp;
        const wouldEmpty = i === 0 && state.tableau[to].length > 0;
        if (!wouldFlip && !wouldEmpty) continue;
        moves.push({
          type: 'T_TO_T',
          from, idx: i, to,
          score: (wouldFlip ? 4 : 0) + (wouldEmpty ? 2 : 0),
        });
      }
    }
  }

  // Foundation → tableau (rarely productive; only if it unblocks a specific placement)
  // Skipped in enumeration to avoid infinite shuffles.

  return moves.sort((a, b) => b.score - a.score);
}

// True if at least one productive, non-stock move exists. Used with stock
// emptiness to decide "stuck".
export function hasProductiveMove(state) {
  const moves = enumerateMoves(state);
  for (const m of moves) if (m.type !== 'DRAW') return true;
  return false;
}

// Stuck = stock empty, waste can't recycle (or all recycled but no productive moves),
// and no productive move from the current board.
export function isStuck(state) {
  if (state.stock.length > 0) return false;           // more to draw
  if (state.waste.length > 0 && state.scoring !== 'vegas') return false; // can recycle
  return !hasProductiveMove(state);
}

// Auto-Finish is offered only when the game is effectively solved — stock +
// waste are empty and every tableau card is face-up. From there, naively
// shuffling cards up to foundations always wins, so we expose a one-click
// finisher instead of making the user click 52 cards.
export function isAutoFinishReady(state) {
  if (state.stock.length !== 0 || state.waste.length !== 0) return false;
  for (const col of state.tableau) {
    for (const c of col) if (!c.faceUp) return false;
  }
  return true;
}
