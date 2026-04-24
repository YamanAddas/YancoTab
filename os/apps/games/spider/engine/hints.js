// hints.js — enumerate productive moves from a state. "Productive" means
// the board position actually changes in a way the player cares about:
// flipping a face-down card, emptying a column, completing/extending a
// same-suit run, or opening a new placement on an empty column. Pure
// rank-matching shuffles that don't progress anything are pruned — same
// philosophy as solitaire/engine/hints.js.
//
// Used by the view's Hint button and by isStuck (which asks: is there
// anything productive left to do without dealing?).

import { canPlaceOnTableau, isValidRun, canDealRow } from './rules.js';

export function enumerateMoves(state) {
  const moves = [];
  const T = state.tableau;
  const N = T.length;

  for (let from = 0; from < N; from++) {
    const src = T[from];
    for (let i = 0; i < src.length; i++) {
      if (!src[i].faceUp) continue;
      if (!isValidRun(src, i)) continue;
      const head = src[i];
      for (let to = 0; to < N; to++) {
        if (to === from) continue;
        if (!canPlaceOnTableau(T[to], head)) continue;

        const wouldFlip = i > 0 && !src[i - 1].faceUp;
        // Moving the entire column empties it — but only productive if the
        // destination isn't itself empty (swapping empties is pointless).
        const wouldEmpty = i === 0 && T[to].length > 0;
        const destTop = T[to].length > 0 ? T[to][T[to].length - 1] : null;
        const sameSuitBuild = !!destTop && destTop.suit === head.suit;
        const movesToEmpty = T[to].length === 0;

        // Filter out pure cross-suit shuffles that don't flip or reshape.
        if (!(wouldFlip || wouldEmpty || sameSuitBuild || movesToEmpty)) continue;

        let score = 0;
        if (wouldFlip) score += 10;
        if (wouldEmpty) score += 8;
        if (sameSuitBuild) score += 5;
        if (movesToEmpty && !wouldEmpty) score += 3;

        moves.push({ type: 'T_TO_T', from, idx: i, to, score });
      }
    }
  }

  if (canDealRow(state)) moves.push({ type: 'DEAL', score: 1 });

  return moves.sort((a, b) => b.score - a.score);
}

export function hasProductiveMove(state) {
  for (const m of enumerateMoves(state)) {
    if (m.type !== 'DEAL') return true;
  }
  return false;
}

// Stuck = no productive tableau move AND can't deal. If stock is empty and
// no flip/empty/build/empty-target move exists, the player is deadlocked.
// Note we deliberately don't require "no legal move at all" — a board with
// only cross-suit shuffles left is functionally stuck (cannot progress).
export function isStuck(state) {
  if (state.won) return false;
  if (hasProductiveMove(state)) return false;
  if (canDealRow(state)) return false;
  return true;
}
