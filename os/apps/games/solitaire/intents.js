// intents.js — translate Board click/dblclick/drag intents into engine actions.
// Pure-ish: takes a context { getState, dispatch, flashIllegal } and returns
// nothing. Keeps SolitaireApp.js focused on lifecycle/state.

import { canPlaceOnFoundation } from './engine/rules.js';

const SUITS = ['H', 'D', 'C', 'S'];

export function handleBoardIntent(ctx, kind, payload) {
  if (kind === 'dragDrop') { handleDrop(ctx, payload.from, payload.to); return; }
  const { pile, index } = payload || {};
  const s = ctx.getState();

  if (kind === 'stockClick') { ctx.dispatch({ type: 'DRAW' }); return; }

  if (kind === 'cardClick') {
    if (pile === 'stock') { ctx.dispatch({ type: 'DRAW' }); return; }

    // Single click on waste top → try foundation if legal.
    if (pile === 'waste') {
      const card = s.waste[s.waste.length - 1];
      if (card && canPlaceOnFoundation(s.foundation, card)) {
        ctx.dispatch({ type: 'WASTE_TO_FOUND' });
        return;
      }
    }
    // Single click on tableau top → try foundation if legal.
    if (pile.startsWith('t')) {
      const col = +pile.slice(1);
      const tp = s.tableau[col];
      if (index !== tp.length - 1) { ctx.flashIllegal(pile, index); return; }
      const card = tp[tp.length - 1];
      if (card && canPlaceOnFoundation(s.foundation, card)) {
        ctx.dispatch({ type: 'T_TO_FOUND', col });
        return;
      }
    }
    if (pile.startsWith('f')) return;  // foundation click — no default action
    ctx.flashIllegal(pile, index);
    return;
  }

  if (kind === 'cardDblClick') {
    if (pile === 'waste' || pile.startsWith('t')) tryAuto(ctx, pile);
  }
}

// Translate a drag drop (from pile+idx, to pile) into an engine action.
export function handleDrop(ctx, from, to) {
  if (!from || !to || from.pile === to) return;
  const s = ctx.getState();

  // Waste → Foundation / Tableau
  if (from.pile === 'waste') {
    if (to.startsWith('f')) {
      if (!ctx.dispatch({ type: 'WASTE_TO_FOUND' })) ctx.flashIllegal('waste');
      return;
    }
    if (to.startsWith('t')) {
      const col = +to.slice(1);
      if (!ctx.dispatch({ type: 'WASTE_TO_TABLEAU', col })) ctx.flashIllegal('waste');
      return;
    }
  }

  // Tableau → Foundation / Tableau
  if (from.pile.startsWith('t')) {
    const fromCol = +from.pile.slice(1);
    const fromIdx = from.idx;
    const tp = s.tableau[fromCol];
    const isTop = fromIdx === tp.length - 1;

    if (to.startsWith('f')) {
      if (!isTop) { ctx.flashIllegal(from.pile, fromIdx); return; }
      if (!ctx.dispatch({ type: 'T_TO_FOUND', col: fromCol })) ctx.flashIllegal(from.pile, fromIdx);
      return;
    }
    if (to.startsWith('t')) {
      const toCol = +to.slice(1);
      if (!ctx.dispatch({ type: 'T_TO_T', from: fromCol, idx: fromIdx, to: toCol })) {
        ctx.flashIllegal(from.pile, fromIdx);
      }
      return;
    }
  }

  // Foundation → Tableau
  if (from.pile.startsWith('f') && to.startsWith('t')) {
    const suit = SUITS[+from.pile.slice(1)];
    const col = +to.slice(1);
    if (!ctx.dispatch({ type: 'F_TO_T', suit, col })) ctx.flashIllegal(from.pile);
    return;
  }

  ctx.flashIllegal(from.pile, from.idx);
}

// Double-click: send one legal top card to foundation (repeated via double-click).
export function tryAuto(ctx, pileKey) {
  const s = ctx.getState();
  if (pileKey === 'waste') {
    const c = s.waste[s.waste.length - 1];
    if (c && canPlaceOnFoundation(s.foundation, c)) ctx.dispatch({ type: 'WASTE_TO_FOUND' });
    else ctx.flashIllegal(pileKey);
    return;
  }
  if (pileKey.startsWith('t')) {
    const col = +pileKey.slice(1);
    const tp = s.tableau[col];
    const c = tp[tp.length - 1];
    if (c && canPlaceOnFoundation(s.foundation, c)) ctx.dispatch({ type: 'T_TO_FOUND', col });
    else ctx.flashIllegal(pileKey);
  }
}
