import {
  MAX_BID,
  MIN_BID,
  REDEAL_BID_TOTAL_MIN,
  SEATS,
  cardKey,
  checkWinningTeam,
  computeTeamTotals,
  legalTrickPlays,
  nextSeat,
  otherTeam,
  sameCard,
  teamOf,
  trickWinner,
} from './tarneebRules.js';
import { initTarneebMatch, startRound } from './tarneebState.js';

function removeFromHand(hand, card) {
  const idx = hand.findIndex((c) => sameCard(c, card));
  if (idx >= 0) hand.splice(idx, 1);
  return idx >= 0;
}

function scoreRound(state) {
  const playerDeltas = { south: 0, east: 0, north: 0, west: 0 };
  const teamBonusDeltas = { NS: 0, EW: 0 };

  for (const seat of SEATS) {
    const bid = Number(state.bids?.[seat] || 0);
    const won = Number(state.tricksWon?.[seat] || 0);
    if (bid <= 0) continue;
    if (won >= bid) {
      playerDeltas[seat] += bid;
      state.scores[seat] += bid;
    } else {
      playerDeltas[seat] -= bid;
      state.scores[seat] -= bid;

      // Syrian 41 wording says failed bid points are added to the opposing team.
      // We track that as a team-only bonus, separate from individual player totals.
      const opp = otherTeam(teamOf(seat));
      state.teamBonus[opp] += bid;
      teamBonusDeltas[opp] += bid;
    }
  }

  return { playerDeltas, teamBonusDeltas };
}

function closeRound(state) {
  const scored = scoreRound(state);
  const teamTotals = computeTeamTotals(state.scores, state.teamBonus);
  const winnerTeam = checkWinningTeam(state.scores);

  state.roundSummary = {
    roundNumber: state.roundNumber,
    dealer: state.dealer,
    bids: { ...state.bids },
    bidTotal: state.bidTotal,
    trumpSuit: state.trumpSuit,
    revealedLastCard: state.revealedLastCard ? { ...state.revealedLastCard } : null,
    tricksWon: { ...state.tricksWon },
    playerDeltas: scored.playerDeltas,
    teamBonusDeltas: scored.teamBonusDeltas,
    scoresAfter: { ...state.scores },
    teamBonusAfter: { ...state.teamBonus },
    teamTotalsAfter: teamTotals,
  };
  state.roundLog = state.roundLog || [];
  state.roundLog.push(state.roundSummary);

  if (winnerTeam) {
    state.phase = 'GAME_END';
    state.winnerTeam = winnerTeam;
    state.turn = null;
    state.leader = null;
    state.message = `${winnerTeam} wins`;
  } else {
    state.phase = 'ROUND_END';
    state.turn = null;
    state.leader = null;
    state.message = 'Round complete';
  }
}

export function tarneebReducer(prev, action) {
  const state = JSON.parse(JSON.stringify(prev));
  const events = [];

  try {
    switch (action.type) {
      case 'START_MATCH': {
        const difficulty = action.difficulty || state.difficulty || 'moderate';
        const s = initTarneebMatch({ difficulty, skipSetup: true, humans: state.humans });
        return { state: s, events: [{ type: 'match:start', difficulty }, { type: 'round:start', roundNumber: s.roundNumber }] };
      }

      case 'RESET_MATCH': {
        const difficulty = action.difficulty || state.difficulty || 'moderate';
        const s = initTarneebMatch({ difficulty, humans: state.humans });
        return { state: s, events: [{ type: 'match:reset' }] };
      }

      case 'PLACE_BID': {
        if (state.phase !== 'BIDDING') return { state, events };
        const seat = action.seat;
        const bid = Number(action.bid);
        if (seat !== state.turn) return { state, events };
        if (!Number.isFinite(bid) || bid < MIN_BID || bid > MAX_BID) return { state, events };
        if (state.bids[seat] != null) return { state, events };

        state.bids[seat] = bid;
        state.bidTotal += bid;
        events.push({ type: 'bid:placed', seat, bid });

        state.bidOrderIndex += 1;
        if (state.bidOrderIndex < state.bidOrder.length) {
          state.turn = state.bidOrder[state.bidOrderIndex];
          return { state, events };
        }

        if (state.bidTotal < REDEAL_BID_TOTAL_MIN) {
          events.push({ type: 'bids:redeal', total: state.bidTotal });
          startRound(state, { keepDealer: true });
          events.push({ type: 'round:start', roundNumber: state.roundNumber, redeal: true });
          return { state, events };
        }

        state.phase = 'TRICK_PLAY';
        state.leader = state.bidOrder[0];
        state.turn = state.leader;
        state.message = 'Play tricks';
        events.push({ type: 'bids:complete', bids: { ...state.bids }, total: state.bidTotal });
        return { state, events };
      }

      case 'PLAY_CARD': {
        if (state.phase !== 'TRICK_PLAY') return { state, events };
        const seat = action.seat;
        const card = action.card;
        if (seat !== state.turn || !card) return { state, events };

        const hand = state.hands[seat] || [];
        const ledSuit = state.trick?.[0]?.card?.suit || null;
        const legal = legalTrickPlays(hand, ledSuit);
        if (!legal.some((c) => sameCard(c, card))) return { state, events };
        if (!removeFromHand(hand, card)) return { state, events };

        state.trick.push({ seat, card });
        state.playedCards.push({ suit: card.suit, rank: card.rank, seat });
        events.push({ type: 'card:played', seat, card, key: cardKey(card) });

        if (state.trick.length < 4) {
          state.turn = nextSeat(state.turn);
          return { state, events };
        }

        const trickSnapshot = state.trick.slice();
        const winner = trickWinner(state.trick, state.trumpSuit);
        if (winner) {
          state.tricksWon[winner] = Number(state.tricksWon[winner] || 0) + 1;
          state.taken[winner] = (state.taken[winner] || []).concat(state.trick.map((t) => t.card));
        }
        state.completedTricks = state.completedTricks || [];
        state.completedTricks.push({
          ledSuit: trickSnapshot[0]?.card?.suit || null,
          winner,
          cards: trickSnapshot.map((t) => ({ seat: t.seat, card: { suit: t.card.suit, rank: t.card.rank } })),
        });
        events.push({ type: 'trick:won', winner, trick: trickSnapshot });

        state.trick = [];
        state.turn = winner;
        state.leader = winner;

        const cardsLeft = SEATS.reduce((sum, s) => sum + (state.hands[s]?.length || 0), 0);
        if (cardsLeft === 0) {
          closeRound(state);
          events.push({ type: 'round:end', roundNumber: state.roundNumber, summary: state.roundSummary });
          if (state.phase === 'GAME_END') events.push({ type: 'game:end', winnerTeam: state.winnerTeam });
        }
        return { state, events };
      }

      case 'NEXT_ROUND': {
        if (state.phase !== 'ROUND_END') return { state, events };
        startRound(state, { keepDealer: false });
        events.push({ type: 'round:start', roundNumber: state.roundNumber });
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
