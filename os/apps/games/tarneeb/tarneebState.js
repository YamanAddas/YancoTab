import { Deck } from '../cardEngine/Deck.js';
import { randInt } from '../shared/rng.js';
import { MAX_BID, MIN_BID, REDEAL_BID_TOTAL_MIN, SEATS, nextSeat, sameColorTrumpFromRevealedSuit, sortHand } from './tarneebRules.js';

function emptyCardMap() {
  return { south: [], east: [], north: [], west: [] };
}

function emptyNumberMap() {
  return { south: 0, east: 0, north: 0, west: 0 };
}

function emptyBidMap() {
  return { south: null, east: null, north: null, west: null };
}

function defaultHumans() {
  return { south: true, east: false, north: false, west: false };
}

function defaultScores() {
  return { south: 0, east: 0, north: 0, west: 0 };
}

function dealSyrian41(dealer) {
  const deck = new Deck();
  deck.shuffle();
  const hands = emptyCardMap();
  const order = [];
  // Assumption: dealing rotates from seat after dealer and ends on dealer,
  // so the final dealt card is dealer's 13th card (the revealed card).
  let cursor = nextSeat(dealer);
  for (let i = 0; i < 4; i++) {
    order.push(cursor);
    cursor = nextSeat(cursor);
  }

  let revealed = null;
  for (let r = 0; r < 13; r++) {
    for (const seat of order) {
      const card = deck.deal();
      const plain = { suit: card.suit, rank: card.rank };
      hands[seat].push(plain);
      if (r === 12 && seat === dealer) revealed = plain;
    }
  }

  for (const seat of SEATS) hands[seat] = sortHand(hands[seat]);
  if (!revealed) revealed = hands[dealer][hands[dealer].length - 1] || { suit: 'spades', rank: 1 };
  const trumpSuit = sameColorTrumpFromRevealedSuit(revealed.suit);
  return { hands, revealedLastCard: { ...revealed, seat: dealer }, trumpSuit };
}

export function freshTarneebState(config = {}) {
  const difficulty = config.difficulty || 'moderate';
  const dealer = config.dealer || SEATS[randInt(SEATS.length)];
  return {
    phase: 'SETUP',
    difficulty,
    humans: config.humans || defaultHumans(),
    dealer,
    roundNumber: 0,
    bids: emptyBidMap(),
    bidOrder: [],
    bidOrderIndex: 0,
    bidTotal: 0,
    minBid: MIN_BID,
    maxBid: MAX_BID,
    redealBidTotalMin: REDEAL_BID_TOTAL_MIN,
    hands: emptyCardMap(),
    scores: defaultScores(),
    teamBonus: { NS: 0, EW: 0 },
    roundSummary: null,
    roundLog: [],
    trumpSuit: null,
    revealedLastCard: null,
    turn: null,
    leader: null,
    trick: [],
    taken: emptyCardMap(),
    tricksWon: emptyNumberMap(),
    playedCards: [],
    completedTricks: [],
    winnerTeam: null,
    message: '',
  };
}

export function resetRoundFields(state) {
  state.bids = emptyBidMap();
  state.bidOrder = [];
  state.bidOrderIndex = 0;
  state.bidTotal = 0;
  state.turn = null;
  state.leader = null;
  state.trick = [];
  state.taken = emptyCardMap();
  state.tricksWon = emptyNumberMap();
  state.playedCards = [];
  state.completedTricks = [];
  state.roundSummary = null;
}

export function startRound(state, options = {}) {
  const keepDealer = !!options.keepDealer;
  // Assumption: when bids total < 11 and round is redealt, dealer stays the same.
  if (!keepDealer && state.roundNumber > 0) state.dealer = nextSeat(state.dealer);

  const dealt = dealSyrian41(state.dealer);
  resetRoundFields(state);
  state.roundNumber += 1;
  state.hands = dealt.hands;
  state.revealedLastCard = dealt.revealedLastCard;
  state.trumpSuit = dealt.trumpSuit;

  // Assumption: bidding starts from the seat after dealer and proceeds in seat order.
  const biddingStart = nextSeat(state.dealer);
  state.bidOrder = [];
  let seat = biddingStart;
  for (let i = 0; i < 4; i++) {
    state.bidOrder.push(seat);
    seat = nextSeat(seat);
  }
  state.bidOrderIndex = 0;
  state.turn = state.bidOrder[0];
  state.leader = null;
  state.phase = 'BIDDING';
  state.message = 'Each player bids once (2-13).';
  return state;
}

export function initTarneebMatch(config = {}) {
  const s = freshTarneebState(config);
  if (config.skipSetup) startRound(s, { keepDealer: true });
  return s;
}
