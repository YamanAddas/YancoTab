// view/layout.js — Pure layout math for the Solitaire board.
// Given a container size, compute card dimensions + x/y positions for every pile
// and every stacked card. No DOM here.

export const LAYOUT = {
  cols: 7,
  cardAspect: 1.4,          // height/width
  paddingRatio: 0.03,       // outer padding as fraction of width
  gapRatio: 0.025,          // gap between columns
  topRowGap: 0.05,          // vertical gap between top row (stock/waste/foundation) and tableau
  fanOpenRatio: 0.28,       // how far down each face-up tableau card sits (of card height)
  fanClosedRatio: 0.12,     // face-down cards are tucked closer
};

/**
 * Compute a full layout given container pixel dimensions.
 * Returns sizes + absolute positions for every pile origin.
 */
export function computeLayout(containerW, containerH) {
  const pad = Math.max(8, containerW * LAYOUT.paddingRatio);
  const gap = Math.max(6, containerW * LAYOUT.gapRatio);

  // Card width: fit 7 columns with 6 gaps in the content width.
  const contentW = containerW - pad * 2;
  const cardW = Math.floor((contentW - gap * (LAYOUT.cols - 1)) / LAYOUT.cols);
  const cardH = Math.floor(cardW * LAYOUT.cardAspect);

  // Top row sits at top; tableau below with topRowGap spacing.
  const topY = pad;
  const tableauY = topY + cardH + Math.floor(cardH * LAYOUT.topRowGap);

  // Column x-positions (used by both top row and tableau).
  const colX = (i) => pad + i * (cardW + gap);

  // Top row: stock=col0, waste=col1, (gap=col2), foundations=col3..6
  const piles = {
    stock:      { x: colX(0), y: topY },
    waste:      { x: colX(1), y: topY },
    foundation: [0, 1, 2, 3].map((i) => ({ x: colX(3 + i), y: topY })),
    tableau:    [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: colX(i), y: tableauY })),
  };

  const fanOpen = Math.round(cardH * LAYOUT.fanOpenRatio);
  const fanClosed = Math.round(cardH * LAYOUT.fanClosedRatio);

  return { cardW, cardH, pad, gap, piles, fanOpen, fanClosed };
}

/**
 * Given a tableau pile and a card index within it, compute the card's Y offset
 * from the pile origin. Face-down cards use fanClosed; face-up use fanOpen.
 */
export function tableauCardOffset(pile, idx, fanOpen, fanClosed) {
  let y = 0;
  for (let i = 0; i < idx; i++) {
    y += pile[i].faceUp ? fanOpen : fanClosed;
  }
  return y;
}

/**
 * Compute the total height the board needs (for ResizeObserver / scroll).
 */
export function minBoardHeight(state, layout) {
  let maxTableau = 0;
  for (const pile of state.tableau) {
    const totalY = tableauCardOffset(pile, pile.length, layout.fanOpen, layout.fanClosed);
    if (totalY > maxTableau) maxTableau = totalY;
  }
  return layout.piles.tableau[0].y + layout.cardH + maxTableau + layout.pad;
}
