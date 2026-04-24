// solver.js — Bounded DFS Klondike solver with transposition table.
// Used for the "Winnable deals only" toggle. Not a proof-solver: if the node
// budget is exhausted before a win is found, returns 'unknown'. In practice
// most winnable Draw-1 deals resolve within ~40k nodes.

import {
  drawFromStock,
  moveWasteToTableau,
  moveWasteToFoundation,
  moveTableauToFoundation,
  moveFoundationToTableau,
  moveTableauToTableau,
} from './moves.js';
import { isValidRun, canPlaceOnTableau, canPlaceOnFoundation } from './rules.js';
import { isWon, SUIT_INDEX } from './state.js';

// Canonical string of a state's piles. Move history/score/time excluded so
// equivalent boards collapse regardless of how we got there.
function keyOf(state) {
  const enc = (c) => (c.faceUp ? 'U' : 'D') + c.suit + c.rank;
  const t = state.tableau.map((p) => p.map(enc).join(',')).sort().join('|');
  const f = state.foundation.map((p) => p.length).join(',');
  const w = state.waste.map(enc).join(',');
  const s = state.stock.map(enc).join(',');
  return `${t}/${f}/${w}/${s}`;
}

// Generate candidate next-states, ordered best-first:
// 1. foundation moves (waste, tableau top) — always progress
// 2. tableau→tableau moves that flip a face-down or empty a column onto a K
// 3. waste→tableau moves
// 4. stock draw
// Foundation→tableau is skipped (cycles).
function expand(state) {
  const next = [];

  const w = state.waste[state.waste.length - 1];
  if (w && canPlaceOnFoundation(state.foundation, w)) {
    const n = moveWasteToFoundation(state); if (n) next.push(n);
  }
  for (let c = 0; c < 7; c++) {
    const pile = state.tableau[c];
    const top = pile[pile.length - 1];
    if (top && top.faceUp && canPlaceOnFoundation(state.foundation, top)) {
      const n = moveTableauToFoundation(state, c); if (n) next.push(n);
    }
  }

  for (let from = 0; from < 7; from++) {
    const src = state.tableau[from];
    for (let i = 0; i < src.length; i++) {
      if (!src[i].faceUp) continue;
      if (!isValidRun(src, i)) continue;
      for (let to = 0; to < 7; to++) {
        if (to === from) continue;
        if (!canPlaceOnTableau(state.tableau[to], src[i])) continue;
        const flips = i > 0 && !src[i - 1].faceUp;
        const emptyingOntoK = i === 0 && state.tableau[to].length > 0;
        if (!flips && !emptyingOntoK) continue; // skip unproductive run shuffles
        const n = moveTableauToTableau(state, from, i, to); if (n) next.push(n);
      }
    }
  }

  if (w) {
    for (let c = 0; c < 7; c++) {
      if (canPlaceOnTableau(state.tableau[c], w)) {
        const n = moveWasteToTableau(state, c); if (n) next.push(n);
      }
    }
  }

  if (state.stock.length > 0 || state.waste.length > 0) {
    const n = drawFromStock(state); if (n) next.push(n);
  }

  return next;
}

export function solve(initialState, { budget = 40000 } = {}) {
  let nodes = 0;
  const seen = new Set();

  function dfs(state) {
    if (++nodes > budget) return 'unknown';
    if (isWon(state)) return 'win';
    const key = keyOf(state);
    if (seen.has(key)) return 'loss';
    seen.add(key);

    for (const next of expand(state)) {
      const r = dfs(next);
      if (r === 'win') return 'win';
      if (r === 'unknown') return 'unknown';
    }
    return 'loss';
  }

  const result = dfs(initialState);
  return { result, nodes };
}
