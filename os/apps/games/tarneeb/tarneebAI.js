import { randInt } from '../shared/rng.js';
import {
  MAX_BID,
  MIN_BID,
  REDEAL_BID_TOTAL_MIN,
  compareTrickCards,
  legalTrickPlays,
  rankValue,
  teamOf,
} from './tarneebRules.js';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pick(arr) {
  if (!arr?.length) return null;
  return arr[randInt(arr.length)];
}

function byLow(cards) {
  return cards.slice().sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
}

function byHigh(cards) {
  return cards.slice().sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
}

function currentWinner(trick, trumpSuit) {
  if (!Array.isArray(trick) || !trick.length) return null;
  const ledSuit = trick[0].card.suit;
  let best = trick[0];
  for (const t of trick.slice(1)) {
    if (compareTrickCards(t.card, best.card, ledSuit, trumpSuit) > 0) best = t;
  }
  return best;
}

function canBeat(card, winnerEntry, ledSuit, trumpSuit) {
  if (!winnerEntry) return true;
  return compareTrickCards(card, winnerEntry.card, ledSuit, trumpSuit) > 0;
}

function lowestWinningCard(cards, winnerEntry, ledSuit, trumpSuit) {
  const wins = byLow(cards).filter((c) => canBeat(c, winnerEntry, ledSuit, trumpSuit));
  return wins[0] || null;
}

function highestLosingCard(cards, winnerEntry, ledSuit, trumpSuit) {
  const loses = byHigh(cards).filter((c) => !canBeat(c, winnerEntry, ledSuit, trumpSuit));
  return loses[0] || null;
}

function countSuit(cards, suit) {
  return cards.reduce((n, c) => n + (c.suit === suit ? 1 : 0), 0);
}

function inferVoids(completedTricks = []) {
  const out = { south: new Set(), east: new Set(), north: new Set(), west: new Set() };
  for (const trick of completedTricks) {
    const led = trick?.ledSuit;
    if (!led || !Array.isArray(trick.cards)) continue;
    for (const t of trick.cards) {
      if (t.card?.suit !== led) out[t.seat].add(led);
    }
  }
  return out;
}

function unknownHigherCount(card, view) {
  const known = new Set();
  for (const c of view.playedCards || []) known.add(`${c.suit}:${c.rank}`);
  for (const c of view.hand || []) known.add(`${c.suit}:${c.rank}`);
  for (const t of view.currentTrick || []) known.add(`${t.card.suit}:${t.card.rank}`);
  let count = 0;
  for (let r = 1; r <= 13; r++) {
    if (rankValue(r) <= rankValue(card.rank)) continue;
    if (!known.has(`${card.suit}:${r}`)) count += 1;
  }
  return count;
}

function estimateBidBase(view, level = 'moderate') {
  const hand = view.hand || [];
  const trump = view.trumpSuit;
  const suitCounts = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
  for (const c of hand) suitCounts[c.suit] += 1;

  let strength = 0;
  let topCount = 0;
  for (const c of hand) {
    const rv = rankValue(c.rank);
    const isTrump = c.suit === trump;
    if (isTrump) {
      if (rv >= 14) strength += 2.6;
      else if (rv >= 13) strength += 2.0;
      else if (rv >= 12) strength += 1.6;
      else if (rv >= 11) strength += 1.2;
      else if (rv >= 9) strength += 0.8;
      else strength += 0.45;
    } else {
      if (rv >= 14) strength += 1.35;
      else if (rv >= 13) strength += 0.9;
      else if (rv >= 12) strength += 0.55;
      else if (rv >= 11) strength += 0.35;
      else if (rv >= 10) strength += 0.2;
    }
    if (rv >= 12) topCount += 1;
  }

  const trumpCount = suitCounts[trump] || 0;
  strength += Math.max(0, trumpCount - 3) * 0.55;
  if (trumpCount >= 6) strength += 0.9;

  for (const s of Object.keys(suitCounts)) {
    if (s === trump) continue;
    if (suitCounts[s] <= 1 && trumpCount >= 4) strength += 0.45;
  }

  if (level === 'hard') {
    strength += Math.max(0, topCount - 5) * 0.2;
    if (trumpCount >= 5 && topCount >= 6) strength += 0.5;
  }

  const raw = 2 + strength / 2.0;
  return clamp(Math.round(raw), MIN_BID, MAX_BID);
}

