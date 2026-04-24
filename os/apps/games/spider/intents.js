// intents.js — translate Board click/drag intents into engine actions.
// Spider has only two engine actions: T_TO_T (move run) and DEAL (new stock row).
// Single click on a tableau card runs tap-to-move (auto-route to the best
// legal destination by hint ranking). Drag-and-drop lets the player pick the
// destination themselves. Double-click is intentionally NOT wired — Spider
// doesn't auto-send cards anywhere; completed K→A same-suit runs go to
// foundation automatically via the engine, not via user gesture.

import { canPlaceOnTableau, isValidRun } from './engine/rules.js';

export function handleBoardIntent(ctx, kind, payload) {
  if (kind === 'dragDrop') { handleDrop(ctx, payload.from, payload.to); return; }
  if (kind === 'stockClick') { ctx.dispatch({ type: 'DEAL' }); return; }

  const { pile, index } = payload || {};
  if (kind === 'cardClick') {
    if (pile === 'stock') { ctx.dispatch({ type: 'DEAL' }); return; }
    if (pile?.startsWith('t')) {
      tryTapToMove(ctx, +pile.slice(1), index);
      return;
    }
    // Foundation clicks do nothing — completed runs are locked.
  }
}

// Translate a drag drop into a T_TO_T action. from = { pile:'tN', idx }, to = 'tM'.
export function handleDrop(ctx, from, to) {
  if (!from || !to || from.pile === to) return;
  if (!from.pile.startsWith('t') || !to.startsWith('t')) {
    ctx.flashIllegal(from.pile, from.idx);
    return;
  }
  const fromCol = +from.pile.slice(1);
  const toCol = +to.slice(1);
  if (!ctx.dispatch({ type: 'T_TO_T', from: fromCol, idx: from.idx, to: toCol })) {
    ctx.flashIllegal(from.pile, from.idx);
  }
}

// Tap-to-move: given a tableau card the player clicked, find the best legal
// destination column and dispatch T_TO_T. "Best" follows the same ranking as
// hints.js — prefer moves that flip a face-down card, then that empty a column,
// then same-suit builds, then moves into empty columns.
export function tryTapToMove(ctx, fromCol, idx) {
  const s = ctx.getState();
  const src = s.tableau[fromCol];
  if (idx < 0 || idx >= src.length) { ctx.flashIllegal(`t${fromCol}`, idx); return; }
  if (!src[idx].faceUp) { ctx.flashIllegal(`t${fromCol}`, idx); return; }
  if (!isValidRun(src, idx)) { ctx.flashIllegal(`t${fromCol}`, idx); return; }

  const head = src[idx];
  let best = null;
  for (let to = 0; to < s.tableau.length; to++) {
    if (to === fromCol) continue;
    if (!canPlaceOnTableau(s.tableau[to], head)) continue;
    const dest = s.tableau[to];
    const destTop = dest.length > 0 ? dest[dest.length - 1] : null;
    let score = 0;
    const wouldFlip = idx > 0 && !src[idx - 1].faceUp;
    const wouldEmpty = idx === 0 && dest.length > 0;
    const sameSuit = !!destTop && destTop.suit === head.suit;
    const toEmpty = dest.length === 0;
    if (wouldFlip)  score += 10;
    if (wouldEmpty) score += 8;
    if (sameSuit)   score += 5;
    if (toEmpty && !wouldEmpty) score += 3;
    // Tiebreaker: prefer non-empty destinations (keeps the board dense).
    score += dest.length > 0 ? 1 : 0;
    if (!best || score > best.score) best = { to, score };
  }
  if (!best) { ctx.flashIllegal(`t${fromCol}`, idx); return; }
  if (!ctx.dispatch({ type: 'T_TO_T', from: fromCol, idx, to: best.to })) {
    ctx.flashIllegal(`t${fromCol}`, idx);
  }
}
