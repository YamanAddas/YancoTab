import { CONTRACTS, nextSeat, legalTrickPlays, trickWinner, legalLayoutPlays, applyLayoutCard, TRIX_LAYOUT_SCORES, SEATS, teamOf, TEAMS } from './trixRules.js';
import { dealNewHands, initMatch } from './trixState.js';

function contractById(id) { return CONTRACTS.find(c => c.id === id) || null; }
function cardKey(card) { return `${card?.suit}:${card?.rank}`; }

function removeFromHand(hand, card) {
  const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (idx >= 0) hand.splice(idx, 1);
  return idx >= 0;
}

function syncTeamScores(state) {
  if (state.mode !== 'partners') return;
  state.teamScores = { A: 0, B: 0 };
  for (const seat of SEATS) {
    const t = teamOf(seat);
    if (t) state.teamScores[t] += (state.scores[seat] || 0);
  }
}

function logDeal(state, deltas) {
  const entry = {
    dealNumber: state.dealNumber,
    kingdomNumber: state.kingdomNumber,
    kingdomOwner: state.kingdomOwner,
    contractId: state.currentContract?.id || null,
    deltas: { ...deltas },
    totals: { ...state.scores },
    teamTotals: state.mode === 'partners' ? { ...state.teamScores } : null,
    ts: Date.now(),
  };
  state.dealLog = state.dealLog || [];
  state.dealLog.push(entry);
}

function scoreDealTrickContract(state) {
  return state.dealDeltas || { south: 0, east: 0, north: 0, west: 0 };
}

function scoreDealLayoutContract(state) {
  const deltas = { south: 0, east: 0, north: 0, west: 0 };
  for (let i = 0; i < state.outOrder.length; i++) {
    const s = state.outOrder[i];
    deltas[s] += TRIX_LAYOUT_SCORES[i] || 0;
  }
  for (const seat of SEATS) state.scores[seat] += deltas[seat];
  syncTeamScores(state);
  return deltas;
}

function createDoublingState() {
  return {
    pending: false,
    contractId: null,
    holder: null,
    closed: false,
    options: [],
    doubledKeys: [],
    map: {},
  };
}

function collectDoubleCandidates(state, contractId) {
  const byHolder = {};
  if (contractId === 'king') {
    for (const seat of SEATS) {
      const kh = (state.hands?.[seat] || []).find((c) => c.suit === 'hearts' && c.rank === 13);
      if (kh) byHolder[seat] = [kh];
    }
    return byHolder;
  }
  if (contractId === 'queens') {
    for (const seat of SEATS) {
      const queens = (state.hands?.[seat] || []).filter((c) => c.rank === 12);
      if (queens.length) byHolder[seat] = queens;
    }
  }
  return byHolder;
}

function botDoubleKeys(state, seat, contractId, cards) {
  const hand = state.hands?.[seat] || [];
  const difficulty = state.difficulty || 'moderate';
  if (difficulty === 'easy') return [];

  if (contractId === 'king') {
    const heartsCount = hand.filter((c) => c.suit === 'hearts').length;
    const limit = difficulty === 'hard' ? 5 : 4;
    return heartsCount <= limit ? cards.map(cardKey) : [];
  }

  if (contractId === 'queens') {
    const out = [];
    const queenCount = cards.length;
    for (const q of cards) {
      const suitCount = hand.filter((c) => c.suit === q.suit).length;
      const limit = difficulty === 'hard' ? 4 : 3;
      if (suitCount <= limit || queenCount <= 1) out.push(cardKey(q));
    }
    return out;
  }

  return [];
}

