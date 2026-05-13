/**
 * pdf/v3/readerViewMode.js — view-mode (Single/Continuous/Spread/Book)
 * controller for the v3 reader.
 *
 * Owns the toolbar pill, the rebuild-on-change loop, and persistence
 * via the reading-memory `mode` field.
 *
 * Target size: ≤ 80 lines.
 */

import { buildViewModePill } from './chrome/viewModePill.js';

const VALID = new Set(['single', 'continuous', 'spread', 'book']);

export function createViewModeController({
  toolbar,
  strip,
  stage,
  getPdfDoc,
  getCurrentPage,
  saveMode,
  initial = 'continuous',
} = {}) {
  let mode = VALID.has(initial) ? initial : 'continuous';

  const pill = buildViewModePill({
    onSelect: (next) => set(next),
    initial: mode,
  });
  // Mount into the toolbar's zoom cluster (third cluster).
  toolbar.root.querySelectorAll('.pdf-tb-cluster')[2]?.appendChild(pill.root);

  async function set(next) {
    if (!VALID.has(next) || next === mode) return;
    mode = next;
    pill.setActive(mode);
    if (getPdfDoc?.()) {
      await strip.rebuildForOpsChange();
      const page = getCurrentPage?.() || 1;
      strip.scrollToPage(page, stage);
      strip.setCurrentPage?.(page);
    }
    saveMode?.(mode);
  }

  function setActiveSilent(next) {
    if (!VALID.has(next)) return;
    mode = next;
    pill.setActive(mode);
  }

  return {
    set,
    setActiveSilent,
    getMode: () => mode,
  };
}
