export const SEATS = ['south', 'east', 'north', 'west'];

export const SEAT_NAMES = {
  south: 'You',
  east: 'Zbayder-man',
  north: 'CatByte',
  west: 'Abu Yousif',
};

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

export const SUIT_SYMBOLS = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const TEAMS = {
  NS: ['south', 'north'],
  EW: ['east', 'west'],
};

export const TEAM_NAMES = {
  NS: 'You + CatByte',
  EW: 'Zbayder-man + Abu Yousif',
};

export const MIN_BID = 2;
export const MAX_BID = 13;
export const REDEAL_BID_TOTAL_MIN = 11;
export const WIN_TARGET = 41;

export function nextSeat(seat) {
  const i = SEATS.indexOf(seat);
  return SEATS[(i + 1) % SEATS.length];
}

export function teamOf(seat) {
  if (TEAMS.NS.includes(seat)) return 'NS';
  if (TEAMS.EW.includes(seat)) return 'EW';
  return null;
}

export function otherTeam(team) {
  if (team === 'NS') return 'EW';
  if (team === 'EW') return 'NS';
  return null;
}

export function partnerOf(seat) {
  const team = teamOf(seat);
  if (!team) return null;
  return TEAMS[team].find((s) => s !== seat) || null;
}

export function rankValue(rank) {
  return rank === 1 ? 14 : rank;
}

export function sortHand(cards) {
  const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
  return cards.slice().sort((a, b) => {
    const sa = suitOrder[a.suit] ?? 9;
    const sb = suitOrder[b.suit] ?? 9;
    if (sa !== sb) return sa - sb;
    return rankValue(a.rank) - rankValue(b.rank);
  });
}

export function sameColorTrumpFromRevealedSuit(suit) {
  if (suit === 'clubs') return 'spades';
  if (suit === 'spades') return 'clubs';
  if (suit === 'diamonds') return 'hearts';
  if (suit === 'hearts') return 'diamonds';
  return 'spades';
}

export function legalTrickPlays(hand, ledSuit) {
  if (!ledSuit) return hand.slice();
  const follow = hand.filter((c) => c.suit === ledSuit);
  return follow.length ? follow : hand.slice();
}

export function compareTrickCards(a, b, ledSuit, trumpSuit) {
  const aTrump = a.suit === trumpSuit;
  const bTrump = b.suit === trumpSuit;
  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;
  if (a.suit === b.suit) return rankValue(a.rank) - rankValue(b.rank);
  if (a.suit === ledSuit && b.suit !== ledSuit) return 1;
  if (b.suit === ledSuit && a.suit !== ledSuit) return -1;
  return 0;
}

export function trickWinner(trick, trumpSuit) {
  if (!Array.isArray(trick) || !trick.length) return null;
  const ledSuit = trick[0].card.suit;
  let best = trick[0];
  for (const t of trick.slice(1)) {
    if (compareTrickCards(t.card, best.card, ledSuit, trumpSuit) > 0) best = t;
  }
  return best.seat;
}

export function cardKey(card) {
  return `${card?.suit || 'x'}:${card?.rank || 0}`;
}

export function sameCard(a, b) {
  return !!a && !!b && a.suit === b.suit && a.rank === b.rank;
}

export function computeTeamTotals(scores, teamBonus = null) {
  const totals = { NS: 0, EW: 0 };
  for (const seat of SEATS) {
    const team = teamOf(seat);
    totals[team] += Number(scores?.[seat] || 0);
  }
  if (teamBonus) {
    totals.NS += Number(teamBonus.NS || 0);
    totals.EW += Number(teamBonus.EW || 0);
  }
  return totals;
}

export function checkWinningTeam(scores) {
  for (const team of ['NS', 'EW']) {
    for (const seat of TEAMS[team]) {
      const partner = partnerOf(seat);
      const own = Number(scores?.[seat] || 0);
      const p = Number(scores?.[partner] || 0);
      if (own >= WIN_TARGET && p > 0) return team;
    }
  }
  return null;
}
