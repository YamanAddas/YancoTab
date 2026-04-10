import { legalTrickPlays, legalLayoutPlays, rankValue, teamOf, partnerOf, SEATS, applyLayoutCard } from './trixRules.js';
import { randInt } from '../shared/rng.js';

// ─── Utility helpers ────────────────────────────────────────

function pick(arr) { return arr[randInt(arr.length)]; }
function lowest(cards)  { return cards.slice().sort((a,b) => rankValue(a.rank) - rankValue(b.rank))[0]; }
function highest(cards) { return cards.slice().sort((a,b) => rankValue(b.rank) - rankValue(a.rank))[0]; }

function hasSuit(hand, suit) { return hand.some(c => c.suit === suit); }

function countSuit(cards, suit) { return cards.filter(c => c.suit === suit).length; }

// Cards of a suit sorted low→high
function ofSuit(cards, suit) {
  return cards.filter(c => c.suit === suit).sort((a,b) => rankValue(a.rank) - rankValue(b.rank));
}

function inferVoids(completedTricks = [], currentTrick = [], currentLedSuit = null) {
  const out = { south: new Set(), east: new Set(), north: new Set(), west: new Set() };
  for (const trick of completedTricks) {
    const led = trick?.ledSuit;
    if (!led || !Array.isArray(trick.cards)) continue;
    for (const t of trick.cards) {
      if (t.card?.suit !== led) out[t.seat].add(led);
    }
  }
  if (currentLedSuit && Array.isArray(currentTrick)) {
    for (const t of currentTrick) {
      if (t.card?.suit !== currentLedSuit) out[t.seat].add(currentLedSuit);
    }
  }
  return out;
}

// Is this card a penalty card for the given contract?
function isPenalty(card, contractId) {
  if (contractId === 'diamonds') return card.suit === 'diamonds';
  if (contractId === 'queens')   return card.rank === 12;
  if (contractId === 'king')     return card.suit === 'hearts' && card.rank === 13;
  return false;
}

// ─── EASY ───────────────────────────────────────────────────

function easyTrick(view) {
  const legal = legalTrickPlays(view.hand, view.ledSuit);
  return { type: 'PLAY_CARD', card: pick(legal) };
}

function easyLayout(view) {
  const legal = legalLayoutPlays(view.hand, view.layoutBySuit);
  if (!legal.length) return { type: 'LAYOUT_PASS' };
  return { type: 'LAYOUT_PLAY', card: pick(legal) };
}

// ─── MODERATE ───────────────────────────────────────────────

function moderateTrick(view) {
  const legal = legalTrickPlays(view.hand, view.ledSuit);
  if (legal.length === 1) return { type: 'PLAY_CARD', card: legal[0] };

  const cid = view.contractId;
  const ledSuit = view.ledSuit;
  const trick = view.currentTrick || [];

  // Leading: play the safest low card
  if (!ledSuit) {
    // For penalty contracts, lead with suits where we have few cards (short suits)
    // to potentially void ourselves for future discards
    if (cid === 'diamonds') {
      // Avoid leading diamonds; prefer short non-diamond suits
      const nonDia = legal.filter(c => c.suit !== 'diamonds');
      return { type: 'PLAY_CARD', card: nonDia.length ? lowest(nonDia) : lowest(legal) };
    }
    if (cid === 'queens') {
      // Avoid leading with high cards in queen-heavy suits
      const noQ = legal.filter(c => c.rank !== 12);
      return { type: 'PLAY_CARD', card: noQ.length ? lowest(noQ) : lowest(legal) };
    }
    if (cid === 'king') {
      // Lead low; avoid hearts if possible
      const noH = legal.filter(c => c.suit !== 'hearts');
      return { type: 'PLAY_CARD', card: noH.length ? lowest(noH) : lowest(legal) };
    }
    if (cid === 'ltoosh') {
      // Lead low to minimize winning the trick
      return { type: 'PLAY_CARD', card: lowest(legal) };
    }
    return { type: 'PLAY_CARD', card: lowest(legal) };
  }

  // Following suit: try to avoid taking penalty cards
  const following = legal.filter(c => c.suit === ledSuit);
  if (following.length) {
    if (cid === 'ltoosh') {
      // Play highest card that's still lower than current trick winner
      const trickCards = trick.filter(t => t.card.suit === ledSuit);
      const highestPlayed = trickCards.length ? Math.max(...trickCards.map(t => rankValue(t.card.rank))) : 0;
      const safe = following.filter(c => rankValue(c.rank) < highestPlayed);
      // If we can play under, play the highest safe card (preserve low cards)
      if (safe.length) return { type: 'PLAY_CARD', card: highest(safe) };
      // Otherwise play lowest (least chance of winning)
      return { type: 'PLAY_CARD', card: lowest(following) };
    }
    // For penalty contracts, play under the trick winner if possible
    return { type: 'PLAY_CARD', card: lowest(following) };
  }

  // Off-suit: discard penalty cards if possible
  if (cid === 'diamonds') {
    const dia = legal.filter(c => c.suit === 'diamonds');
    if (dia.length) return { type: 'PLAY_CARD', card: highest(dia) }; // dump high diamonds
  }
  if (cid === 'queens') {
    const queens = legal.filter(c => c.rank === 12);
    if (queens.length) return { type: 'PLAY_CARD', card: queens[0] }; // dump a queen
  }
  if (cid === 'king') {
    const kh = legal.find(c => c.suit === 'hearts' && c.rank === 13);
    if (kh) return { type: 'PLAY_CARD', card: kh }; // dump K♥
  }
  // Discard highest card from longest suit
  return { type: 'PLAY_CARD', card: highest(legal) };
}