function adjustForTableFlow(view, bid) {
  const bidTotalSoFar = Number(view.bidTotalSoFar || 0);
  const remainingAfterMe = Number(view.remainingAfterMe || 0);
  if (remainingAfterMe === 0 && bidTotalSoFar + bid < REDEAL_BID_TOTAL_MIN) {
    return clamp(REDEAL_BID_TOTAL_MIN - bidTotalSoFar, MIN_BID, MAX_BID);
  }
  return bid;
}

function chooseEasyBid(view) {
  const base = estimateBidBase(view, 'easy');
  const noisy = clamp(base + randInt(5) - 2, MIN_BID, MAX_BID);
  return adjustForTableFlow(view, noisy);
}

function chooseModerateBid(view) {
  const base = estimateBidBase(view, 'moderate');
  const noisy = clamp(base + randInt(3) - 1, MIN_BID, MAX_BID);
  return adjustForTableFlow(view, noisy);
}

function chooseHardBid(view) {
  let bid = estimateBidBase(view, 'hard');
  const trumpCount = countSuit(view.hand || [], view.trumpSuit);
  if (trumpCount >= 6) bid += 1;
  if (trumpCount <= 2) bid -= 1;
  bid = clamp(bid, MIN_BID, MAX_BID);
  return adjustForTableFlow(view, bid);
}

function selectDiscard(legal, trumpSuit, aggressive = false) {
  const nonTrump = legal.filter((c) => c.suit !== trumpSuit);
  if (nonTrump.length) return aggressive ? byHigh(nonTrump)[0] : byLow(nonTrump)[0];
  return aggressive ? byHigh(legal)[0] : byLow(legal)[0];
}

function easyPlay(view) {
  const legal = legalTrickPlays(view.hand || [], view.ledSuit || null);
  if (!legal.length) return null;
  if (!view.ledSuit) return { type: 'PLAY_CARD', card: pick(legal) };
  const low = byLow(legal);
  return { type: 'PLAY_CARD', card: pick(low.slice(0, Math.min(3, low.length))) || low[0] };
}

function moderatePlay(view) {
  const legal = legalTrickPlays(view.hand || [], view.ledSuit || null);
  if (!legal.length) return null;
  if (legal.length === 1) return { type: 'PLAY_CARD', card: legal[0] };

  const seat = view.seat;
  const team = teamOf(seat);
  const need = Math.max(0, Number(view.bid || 0) - Number(view.tricksWon || 0));
  const ledSuit = view.ledSuit || null;
  const trumpSuit = view.trumpSuit;
  const trick = view.currentTrick || [];
  const winner = currentWinner(trick, trumpSuit);
  const partnerWinning = winner ? teamOf(winner.seat) === team : false;

  if (!ledSuit) {
    if (need > 0) {
      const nonTrumpHigh = byHigh(legal.filter((c) => c.suit !== trumpSuit));
      if (nonTrumpHigh.length) return { type: 'PLAY_CARD', card: nonTrumpHigh[0] };
      return { type: 'PLAY_CARD', card: byHigh(legal)[0] };
    }
    const nonTrumpLow = byLow(legal.filter((c) => c.suit !== trumpSuit));
    return { type: 'PLAY_CARD', card: nonTrumpLow[0] || byLow(legal)[0] };
  }

  const following = legal.filter((c) => c.suit === ledSuit);
  if (following.length) {
    if (need > 0 && !partnerWinning) {
      const win = lowestWinningCard(following, winner, ledSuit, trumpSuit);
      if (win) return { type: 'PLAY_CARD', card: win };
    }
    const lose = highestLosingCard(following, winner, ledSuit, trumpSuit);
    if (lose) return { type: 'PLAY_CARD', card: lose };
    return { type: 'PLAY_CARD', card: byLow(following)[0] };
  }

  const trumps = legal.filter((c) => c.suit === trumpSuit);
  if (trumps.length) {
    if (need > 0 && !partnerWinning) {
      const winTrump = lowestWinningCard(trumps, winner, ledSuit, trumpSuit);
      if (winTrump) return { type: 'PLAY_CARD', card: winTrump };
    }
    if (!need || partnerWinning) return { type: 'PLAY_CARD', card: selectDiscard(legal, trumpSuit, false) };
    return { type: 'PLAY_CARD', card: byLow(trumps)[0] };
  }

  return { type: 'PLAY_CARD', card: selectDiscard(legal, trumpSuit, need > 0) };
}

