/**
 * pdf/v3/ops/pageOps.js — per-page non-destructive view-state helpers.
 *
 * Mutations live in pdfStore.viewState[docId]:
 *   - pageRotations: { [pageNum]: 0 | 90 | 180 | 270 }
 *   - pageOmits:     number[]   pages hidden from the strip + thumbs
 *   - pageOrder:     number[]   display order; absent = natural order
 *
 * Nothing here touches the PDF binary — that's Phase D5e (bake-on-
 * export via pdf-lib). The reader respects these fields when rendering.
 *
 * Pure-ish: IO is injected so the helpers are testable.
 *
 * Target size: ≤ 200 lines.
 */

const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);

/**
 * Read the pageOps slice of viewState. Returns a normalized object
 * with safe defaults even if the saved state is missing or malformed.
 */
export async function loadPageOps(pdfStore, docId) {
  if (!pdfStore || !docId) return emptyPageOps();
  let saved = null;
  try { saved = await pdfStore.getViewState(docId); } catch { /* best-effort */ }
  return normalize(saved);
}

/**
 * Persist a patch to viewState. Merges with whatever else is there
 * (zoom, scrollY, mode, etc.) since pdfStore.saveViewState does a
 * shallow merge.
 */
export async function savePageOps(pdfStore, docId, patch) {
  if (!pdfStore || !docId) return;
  try { await pdfStore.saveViewState(docId, patch); }
  catch { /* best-effort — the next save likely succeeds */ }
}

export function emptyPageOps() {
  return { pageRotations: {}, pageOmits: [], pageOrder: null };
}

function normalize(saved) {
  const out = emptyPageOps();
  if (!saved || typeof saved !== 'object') return out;
  // Rotations — clamp to the four legal values.
  if (saved.pageRotations && typeof saved.pageRotations === 'object') {
    for (const [k, v] of Object.entries(saved.pageRotations)) {
      const page = Number(k);
      const deg = ((Number(v) || 0) + 360) % 360;
      if (Number.isFinite(page) && page >= 1 && ALLOWED_ROTATIONS.has(deg) && deg !== 0) {
        out.pageRotations[page] = deg;
      }
    }
  }
  // Omits — strip non-finite and duplicates.
  if (Array.isArray(saved.pageOmits)) {
    out.pageOmits = [...new Set(saved.pageOmits.filter((p) => Number.isFinite(p) && p >= 1))];
    out.pageOmits.sort((a, b) => a - b);
  }
  // PageOrder — keep as-is if it's a non-empty number array, else null.
  if (Array.isArray(saved.pageOrder) && saved.pageOrder.length > 0
      && saved.pageOrder.every((p) => Number.isFinite(p) && p >= 1)) {
    out.pageOrder = [...saved.pageOrder];
  }
  return out;
}

// ── Mutation helpers (pure; return a NEW pageOps object) ──

export function rotatePage(state, page, delta = 90) {
  if (!Number.isFinite(page) || page < 1) return state;
  const cur = state.pageRotations[page] || 0;
  const next = ((cur + delta) % 360 + 360) % 360;
  const out = { ...state, pageRotations: { ...state.pageRotations } };
  if (next === 0) delete out.pageRotations[page];
  else out.pageRotations[page] = next;
  return out;
}

export function setRotation(state, page, deg) {
  if (!Number.isFinite(page) || page < 1) return state;
  const d = ((Number(deg) || 0) % 360 + 360) % 360;
  const out = { ...state, pageRotations: { ...state.pageRotations } };
  if (d === 0) delete out.pageRotations[page];
  else out.pageRotations[page] = d;
  return out;
}

export function deletePage(state, page) {
  if (!Number.isFinite(page) || page < 1) return state;
  if (state.pageOmits.includes(page)) return state;
  return {
    ...state,
    pageOmits: [...state.pageOmits, page].sort((a, b) => a - b),
  };
}

export function restorePage(state, page) {
  if (!state.pageOmits.includes(page)) return state;
  return {
    ...state,
    pageOmits: state.pageOmits.filter((p) => p !== page),
  };
}

/** Is this page hidden from the view? */
export function isOmitted(state, page) {
  return state && Array.isArray(state.pageOmits) && state.pageOmits.includes(page);
}

/** Rotation in degrees for this page (0 if no override). */
export function rotationFor(state, page) {
  return (state && state.pageRotations && state.pageRotations[page]) || 0;
}