function moderateLayout(view) {
  const legal = legalLayoutPlays(view.hand, view.layoutBySuit);
  if (!legal.length) return { type: 'LAYOUT_PASS' };
  if (legal.length === 1) return { type: 'LAYOUT_PLAY', card: legal[0] };

  // Prefer playing cards that unlock more of our hand
  // Prioritize: cards adjacent to other cards we hold
  let best = legal[0];
  let bestScore = -1;
  for (const c of legal) {
    let score = 0;
    const hand = view.hand;
    // If playing this card would make another card in our hand legal next turn
    if (c.rank === 11) score += 3; // Jacks open suits - high priority
    // Check adjacency: do we hold the next card in sequence?
    if (hand.some(h => h.suit === c.suit && h.rank === c.rank - 1)) score += 2;
    if (hand.some(h => h.suit === c.suit && h.rank === c.rank + 1)) score += 2;
    if (hand.some(h => h.suit === c.suit && h.rank === c.rank - 2)) score += 1;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return { type: 'LAYOUT_PLAY', card: best };
}

// ─── HARD ───────────────────────────────────────────────────

function hardTrick(view) {
  const legal = legalTrickPlays(view.hand, view.ledSuit);
  if (legal.length === 1) return { type: 'PLAY_CARD', card: legal[0] };

  const cid = view.contractId;
  const ledSuit = view.ledSuit;
  const trick = view.currentTrick || [];
  const played = view.playedCards || [];
  const seat = view.seat;
  const partner = view.partner;
  const mode = view.mode;

  // Build a set of played cards for quick lookup
  const playedSet = new Set(played.map(c => `${c.suit}:${c.rank}`));

  // Count how many of each suit have been played
  const suitPlayed = {};
  for (const c of played) suitPlayed[c.suit] = (suitPlayed[c.suit] || 0) + 1;

  // Infer voids from completed trick history + current trick.
  const voids = inferVoids(view.completedTricks || [], trick, ledSuit);

  // Check if the K♥ is still in play
  const khPlayed = playedSet.has('hearts:13');

  // --- Leading ---
  if (!ledSuit) {
    if (cid === 'king' && !khPlayed) {
      // Lead short suits to void ourselves; avoid hearts unless all hearts are safe
      const nonH = legal.filter(c => c.suit !== 'hearts');
      if (nonH.length) {
        // Lead from shortest suit, with a small partner-void preference in partners mode.
        const suits = {};
        for (const c of nonH) suits[c.suit] = (suits[c.suit] || 0) + 1;
        const ranked = nonH.slice().sort((a, b) => {
          const av = (mode === 'partners' && partner && voids[partner]?.has(a.suit)) ? 1 : 0;
          const bv = (mode === 'partners' && partner && voids[partner]?.has(b.suit)) ? 1 : 0;
          if (av !== bv) return bv - av;
          const sa = suits[a.suit] || 0;
          const sb = suits[b.suit] || 0;
          if (sa !== sb) return sa - sb;
          return rankValue(a.rank) - rankValue(b.rank);
        });
        return { type: 'PLAY_CARD', card: ranked[0] };
      }
      return { type: 'PLAY_CARD', card: lowest(legal) };
    }

    if (cid === 'diamonds') {
      // Lead non-diamonds; if only diamonds left, lead lowest
      const nonDia = legal.filter(c => c.suit !== 'diamonds');
      if (nonDia.length) {
        // In partnership mode, slightly prefer suits partner is inferred void in.
        const ranked = nonDia.slice().sort((a, b) => {
          const av = (mode === 'partners' && partner && voids[partner]?.has(a.suit)) ? 1 : 0;
          const bv = (mode === 'partners' && partner && voids[partner]?.has(b.suit)) ? 1 : 0;
          if (av !== bv) return bv - av;
          return rankValue(a.rank) - rankValue(b.rank);
        });
        return { type: 'PLAY_CARD', card: ranked[0] };
      }
      return { type: 'PLAY_CARD', card: lowest(legal) };
    }

    if (cid === 'queens') {
      // Lead low from suits with few remaining cards (harder for opponents to duck)
      const noQ = legal.filter(c => c.rank !== 12);
      if (noQ.length) return { type: 'PLAY_CARD', card: lowest(noQ) };
      return { type: 'PLAY_CARD', card: lowest(legal) };
    }

    if (cid === 'ltoosh') {
      // Lead from longest suit (opponents more likely to follow, less control)
      // Actually: lead LOW from short suits to minimize trick-winning
      const suits = {};
      for (const c of legal) suits[c.suit] = (suits[c.suit] || 0) + 1;
      const shortest = Object.entries(suits).sort((a,b) => a[1] - b[1])[0]?.[0];
      const shortCards = legal.filter(c => c.suit === shortest);
      return { type: 'PLAY_CARD', card: lowest(shortCards) };
    }

    return { type: 'PLAY_CARD', card: lowest(legal) };
  }

  // --- Following suit ---
  const following = legal.filter(c => c.suit === ledSuit);
  if (following.length) {
    const trickSuitCards = trick.filter(t => t.card.suit === ledSuit);
    const highestInTrick = trickSuitCards.length ? Math.max(...trickSuitCards.map(t => rankValue(t.card.rank))) : 0;

    if (cid === 'ltoosh') {
      // Play the highest card that's still UNDER the current winner
      const safe = following.filter(c => rankValue(c.rank) < highestInTrick);
      if (safe.length) return { type: 'PLAY_CARD', card: highest(safe) };
      // All our cards win — play the lowest to minimize damage
      return { type: 'PLAY_CARD', card: lowest(following) };
    }

    if (cid === 'king') {
      // If K♥ is in the trick, play highest (if hearts) to avoid being stuck
      // Otherwise play under
      if (!khPlayed && ledSuit === 'hearts') {
        // Be careful; K♥ might be dropped on us
        const safe = following.filter(c => rankValue(c.rank) < highestInTrick);
        if (safe.length) return { type: 'PLAY_CARD', card: highest(safe) };
      }
      const safe = following.filter(c => rankValue(c.rank) < highestInTrick);
      if (safe.length) return { type: 'PLAY_CARD', card: highest(safe) };
      return { type: 'PLAY_CARD', card: lowest(following) };
    }

    if (cid === 'diamonds') {
      // Try to duck under
      const safe = following.filter(c => rankValue(c.rank) < highestInTrick);
      if (safe.length) return { type: 'PLAY_CARD', card: highest(safe) };
      return { type: 'PLAY_CARD', card: lowest(following) };
    }

    if (cid === 'queens') {
      // Avoid winning if queens are in the trick
      const hasQInTrick = trick.some(t => t.card.rank === 12);
      if (hasQInTrick) {
        const safe = following.filter(c => rankValue(c.rank) < highestInTrick);
        if (safe.length) return { type: 'PLAY_CARD', card: highest(safe) };
      }
      // Partnership: if partner is winning and no queens in trick, can play high
      if (mode === 'partners' && trick.length >= 1) {
        const currentWinner = trick.reduce((best, t) => {
          if (t.card.suit !== ledSuit) return best;
          return rankValue(t.card.rank) > rankValue(best.card.rank) ? t : best;
        }, trick[0]);
        if (teamOf(currentWinner.seat) === teamOf(seat) && !hasQInTrick) {
          return { type: 'PLAY_CARD', card: highest(following) };
        }
      }
      return { type: 'PLAY_CARD', card: lowest(following) };
    }

    return { type: 'PLAY_CARD', card: lowest(following) };
  }

  // --- Off-suit: discard strategically ---
  if (cid === 'diamonds') {
    const dia = legal.filter(c => c.suit === 'diamonds');
    if (dia.length) return { type: 'PLAY_CARD', card: highest(dia) };
  }
  if (cid === 'queens') {
    const queens = legal.filter(c => c.rank === 12);
    if (queens.length) return { type: 'PLAY_CARD', card: queens[0] };
    // Discard high cards from long suits
    return { type: 'PLAY_CARD', card: highest(legal) };
  }
  if (cid === 'king') {
    const kh = legal.find(c => c.suit === 'hearts' && c.rank === 13);
    if (kh) return { type: 'PLAY_CARD', card: kh };
    // Discard high hearts to void hearts suit
    const hearts = legal.filter(c => c.suit === 'hearts');
    if (hearts.length) return { type: 'PLAY_CARD', card: highest(hearts) };
  }
  if (cid === 'ltoosh') {
    // Discard highest card
    return { type: 'PLAY_CARD', card: highest(legal) };
  }
  return { type: 'PLAY_CARD', card: highest(legal) };
}

function hardLayout(view) {
  const legal = legalLayoutPlays(view.hand, view.layoutBySuit);
  if (!legal.length) return { type: 'LAYOUT_PASS' };
  if (legal.length === 1) return { type: 'LAYOUT_PLAY', card: legal[0] };

  const hand = view.hand;
  const mode = view.mode;
  const partner = view.partner;

  // Score each legal move by how many future plays it unlocks
  let best = legal[0];
  let bestScore = -999;

  for (const c of legal) {
    let score = 0;

    // Simulate: what would the layout look like after playing this?
    const simLayout = JSON.parse(JSON.stringify(view.layoutBySuit));
    applyLayoutCard(simLayout, c);

    // Count how many of our remaining cards become legal after this play
    const remainingHand = hand.filter(h => !(h.suit === c.suit && h.rank === c.rank));
    let futurePlayable = 0;
    for (const h of remainingHand) {
      const st = simLayout[h.suit];
      if (!st?.started) { if (h.rank === 11) futurePlayable++; continue; }
      const needLow = st.low > 2 ? st.low - 1 : null;
      const needHigh = st.high === 13 ? 1 : (st.high === 1 ? null : st.high + 1);
      if ((needLow && h.rank === needLow) || (needHigh && h.rank === needHigh)) futurePlayable++;
    }
    score += futurePlayable * 3;

    // Chains: how many cards in sequence do we have?
    const suitCards = remainingHand.filter(h => h.suit === c.suit).sort((a,b) => a.rank - b.rank);
    let chainLen = 0;
    let r = c.rank;
    for (const sc of suitCards) {
      if (sc.rank === r - 1 || sc.rank === r + 1) { chainLen++; r = sc.rank; }
    }
    score += chainLen * 2;

    // Jacks get a bonus (opening new suits)
    if (c.rank === 11) score += 4;

    // Preserve 2s if partner might need them visible (partnership mode, but they're auto-revealed)
    // Actually: having fewer cards overall is good → slightly prefer moves that help us empty faster

    if (score > bestScore) { bestScore = score; best = c; }
  }

  return { type: 'LAYOUT_PLAY', card: best };
}

// ─── Public entry point ─────────────────────────────────────

export function chooseMove(view) {
  // view: { phase, seat, hand, ledSuit, contractId, layoutBySuit,
  //         difficulty, currentTrick, playedCards, completedTricks, mode, partner }
  const diff = view.difficulty || 'moderate';

  if (view.phase === 'TRICK_PLAY') {
    if (diff === 'easy')   return easyTrick(view);
    if (diff === 'hard')   return hardTrick(view);
    return moderateTrick(view);
  }
  if (view.phase === 'TRIX_LAYOUT_PLAY') {
    if (diff === 'easy')   return easyLayout(view);
    if (diff === 'hard')   return hardLayout(view);
    return moderateLayout(view);
  }
  return null;
}

// Bot contract selection (used by TrixApp)
export function chooseBotContract(state, seat) {
  const remaining = new Set(state.contractsRemaining?.[seat] || []);
  if (!remaining.size) return null;
  const hand = state.hands?.[seat] || [];
  const diff = state.difficulty || 'moderate';
  const profile = state.ruleProfile || 'classic';

  if (diff === 'easy') {
    // Random pick
    const arr = Array.from(remaining);
    return arr[randInt(arr.length)];
  }

  // Moderate + Hard: heuristic scoring
  const score = (cid) => {
    if (cid === 'king') return hand.some(c => c.suit === 'hearts' && c.rank === 13) ? 100 : 20;
    if (cid === 'queens') {
      const queenCount = hand.filter((c) => c.rank === 12).length;
      const weight = profile === 'jawaker2025' ? 35 : 25;
      return 10 + weight * queenCount;
    }
    if (cid === 'diamonds') return 10 + 2 * hand.filter(c => c.suit === 'diamonds').length;
    if (cid === 'ltoosh') return 15 + hand.filter(c => c.rank >= 11).length;
    if (cid === 'trix') {
      const jacks = hand.filter(c => c.rank === 11).length;
      return 30 - jacks * 5; // More jacks = better for trix
    }
    return 50;
  };

  let best = null;
  let bestS = Infinity;
  const contracts = [{ id:'king' },{ id:'queens' },{ id:'diamonds' },{ id:'ltoosh' },{ id:'trix' }];
  for (const c of contracts) {
    if (!remaining.has(c.id)) continue;
    const s = score(c.id);
    if (s < bestS) { bestS = s; best = c.id; }
  }
  return best || Array.from(remaining)[0];
}
