// Action creators — each takes the current state, returns a NEW state, or
// null if the move is illegal. Matches solitaire/engine/moves.js contract.
//
// Two user-facing actions in Spider: move a run between tableau columns,
// and deal a new row from stock. Completed K→A runs auto-collect to the
// foundation after every user action (via collectCompletedRuns) so the
// player never has to manually send a finished suit away.

import { cloneState, isWon } from './state.js';
import {
  canPlaceOnTableau,
  isValidRun,
  isCompletedRun,
  canDealRow,
} from './rules.js';

function flipTopIfNeeded(state, colIdx) {
  const col = state.tableau[colIdx];
  if (col.length > 0 && !col[col.length - 1].faceUp) {
    col[col.length - 1].faceUp = true;
    return true;
  }
  return false;
}

// Scan every column for a completed K→A same-suit run at the tail, remove
// it, push it onto the foundation, and flip whatever is newly exposed.
// Loops until no more runs complete (one move can cascade — e.g. a deal
// that finishes two suits at once is theoretically possible). Returns the
// number of runs collected so callers can trigger celebrations.
function collectCompletedRuns(state) {
  let collected = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let c = 0; c < state.tableau.length; c++) {
      if (isCompletedRun(state.tableau[c])) {
        const run = state.tableau[c].splice(state.tableau[c].length - 13, 13);
        state.foundation.push(run);
        state.score += 100;
        flipTopIfNeeded(state, c);
        collected += 1;
        changed = true;
      }
    }
  }
  return collected;
}

function finalize(state) {
  state.moves += 1;
  state.score -= 1;                // every user action costs 1 point
  collectCompletedRuns(state);
  state.won = isWon(state);
  return state;
}

// Move a contiguous run starting at tableau[fromCol][fromIdx] onto destCol.
// `fromIdx` is inclusive — a single-card move passes fromIdx = last index.
export function moveTableauToTableau(state, fromCol, fromIdx, destCol) {
  if (fromCol === destCol) return null;
  const src = state.tableau[fromCol];
  if (!isValidRun(src, fromIdx)) return null;
  const runHead = src[fromIdx];
  if (!canPlaceOnTableau(state.tableau[destCol], runHead)) return null;
  const s = cloneState(state);
  const moved = s.tableau[fromCol].splice(fromIdx);
  for (const c of moved) s.tableau[destCol].push(c);
  flipTopIfNeeded(s, fromCol);
  return finalize(s);
}

// Deal the next stock row: one card onto each of the 10 columns, face-up.
// Refused if any column is empty OR stock has fewer than 10 cards left.
export function dealRow(state) {
  if (!canDealRow(state)) return null;
  const s = cloneState(state);
  for (let c = 0; c < 10; c++) {
    const card = s.stock.pop();
    card.faceUp = true;
    s.tableau[c].push(card);
  }
  return finalize(s);
}
