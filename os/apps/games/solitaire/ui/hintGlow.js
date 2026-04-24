// hintGlow.js — pulse the source/destination cards of the best available move.
// Pure view helper: takes a Board + game state, toggles CSS classes. No SFX.

import { SUIT_INDEX } from '../engine/state.js';
import { enumerateMoves } from '../engine/hints.js';

export function pickBestHint(state) {
  const moves = enumerateMoves(state);
  // Prefer a non-DRAW productive move; fall back to DRAW if that's all there is.
  return moves.find((m) => m.type !== 'DRAW') || moves[0] || null;
}

// Resolve a DOM element under boardEl matching a pile (and optional index).
// Prefers a specific card, then the top card in the pile, then the pile slot.
function pick(boardEl, pile, idx) {
  if (pile === 'stock') {
    return boardEl.querySelector('.cosmic-pile-slot[data-pile="stock"]')
      || boardEl.querySelector('.cosmic-card[data-pile="stock"]');
  }
  if (idx != null) {
    const c = boardEl.querySelector(
      `.cosmic-card[data-pile="${pile}"][data-index="${idx}"]`);
    if (c) return c;
  }
  const cards = boardEl.querySelectorAll(`.cosmic-card[data-pile="${pile}"]`);
  if (cards.length) return cards[cards.length - 1];
  return boardEl.querySelector(`.cosmic-pile-slot[data-pile="${pile}"]`);
}

// Resolve the source and destination DOM elements for a move.
export function resolveMoveEls(boardEl, state, move) {
  let srcEl = null, dstEl = null;
  switch (move.type) {
    case 'DRAW':
      srcEl = pick(boardEl, 'stock');
      break;
    case 'WASTE_TO_FOUND': {
      const c = state.waste[state.waste.length - 1];
      srcEl = pick(boardEl, 'waste');
      dstEl = pick(boardEl, `f${SUIT_INDEX[c.suit]}`);
      break;
    }
    case 'WASTE_TO_TABLEAU':
      srcEl = pick(boardEl, 'waste');
      dstEl = pick(boardEl, `t${move.col}`);
      break;
    case 'T_TO_FOUND': {
      const pile = state.tableau[move.col];
      const top = pile[pile.length - 1];
      srcEl = pick(boardEl, `t${move.col}`, pile.length - 1);
      dstEl = pick(boardEl, `f${SUIT_INDEX[top.suit]}`);
      break;
    }
    case 'T_TO_T':
      srcEl = pick(boardEl, `t${move.from}`, move.idx);
      dstEl = pick(boardEl, `t${move.to}`);
      break;
  }
  return { srcEl, dstEl };
}

export function applyHintGlow(boardEl, srcEl, dstEl) {
  clearHintGlow(boardEl);
  if (srcEl) srcEl.classList.add('cosmic-hint-src');
  if (dstEl && dstEl !== srcEl) dstEl.classList.add('cosmic-hint-dst');
}

export function clearHintGlow(boardEl) {
  if (!boardEl) return;
  boardEl.querySelectorAll('.cosmic-hint-src, .cosmic-hint-dst')
    .forEach((e) => e.classList.remove('cosmic-hint-src', 'cosmic-hint-dst'));
}
