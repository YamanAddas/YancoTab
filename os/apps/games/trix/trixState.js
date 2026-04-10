import { Deck } from '../cardEngine/Deck.js';
import { CONTRACTS, SEATS, find7HeartsOwner, sortHand, TEAMS } from './trixRules.js';

export function freshMatchState(config = {}) {
  const mode = config.mode || 'single';        // 'single' | 'partners'
  const difficulty = config.difficulty || 'moderate'; // 'easy' | 'moderate' | 'hard'
  const ruleProfile = config.ruleProfile || 'classic'; // 'classic' | 'jawaker2025'
  return {
    phase: 'SETUP',  // SETUP -> KINGDOM_PICK_CONTRACT -> play phases -> GAME_END
    mode,
    difficulty,
    ruleProfile,
    kingdomNumber: 0,
    kingdomOwner: null,
    contractsRemaining: {},
    currentContract: null,
    dealNumber: 0,
    dealLog: [],
    doubling: {
      pending: false,
      contractId: null,
      holder: null,
      closed: false,
      options: [],
      doubledKeys: [],
      map: {},
    },
    resumeAfterDoubling: null,
    scores: { south: 0, east: 0, north: 0, west: 0 },
    teamScores: { A: 0, B: 0 },
    dealDeltas: { south: 0, east: 0, north: 0, west: 0 },
    hands: { south: [], east: [], north: [], west: [] },
    turn: null,
    leader: null,
    trick: [],
    taken: { south: [], east: [], north: [], west: [] },
    tricksTakenCount: { south: 0, east: 0, north: 0, west: 0 },
    layoutBySuit: {},
    outOrder: [],
    // Card history (for Hard AI)
    playedCards: [],  // [{suit, rank, seat}]
    completedTricks: [], // [{ledSuit, winner, cards:[{seat, card}]}]
    // Partnership Trex: revealed 2s after first round
    revealed2s: {},   // seat -> [{suit, rank}]
    layoutTurnCount: 0,  // tracks turns taken in layout contract
    message: '',
  };
}

export function dealNewHands(state) {
  const deck = new Deck();
  deck.shuffle();
  const hands = { south: [], east: [], north: [], west: [] };
  for (let i = 0; i < 13; i++) {
    for (const seat of SEATS) {
      const c = deck.deal(); hands[seat].push({ suit: c.suit, rank: c.rank });
    }
  }
  for (const seat of SEATS) hands[seat] = sortHand(hands[seat]);
  state.hands = hands;
  state.trick = [];
  state.taken = { south: [], east: [], north: [], west: [] };
  state.tricksTakenCount = { south: 0, east: 0, north: 0, west: 0 };
  state.dealDeltas = { south: 0, east: 0, north: 0, west: 0 };
  state.layoutBySuit = {};
  state.outOrder = [];
  state.playedCards = [];
  state.completedTricks = [];
  state.revealed2s = {};
  state.layoutTurnCount = 0;
  return state;
}

export function initMatch(config = {}) {
  const s = freshMatchState(config);
  // If config says skip setup (internal use), go straight to play
  if (config.skipSetup) {
    dealNewHands(s);
    const firstOwner = find7HeartsOwner(s.hands);
    s.kingdomNumber = 1;
    s.kingdomOwner = firstOwner;
    s.turn = firstOwner;
    s.leader = firstOwner;
    s.contractsRemaining = {};
    for (const seat of SEATS) s.contractsRemaining[seat] = CONTRACTS.map(c => c.id);
    s.currentContract = null;
    s.dealNumber = 0;
    s.phase = 'KINGDOM_PICK_CONTRACT';
    s.message = `Kingdom 1/4`;
  }
  return s;
}
