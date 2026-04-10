import { randInt } from '../shared/rng.js';

export const SEATS = ['south', 'east', 'north', 'west'];
export const SEAT_NAMES = {
  south: 'You',
  north: 'CatByte',
  east: 'Zbayder-man',
  west: 'Abu Yousif',
};

export const TEAMS = { A: ['south', 'north'], B: ['east', 'west'] };
export const TEAM_NAMES = { A: 'You + CatByte', B: 'Zbayder-man + Abu Yousif' };

export function teamOf(seat) {
  if (TEAMS.A.includes(seat)) return 'A';
  if (TEAMS.B.includes(seat)) return 'B';
  return null;
}
export function partnerOf(seat) {
  const t = teamOf(seat);
  return t ? TEAMS[t].find(s => s !== seat) : null;
}

export const CONTRACTS = [
  { id: 'king', name: 'King of Hearts', kind: 'trick' },
  { id: 'queens', name: 'Queens', kind: 'trick' },
  { id: 'diamonds', name: 'Diamonds', kind: 'trick' },
  { id: 'ltoosh', name: 'Ltoosh', kind: 'trick' },
  { id: 'trix', name: 'Trix', kind: 'layout' },
];

export const TRIX_LAYOUT_SCORES = [200, 150, 100, 50];

export function nextSeat(seat) {
  const i = SEATS.indexOf(seat);
  return SEATS[(i + 1) % SEATS.length];
}
export function seatIndex(seat) { return SEATS.indexOf(seat); }

export function cardKey(card) { return `${card.suit}:${card.rank}`; }
export function parseCardKey(key) { const [suit, r] = key.split(':'); return { suit, rank: Number(r) }; }
export function isSameCard(a, b) { return a && b && a.suit === b.suit && a.rank === b.rank; }

export function rankValue(rank) { return rank === 1 ? 14 : rank; }

export function trickWinner(trick) {
  const ledSuit = trick[0].card.suit;
  let best = trick[0];
  for (const t of trick.slice(1)) {
    if (t.card.suit !== ledSuit) continue;
    if (rankValue(t.card.rank) > rankValue(best.card.rank)) best = t;
  }
  return best.seat;
}

export function legalTrickPlays(hand, ledSuit) {
  if (!ledSuit) return hand.slice();
  const follow = hand.filter(c => c.suit === ledSuit);
  return follow.length ? follow : hand.slice();
}

export function find7HeartsOwner(hands) {
  for (const seat of Object.keys(hands)) {
    if (hands[seat].some(c => c.suit === 'hearts' && c.rank === 7)) return seat;
  }
  return 'south';
}

export function legalLayoutPlays(hand, layoutBySuit) {
  const legal = [];
  const nextHigh = (high) => { if (high === 13) return 1; if (high === 1) return null; return high + 1; };
  for (const c of hand) {
    const st = layoutBySuit[c.suit];
    if (!st || st.started !== true) { if (c.rank === 11) legal.push(c); continue; }
    const needLow = (st.low > 2) ? (st.low - 1) : null;
    const needHigh = nextHigh(st.high);
    if ((needLow && c.rank === needLow) || (needHigh && c.rank === needHigh)) legal.push(c);
  }
  return legal;
}

export function applyLayoutCard(layoutBySuit, card) {
  const s = card.suit;
  let st = layoutBySuit[s];
  const nextHigh = (high) => { if (high === 13) return 1; if (high === 1) return null; return high + 1; };
  if (!st || st.started !== true) { layoutBySuit[s] = { started: true, low: 11, high: 11 }; return; }
  const needLow = (st.low > 2) ? (st.low - 1) : null;
  const needHigh = nextHigh(st.high);
  if (needLow && card.rank === needLow) st.low -= 1;
  else if (needHigh && card.rank === needHigh) st.high = card.rank;
}

export function sortHand(hand) {
  const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
  return hand.slice().sort((a, b) => {
    const sa = suitOrder[a.suit] ?? 9; const sb = suitOrder[b.suit] ?? 9;
    if (sa !== sb) return sa - sb;
    return rankValue(a.rank) - rankValue(b.rank);
  });
}