function applyTrickScore(state, winnerSeat, trick) {
  const cid = state.currentContract?.id;
  if (!cid) return;
  const doubled = state.doubling?.map || {};
  let deltaWinner = 0;

  if (cid === 'diamonds') {
    deltaWinner = -10 * trick.filter(t => t.card.suit === 'diamonds').length;
  } else if (cid === 'queens') {
    const queens = trick.filter((t) => t.card.rank === 12).map((t) => t.card);
    for (const q of queens) {
      deltaWinner -= 25;
      const d = doubled[cardKey(q)];
      if (d?.doubled) {
        deltaWinner -= 25;
        if (d.holder && d.holder !== winnerSeat) {
          state.scores[d.holder] += 25;
          state.dealDeltas[d.holder] += 25;
        }
      }
    }
  } else if (cid === 'ltoosh') {
    deltaWinner = -15;
  } else if (cid === 'king') {
    const tookK = trick.some(t => t.card.rank === 13 && t.card.suit === 'hearts');
    if (tookK) {
      deltaWinner = -75;
      const d = doubled['hearts:13'];
      if (d?.doubled) {
        deltaWinner -= 75;
        if (d.holder && d.holder !== winnerSeat) {
          state.scores[d.holder] += 75;
          state.dealDeltas[d.holder] += 75;
        }
      }
    }
  } else { return; }

  if (deltaWinner !== 0) {
    state.scores[winnerSeat] += deltaWinner;
    state.dealDeltas[winnerSeat] += deltaWinner;
  }
  syncTeamScores(state);
}

function advanceAfterDeal(state) {
  const owner = state.kingdomOwner;
  const cid = state.currentContract?.id;
  if (owner && cid) {
    state.contractsRemaining[owner] = (state.contractsRemaining[owner] || []).filter(x => x !== cid);
  }
  state.currentContract = null;
  state.doubling = createDoublingState();
  state.resumeAfterDoubling = null;
  state.trick = [];

  const remaining = (state.contractsRemaining[owner] || []).length;
  if (remaining > 0) {
    dealNewHands(state);
    state.phase = 'KINGDOM_PICK_CONTRACT';
    state.turn = owner;
    state.leader = owner;
    state.message = 'Pick a contract';
    return;
  }

  const nextOwner = nextSeat(owner);
  state.kingdomOwner = nextOwner;
  state.kingdomNumber += 1;

  if (state.kingdomNumber > 4) {
    state.phase = 'GAME_END';
    state.message = 'Game over';
    return;
  }

  state.phase = 'KINGDOM_PICK_CONTRACT';
  dealNewHands(state);
  state.turn = nextOwner;
  state.leader = nextOwner;
  state.message = 'New kingdom';
}

// Check if reveal-2s should trigger (partnership Trix layout: after each player's first turn)
function maybeReveal2s(state) {
  if (state.mode !== 'partners') return;
  if (state.currentContract?.id !== 'trix') return;
  // Trigger after 4 turns (each player has played/passed once)
  if (state.layoutTurnCount !== 4) return;
  if (Object.keys(state.revealed2s).length > 0) return; // already revealed

  const r2 = {};
  for (const seat of SEATS) {
    const twos = (state.hands[seat] || []).filter(c => c.rank === 2);
    if (twos.length) r2[seat] = twos.map(c => ({ suit: c.suit, rank: c.rank }));
  }
  state.revealed2s = r2;
}

