// reducer.js — pure action dispatcher for Spider state. Same contract as
// solitaire/engine/reducer.js: return { state, events[] }; illegal moves
// bounce back the current state with an { type: 'illegal' } event so the
// app shell can play a fail SFX without polluting history.

import { moveTableauToTableau, dealRow } from './moves.js';
import { hashString } from '../../shared/hash.js';

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

// Re-export so any import from this module keeps working.
export { hashString };