function hardPlay(view) {
  const legal = legalTrickPlays(view.hand || [], view.ledSuit || null);
  if (!legal.length) return null;
  if (legal.length === 1) return { type: 'PLAY_CARD', card: legal[0] };

  const seat = view.seat;
  const team = teamOf(seat);
  const need = Math.max(0, Number(view.bid || 0) - Number(view.tricksWon || 0));
  const ledSuit = view.ledSuit || null;
  const trumpSuit = view.trumpSuit;
  const trick = view.currentTrick || [];
  const winner = currentWinner(trick, trumpSuit);
  const partnerWinning = winner ? teamOf(winner.seat) === team : false;
  const voids = inferVoids(view.completedTricks || []);
  const opponents = (view.opponents || []);

  if (!ledSuit) {
    let best = legal[0];
    let bestScore = -1e9;
    for (const c of legal) {
      const unknownHigher = unknownHigherCount(c, view);
      const oppVoidCount = opponents.reduce((n, op) => n + (voids[op]?.has(c.suit) ? 1 : 0), 0);
      const isTrump = c.suit === trumpSuit;
      const rv = rankValue(c.rank);
      let score = 0;

      if (need > 0) {
        score += isTrump ? 4.8 : 2.1;
        score += rv / 10;
        score -= unknownHigher * (isTrump ? 0.8 : 1.2);
      } else {
        score -= isTrump ? 2.6 : 0.7;
        score -= rv / 12;
        score += unknownHigher * 0.4;
      }

      score -= oppVoidCount * (need > 0 ? 0.7 : 1.3);
      score += (randInt(100) - 50) * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return { type: 'PLAY_CARD', card: best };
  }

  const following = legal.filter((c) => c.suit === ledSuit);
  if (following.length) {
    if (need > 0 && !partnerWinning) {
      const win = lowestWinningCard(following, winner, ledSuit, trumpSuit);
      if (win) return { type: 'PLAY_CARD', card: win };
    }
    if (partnerWinning && need <= 0) return { type: 'PLAY_CARD', card: byLow(following)[0] };
    const lose = highestLosingCard(following, winner, ledSuit, trumpSuit);
    if (lose) return { type: 'PLAY_CARD', card: lose };
    return { type: 'PLAY_CARD', card: byLow(following)[0] };
  }

  const trumps = legal.filter((c) => c.suit === trumpSuit);
  if (trumps.length) {
    if (need > 0 && !partnerWinning) {
      const winTrump = lowestWinningCard(trumps, winner, ledSuit, trumpSuit);
      if (winTrump) return { type: 'PLAY_CARD', card: winTrump };
    }
    if (partnerWinning || need <= 0) return { type: 'PLAY_CARD', card: selectDiscard(legal, trumpSuit, false) };
    return { type: 'PLAY_CARD', card: byLow(trumps)[0] };
  }

  return { type: 'PLAY_CARD', card: selectDiscard(legal, trumpSuit, need > 0) };
}

export function chooseBid(view) {
  const difficulty = view.difficulty || 'moderate';
  if (difficulty === 'easy') return chooseEasyBid(view);
  if (difficulty === 'hard') return chooseHardBid(view);
  return chooseModerateBid(view);
}

export function chooseMove(view) {
  const difficulty = view.difficulty || 'moderate';
  if (difficulty === 'easy') return easyPlay(view);
  if (difficulty === 'hard') return hardPlay(view);
  return moderatePlay(view);
}
