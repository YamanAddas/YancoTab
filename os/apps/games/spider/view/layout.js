// view/layout.js — Pure layout math for the Spider board.
// 10 tableau columns fill the width; a top row above holds the foundation
// "trophies" on one side and a stock indicator on the other. No DOM here —
// callers take the returned geometry and place cards absolutely.
//
// Spider is wider than Solitaire (10 columns vs 7), so cards are narrower.
// Tableau piles can grow long (deal adds 10 cards, runs get built on top),
// so we aggressively compress the fan offset when a pile approaches the
// available vertical space.

export const LAYOUT = {
  cols: 10,
  cardAspect: 1.4,           // height / width
  paddingRatio: 0.02,        // outer padding as fraction of width
  gapRatio: 0.012,           // gap between columns
  topRowGap: 0.06,           // vertical gap below the top row
  fanOpenRatio: 0.24,        // face-up tableau card offset (of card height)
  fanClosedRatio: 0.10,      // face-down cards tuck in tighter
  foundationOverlapX: 0.22,  // foundation trophies overlap horizontally
  stockOverlapX: 0.12,       // stock deal-piles overlap horizontally
};

/**
 * Compute a full layout given container pixel dimensions.
 * Returns sizes + absolute positions for every pile origin.
 *
 *   layout.piles.tableau[0..9]  — 10 columns
 *   layout.piles.foundation[0..7] — up to 8 completed-suit trophies
 *   layout.piles.stock          — origin of the right-most stock indicator
 *   layout.stockPileOffsetX     — how far each prior deal-pile shifts left
 */
export function computeLayout(containerW, containerH, opts = {}) {
  const pad = Math.max(8, containerW * LAYOUT.paddingRatio);
  const gap = Math.max(4, containerW * LAYOUT.gapRatio);
  const leftHanded = !!opts.leftHanded;

  // 10 columns with 9 gaps in the content width.
  const contentW = containerW - pad * 2;
  const cardW = Math.max(30, Math.floor((contentW - gap * (LAYOUT.cols - 1)) / LAYOUT.cols));
  const cardH = Math.floor(cardW * LAYOUT.cardAspect);

  const topY = pad;
  const tableauY = topY + cardH + Math.floor(cardH * LAYOUT.topRowGap);

  const colX = (i) => pad + i * (cardW + gap);

  // Top row layout:
  //   Right-handed: foundations on the LEFT (col 0 origin, overlapping),
  //                 stock on the RIGHT (col 9 origin, overlapping left-ward).
  //   Left-handed:  mirrored.
  const foundationOverlapX = Math.round(cardW * LAYOUT.foundationOverlapX);
  const stockOverlapX = Math.round(cardW * LAYOUT.stockOverlapX);

  const foundationOriginX = leftHanded ? colX(9) : colX(0);
  const stockOriginX = leftHanded ? colX(0) : colX(9);
  // Foundation stacks fan outward from the corner (rightward on right-handed).
  const foundationStepX = leftHanded ? -foundationOverlapX : foundationOverlapX;
  // Stock deal-piles stack toward the centre (leftward on right-handed).
  const stockStepX = leftHanded ? stockOverlapX : -stockOverlapX;

  const piles = {
    stock:      { x: stockOriginX, y: topY },
    stockStepX,
    foundation: Array.from({ length: 8 }, (_, i) => ({
      x: foundationOriginX + i * foundationStepX,
      y: topY,
    })),
    tableau:    Array.from({ length: LAYOUT.cols }, (_, i) => ({
      x: colX(i),
      y: tableauY,
    })),
  };

  const fanOpen = Math.max(8, Math.round(cardH * LAYOUT.fanOpenRatio));
  const fanClosed = Math.max(4, Math.round(cardH * LAYOUT.fanClosedRatio));

  return { cardW, cardH, pad, gap, piles, fanOpen, fanClosed, containerW, containerH };
}

/**
 * Compute a card's Y offset within a tableau pile. Face-down cards use
 * fanClosed; face-up cards use fanOpen. When a pile is about to overflow
 * the available vertical space, the caller can scale the fans — we expose
 * this as a pure function so the Board can pre-measure and shrink.
 */
export function tableauCardOffset(pile, idx, fanOpen, fanClosed) {
  let y = 0;
  for (let i = 0; i < idx; i++) {
    y += pile[i].faceUp ? fanOpen : fanClosed;
  }
  return y;
}

/**
 * Given a tableau pile and the layout, compute a *scaled* (fanOpen, fanClosed)
 * pair that guarantees the pile fits within `availableH`. Used when a long
 * run + several face-down cards would otherwise spill off the board.
 * Never returns values larger than the original; floors at 6px / 3px.
 */
export function fitFansToHeight(pile, availableH, cardH, fanOpen, fanClosed) {
  if (pile.length <= 1) return { fanOpen, fanClosed };
  const totalIfFull = tableauCardOffset(pile, pile.length - 1, fanOpen, fanClosed) + cardH;
  if (totalIfFull <= availableH) return { fanOpen, fanClosed };
  const maxStackH = availableH - cardH;
  // distribute across face-up vs face-down counts
  let faceDownCount = 0;
  let faceUpCount = 0;
  for (let i = 0; i < pile.length - 1; i++) {
    if (pile[i].faceUp) faceUpCount++;
    else faceDownCount++;
  }
  const ratio = fanClosed / Math.max(1, fanOpen);
  // solve: faceUpCount * x + faceDownCount * (x * ratio) = maxStackH
  const denom = Math.max(1, faceUpCount + faceDownCount * ratio);
  const scaledOpen = Math.max(6, Math.floor(maxStackH / denom));
  const scaledClosed = Math.max(3, Math.floor(scaledOpen * ratio));
  return { fanOpen: scaledOpen, fanClosed: scaledClosed };
}

/**
 * Total height the board needs at the current fan settings.
 */
export function minBoardHeight(state, layout) {
  let maxY = 0;
  for (const pile of state.tableau) {
    const y = tableauCardOffset(pile, pile.length, layout.fanOpen, layout.fanClosed);
    if (y > maxY) maxY = y;
  }
  return layout.piles.tableau[0].y + layout.cardH + maxY + layout.pad;
}
