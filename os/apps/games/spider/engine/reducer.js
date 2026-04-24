// reducer.js — pure action dispatcher for Spider state. Same contract as
// solitaire/engine/reducer.js: return { state, events[] }; illegal moves
// bounce back the current state with an { type: 'illegal' } event so the
// app shell can play a fail SFX without polluting history.

import { moveTableauToTableau, dealRow } from './moves.js';

export const DEFAULT_OPTS = { difficulty: 1 };

export function reducer(state, action) {
  if (!state) return { state: action.payload, events: [{ type: 'reset' }] };

  const apply = (next, eventType) => {
    if (!next) return { state, events: [{ type: 'illegal' }] };
    return { state: next, events: [{ type: eventType }] };
  };

  switch (action.type) {
    case 'T_TO_T':   return apply(moveTableauToTableau(state, action.from, action.idx, action.to), 'moveTableau');
    case 'DEAL':     return apply(dealRow(state), 'deal');
    case 'RESET':    return { state: action.payload, events: [{ type: 'reset' }] };
    case 'UNDO':     return { state: action.payload, events: [{ type: 'undo' }] };
    case 'REDO':     return { state: action.payload, events: [{ type: 'redo' }] };
    default:         return { state, events: [] };
  }
}

// FNV-1a — shared with solitaire. Turns a text seed ("DAILY-20260424") into
// a 32-bit integer for seededMulberry32. Duplicated here instead of imported
// so spider/ has zero hard dependency on solitaire/ (the games are cousins,
// not parent-child).
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
