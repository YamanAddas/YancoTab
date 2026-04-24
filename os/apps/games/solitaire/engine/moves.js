import { cloneState, isWon, SUIT_INDEX } from './state.js';
import {
  canPlaceOnTableau,
  canPlaceOnFoundation,
  isValidRun,
  canPlaceRunOnTableau,
} from './rules.js';

// Scoring deltas (Standard Klondike scoring).
//   waste->tableau:    +5
//   waste->foundation: +10
//   tableau->foundation: +10
//   foundation->tableau: -15
//   turn-over (flip a tableau card face-up): +5
//   recycle stock (after first in draw-1): -100; draw-3: -20; Vegas: no recycle allowed on draw-3
const STANDARD = {
  wasteToTableau: 5,
  wasteToFoundation: 10,
  tableauToFoundation: 10,
  foundationToTableau: -15,
  turnOver: 5,
  recycleDraw1: -100,
  recycleDraw3: -20,
};

const VEGAS = {
  wasteToTableau: 0,
  wasteToFoundation: 5,
  tableauToFoundation: 5,
  foundationToTableau: -5,
  turnOver: 0,
  recycleDraw1: 0,
  recycleDraw3: 0,
};

function scoringTable(kind) {
  return kind === 'vegas' || kind === 'cumulative' ? VEGAS : STANDARD;
}

function flipTopIfNeeded(state, colIdx) {
  const col = state.tableau[colIdx];
  if (col.length > 0 && !col[col.length - 1].faceUp) {
    col[col.length - 1].faceUp = true;
    state.score += scoringTable(state.scoring).turnOver;
    return true;
  }
  return false;
}

function finalize(state) {
  state.moves += 1;
  state.won = isWon(state);
  return state;
}

// Public action creators — each takes the current state, returns a NEW state or null if illegal.

export function drawFromStock(state) {
  const s = cloneState(state);
  if (s.stock.length === 0) {
    if (s.waste.length === 0) return null;
    // recycle
    if (s.scoring === 'vegas') return null; // no recycle in vegas
    while (s.waste.length > 0) {
      const c = s.waste.pop();
      c.faceUp = false;
      s.stock.push(c);
    }
    const tbl = scoringTable(s.scoring);
    s.score += (s.drawCount === 3 ? tbl.recycleDraw3 : tbl.recycleDraw1);
    return finalize(s);
  }
  const n = Math.min(s.drawCount, s.stock.length);
  for (let i = 0; i < n; i++) {
    const c = s.stock.pop();
    c.faceUp = true;
    s.waste.push(c);
  }
  return finalize(s);
}

export function moveWasteToTableau(state, destCol) {
  if (state.waste.length === 0) return null;
  const card = state.waste[state.waste.length - 1];
  if (!canPlaceOnTableau(state.tableau[destCol], card)) return null;
  const s = cloneState(state);
  const c = s.waste.pop();
  s.tableau[destCol].push(c);
  s.score += scoringTable(s.scoring).wasteToTableau;
  return finalize(s);
}

export function moveWasteToFoundation(state) {
  if (state.waste.length === 0) return null;
  const card = state.waste[state.waste.length - 1];
  if (!canPlaceOnFoundation(state.foundation, card)) return null;
  const s = cloneState(state);
  const c = s.waste.pop();
  s.foundation[SUIT_INDEX[c.suit]].push(c);
  s.score += scoringTable(s.scoring).wasteToFoundation;
  return finalize(s);
}

export function moveTableauToFoundation(state, fromCol) {
  const pile = state.tableau[fromCol];
  if (pile.length === 0) return null;
  const card = pile[pile.length - 1];
  if (!card.faceUp) return null;
  if (!canPlaceOnFoundation(state.foundation, card)) return null;
  const s = cloneState(state);
  const c = s.tableau[fromCol].pop();
  s.foundation[SUIT_INDEX[c.suit]].push(c);
  s.score += scoringTable(s.scoring).tableauToFoundation;
  flipTopIfNeeded(s, fromCol);
  return finalize(s);
}

export function moveFoundationToTableau(state, suit, destCol) {
  const fIdx = SUIT_INDEX[suit];
  const fPile = state.foundation[fIdx];
  if (fPile.length === 0) return null;
  const card = fPile[fPile.length - 1];
  if (!canPlaceOnTableau(state.tableau[destCol], card)) return null;
  const s = cloneState(state);
  const c = s.foundation[fIdx].pop();
  s.tableau[destCol].push(c);
  s.score += scoringTable(s.scoring).foundationToTableau;
  return finalize(s);
}

export function moveTableauToTableau(state, fromCol, fromIdx, destCol) {
  if (fromCol === destCol) return null;
  const src = state.tableau[fromCol];
  if (!isValidRun(src, fromIdx)) return null;
  const run = src.slice(fromIdx);
  if (!canPlaceRunOnTableau(state.tableau[destCol], run)) return null;
  const s = cloneState(state);
  const moved = s.tableau[fromCol].splice(fromIdx);
  for (const c of moved) s.tableau[destCol].push(c);
  flipTopIfNeeded(s, fromCol);
  // standard scoring: no bonus for tableau->tableau
  return finalize(s);
}

// Auto-move any eligible top cards up to foundation repeatedly, returns new state (or same if nothing).
export function autoCollect(state) {
  let cur = state;
  let changed = true;
  while (changed) {
    changed = false;
    // waste top
    const next = moveWasteToFoundation(cur);
    if (next) { cur = next; changed = true; continue; }
    for (let c = 0; c < 7; c++) {
      const n2 = moveTableauToFoundation(cur, c);
      if (n2) { cur = n2; changed = true; break; }
    }
  }
  return cur;
}