export function trixReducer(prev, action) {
  const state = JSON.parse(JSON.stringify(prev));
  const events = [];

  try {
    switch (action.type) {

      case 'START_MATCH': {
        const cfg = {
          mode: action.mode || 'single',
          difficulty: action.difficulty || 'moderate',
          ruleProfile: action.ruleProfile || 'classic',
          skipSetup: true,
        };
        const s = initMatch(cfg);
        return { state: s, events: [{ type: 'match:start', mode: cfg.mode, difficulty: cfg.difficulty, ruleProfile: cfg.ruleProfile }] };
      }

      case 'RESET_MATCH': {
        // Go back to setup screen
        const s = initMatch({ mode: state.mode, difficulty: state.difficulty, ruleProfile: state.ruleProfile || 'classic' });
        return { state: s, events: [{ type: 'match:reset' }] };
      }

      case 'PICK_CONTRACT': {
        if (state.phase !== 'KINGDOM_PICK_CONTRACT') return { state, events };
        if (action.seat !== state.kingdomOwner) return { state, events };
        const cid = action.contractId;
        const remaining = state.contractsRemaining[state.kingdomOwner] || [];
        if (!remaining.includes(cid)) return { state, events };

        state.currentContract = contractById(cid);
        state.dealNumber += 1;

        state.doubling = createDoublingState();
        const profile = state.ruleProfile || 'classic';
        const allowQueensDoubling = profile === 'jawaker2025';
        const supportsDoubling = cid === 'king' || (cid === 'queens' && allowQueensDoubling);

        if (supportsDoubling) {
          const byHolder = collectDoubleCandidates(state, cid);
          const map = {};
          let southOptions = [];

          for (const seat of Object.keys(byHolder)) {
            const cards = byHolder[seat] || [];
            if (!cards.length) continue;
            if (seat === 'south') {
              southOptions = cards.map((c) => ({ suit: c.suit, rank: c.rank, key: cardKey(c) }));
              continue;
            }
            for (const key of botDoubleKeys(state, seat, cid, cards)) {
              map[key] = { holder: seat, doubled: true, closed: profile === 'jawaker2025' };
            }
          }

          if (southOptions.length) {
            state.doubling = {
              pending: true,
              contractId: cid,
              holder: 'south',
              closed: profile === 'jawaker2025',
              options: southOptions,
              doubledKeys: [],
              map,
            };
            state.resumeAfterDoubling = { turn: state.kingdomOwner, leader: state.kingdomOwner };
            state.phase = 'DOUBLING_DECISION';
            state.turn = 'south';
            state.leader = state.kingdomOwner;
            events.push({ type: 'deal:start', contractId: cid, dealNumber: state.dealNumber });
            events.push({ type: 'doubling:prompt', contractId: cid, options: southOptions.length, closed: state.doubling.closed });
            return { state, events };
          }

          if (Object.keys(map).length) {
            state.doubling = {
              pending: false,
              contractId: cid,
              holder: null,
              closed: profile === 'jawaker2025',
              options: [],
              doubledKeys: Object.keys(map),
              map,
            };
          }
        }

        state.turn = state.kingdomOwner;
        state.leader = state.kingdomOwner;
        state.phase = state.currentContract.kind === 'layout' ? 'TRIX_LAYOUT_PLAY' : 'TRICK_PLAY';
        state.message = '';
        events.push({ type: 'deal:start', contractId: cid, dealNumber: state.dealNumber });
        return { state, events };
      }

      case 'SET_TADBEEL':
      case 'SET_DOUBLES': {
        if (state.phase !== 'DOUBLING_DECISION') return { state, events };
        if (!state.doubling?.pending) return { state, events };
        const allowed = new Set((state.doubling.options || []).map((o) => o.key));
        const picked = Array.isArray(action.doubledKeys)
          ? action.doubledKeys.filter((k) => allowed.has(k))
          : (action.doubled ? (state.doubling.options || []).map((o) => o.key) : []);
        const map = { ...(state.doubling.map || {}) };
        for (const key of picked) {
          map[key] = {
            holder: state.doubling.holder || 'south',
            doubled: true,
            closed: !!state.doubling.closed,
          };
        }
        state.doubling.pending = false;
        state.doubling.doubledKeys = picked.slice();
        state.doubling.map = map;
        const resume = state.resumeAfterDoubling || { turn: state.kingdomOwner, leader: state.kingdomOwner };
        state.turn = resume.turn;
        state.leader = resume.leader;
        state.resumeAfterDoubling = null;
        state.phase = state.currentContract?.kind === 'layout' ? 'TRIX_LAYOUT_PLAY' : 'TRICK_PLAY';
        events.push({
          type: 'doubling:set',
          contractId: state.currentContract?.id || null,
          count: picked.length,
          closed: !!state.doubling.closed,
        });
        return { state, events };
      }

      case 'PLAY_CARD': {
        if (state.phase !== 'TRICK_PLAY') return { state, events };
        const seat = action.seat;
        if (seat !== state.turn) return { state, events };

        const hand = state.hands[seat] || [];
        const ledSuit = state.trick[0]?.card?.suit || null;
        const legal = legalTrickPlays(hand, ledSuit);
        const card = action.card;

        if (!legal.some(c => c.suit === card.suit && c.rank === card.rank)) return { state, events };
        if (!removeFromHand(hand, card)) return { state, events };

        state.trick.push({ seat, card });
        state.playedCards.push({ suit: card.suit, rank: card.rank, seat });
        events.push({ type: 'card:played', seat, card });

        if (state.trick.length < 4) {
          state.turn = nextSeat(state.turn);
          return { state, events };
        }

        const winner = trickWinner(state.trick);
        applyTrickScore(state, winner, state.trick);
        state.completedTricks = state.completedTricks || [];
        state.completedTricks.push({
          ledSuit: state.trick[0]?.card?.suit || null,
          winner,
          cards: state.trick.map((t) => ({ seat: t.seat, card: { suit: t.card.suit, rank: t.card.rank } })),
        });

        const pile = state.taken[winner] || [];
        for (const t of state.trick) pile.push(t.card);
        state.taken[winner] = pile;
        state.tricksTakenCount[winner] = (state.tricksTakenCount[winner] || 0) + 1;

        events.push({ type: 'trick:won', winner, trick: state.trick });

        state.trick = [];
        state.turn = winner;
        state.leader = winner;

        const cardsLeft = Object.values(state.hands).reduce((sum, h) => sum + (h?.length || 0), 0);
        if (cardsLeft === 0) {
          const deltas = scoreDealTrickContract(state);
          syncTeamScores(state);
          logDeal(state, deltas);
          events.push({ type: 'deal:end', dealNumber: state.dealNumber, deltas });
          advanceAfterDeal(state);
        }
        return { state, events };
      }

      case 'LAYOUT_PLAY': {
        if (state.phase !== 'TRIX_LAYOUT_PLAY') return { state, events };
        const seat = action.seat;
        if (seat !== state.turn) return { state, events };

        const hand = state.hands[seat] || [];
        const legal = legalLayoutPlays(hand, state.layoutBySuit);
        const card = action.card;

        if (!legal.some(c => c.suit === card.suit && c.rank === card.rank)) return { state, events };
        if (!removeFromHand(hand, card)) return { state, events };

        applyLayoutCard(state.layoutBySuit, card);
        state.playedCards.push({ suit: card.suit, rank: card.rank, seat });
        state.layoutTurnCount = (state.layoutTurnCount || 0) + 1;
        events.push({ type: 'layout:played', seat, card });

        if (hand.length === 0 && !state.outOrder.includes(seat)) {
          state.outOrder.push(seat);
          events.push({ type: 'layout:out', seat, place: state.outOrder.length });
        }

        state.turn = nextSeat(state.turn);
        maybeReveal2s(state);

        const done = SEATS.every(s => (state.hands[s]?.length || 0) === 0);
        if (done) {
          const deltas = scoreDealLayoutContract(state);
          logDeal(state, deltas);
          events.push({ type: 'deal:end', dealNumber: state.dealNumber, deltas });
          advanceAfterDeal(state);
        }
        return { state, events };
      }

      case 'LAYOUT_PASS': {
        if (state.phase !== 'TRIX_LAYOUT_PLAY') return { state, events };
        const seat = action.seat;
        if (seat !== state.turn) return { state, events };
        const hand = state.hands[seat] || [];
        const legal = legalLayoutPlays(hand, state.layoutBySuit);
        if (legal.length) return { state, events };

        state.layoutTurnCount = (state.layoutTurnCount || 0) + 1;
        events.push({ type: 'layout:pass', seat });
        state.turn = nextSeat(state.turn);
        maybeReveal2s(state);
        return { state, events };
      }

      default:
        return { state, events };
    }
  } catch (e) {
    events.push({ type: 'error', message: String(e?.message || e) });
    state.message = `Error: ${String(e?.message || e)}`;
    return { state, events };
  }
}
