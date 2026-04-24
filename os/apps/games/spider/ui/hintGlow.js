// hintGlow.js — pulse the source/destination cards of the best available move.
// Spider has only two move types (T_TO_T and DEAL), so resolution is simpler
// than Solitaire's. Pure view helper: takes a Board + game state, toggles CSS
// classes. No SFX.

import { enumerateMoves } from '../engine/hints.js';

export function pickBestHint(state) {
  const moves = enumerateMoves(state);
  // Prefer a non-DEAL productive move; fall back to DEAL if that's all there is.
  return moves.find((m) => m.type !== 'DEAL') || moves[0] || null;
}

function pick(boardEl, pile, idx) {
  if (pile === 'stock') {
    return boardEl.querySelector('.cosmic-spider-stock-pile')
      || boardEl.querySelector('.cosmic-pile-slot[data-pile="stock"]');
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

export function resolveMoveEls(boardEl, state, move) {
  let srcEl = null, dstEl = null;
  if (move.type === 'DEAL') {
    srcEl = pick(boardEl, 'stock');
  } else if (move.type === 'T_TO_T') {
    srcEl = pick(boardEl, `t${move.from}`, move.idx);
    dstEl = pick(boardEl, `t${move.to}`);
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
