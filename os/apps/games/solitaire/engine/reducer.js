// reducer.js — pure action dispatcher for Solitaire state.
// Each action returns { state, events[] }; illegal moves return the same state
// with an { type: 'illegal' } event so the app can play a fail SFX without
// mutating history.

import {
  drawFromStock,
  moveWasteToTableau,
  moveWasteToFoundation,
  moveTableauToFoundation,
  moveFoundationToTableau,
  moveTableauToTableau,
  autoCollect,
} from './moves.js';

export const DEFAULT_OPTS = { drawCount: 1, scoring: 'standard' };

export function reducer(state, action) {
  if (!state) return { state: action.payload, events: [{ type: 'reset' }] };

  const apply = (next, eventType) => {
    if (!next) return { state, events: [{ type: 'illegal' }] };
    return { state: next, events: [{ type: eventType }] };
  };

  switch (action.type) {
    case 'DRAW':             return apply(drawFromStock(state), 'draw');
    case 'WASTE_TO_FOUND':   return apply(moveWasteToFoundation(state), 'moveFound');
    case 'WASTE_TO_TABLEAU': return apply(moveWasteToTableau(state, action.col), 'moveTableau');
    case 'T_TO_FOUND':       return apply(moveTableauToFoundation(state, action.col), 'moveFound');
    case 'F_TO_T':           return apply(moveFoundationToTableau(state, action.suit, action.col), 'moveTableau');
    case 'T_TO_T':           return apply(moveTableauToTableau(state, action.from, action.idx, action.to), 'moveTableau');
    case 'AUTO_COLLECT':     return { state: autoCollect(state), events: [{ type: 'moveFound' }] };
    case 'RESET':            return { state: action.payload, events: [{ type: 'reset' }] };
    case 'UNDO':             return { state: action.payload, events: [{ type: 'undo' }] };
    case 'REDO':             return { state: action.payload, events: [{ type: 'redo' }] };
    default:                 return { state, events: [] };
  }
}

// FNV-1a hash — used to turn a text seed into a 32-bit integer for dealFromSeed.
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
