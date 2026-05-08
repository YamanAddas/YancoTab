/**
 * pdf/persistence.js — kernel.storage adapters for PDF Codex.
 *
 * Two keys:
 *   yancotab_pdf_streak_v1     — { days: { 'YYYY-MM-DD': {...} } }
 *   yancotab_pdf_bookmarks_v1  — { [docId]: [bookmark, ...] }
 *
 * The legacy `yancotab_pdf_recent` key (recently-opened) stays in
 * use as-is — already registered.
 */

import { emptyState as emptyStreak, pushOpen, prune } from './engine/streak.js';
import { emptyMap, listForDoc, add, remove, clearDoc } from './engine/bookmarks.js';
import {
  emptyMap as emptyHighlightMap,
  listForDoc as listHighlightsForDoc,
  listForDocPage as listHighlightsForDocPage,
  add as addHighlightEntry,
  remove as removeHighlightEntry,
  clearDoc as clearHighlightsForDocEntry,
} from './engine/highlights.js';

const STREAK_KEY = 'yancotab_pdf_streak_v1';
const BOOKMARKS_KEY = 'yancotab_pdf_bookmarks_v1';
const HIGHLIGHTS_KEY = 'yancotab_pdf_highlights_v1';

export const STORAGE_KEYS = Object.freeze({
  STREAK: STREAK_KEY,
  BOOKMARKS: BOOKMARKS_KEY,
  HIGHLIGHTS: HIGHLIGHTS_KEY,
});

// ── Streak ─────────────────────────────────────────────────

export function loadStreak(kernel) {
  try {
    const raw = kernel?.storage?.load?.(STREAK_KEY);
    if (raw && typeof raw === 'object') return raw;
  } catch { /* ignore */ }
  return emptyStreak();
}

export function saveStreak(kernel, state) {
  try { kernel?.storage?.save?.(STREAK_KEY, state); } catch { /* ignore */ }
}

/** Record an open event for today, prune > 90d, persist. Returns new state. */
export function recordOpen(kernel, ts = Date.now()) {
  const next = prune(pushOpen(loadStreak(kernel), ts), 90, ts);
  saveStreak(kernel, next);
  return next;
}

// ── Bookmarks ──────────────────────────────────────────────

export function loadBookmarks(kernel) {
  try {
    const raw = kernel?.storage?.load?.(BOOKMARKS_KEY);
    if (raw && typeof raw === 'object') return raw;
  } catch { /* ignore */ }
  return emptyMap();
}

export function saveBookmarks(kernel, map) {
  try { kernel?.storage?.save?.(BOOKMARKS_KEY, map); } catch { /* ignore */ }
}

export function listBookmarks(kernel, docId) {
  return listForDoc(loadBookmarks(kernel), docId);
}

export function addBookmark(kernel, docId, entry) {
  const next = add(loadBookmarks(kernel), docId, entry);
  saveBookmarks(kernel, next);
  return next;
}

export function removeBookmark(kernel, docId, page, label = null) {
  const next = remove(loadBookmarks(kernel), docId, page, label);
  saveBookmarks(kernel, next);
  return next;
}

export function clearBookmarksForDoc(kernel, docId) {
  const next = clearDoc(loadBookmarks(kernel), docId);
  saveBookmarks(kernel, next);
  return next;
}

// ── Highlights ─────────────────────────────────────────────

export function loadHighlights(kernel) {
  try {
    const raw = kernel?.storage?.load?.(HIGHLIGHTS_KEY);
    if (raw && typeof raw === 'object') return raw;
  } catch { /* ignore */ }
  return emptyHighlightMap();
}

export function saveHighlights(kernel, map) {
  try { kernel?.storage?.save?.(HIGHLIGHTS_KEY, map); } catch { /* ignore */ }
}

export function listHighlights(kernel, docId) {
  return listHighlightsForDoc(loadHighlights(kernel), docId);
}

export function listHighlightsOnPage(kernel, docId, page) {
  return listHighlightsForDocPage(loadHighlights(kernel), docId, page);
}

export function addHighlight(kernel, docId, entry) {
  const next = addHighlightEntry(loadHighlights(kernel), docId, entry);
  saveHighlights(kernel, next);
  return next;
}

export function removeHighlight(kernel, docId, page, text) {
  const next = removeHighlightEntry(loadHighlights(kernel), docId, page, text);
  saveHighlights(kernel, next);
  return next;
}

export function clearHighlightsForDoc(kernel, docId) {
  const next = clearHighlightsForDocEntry(loadHighlights(kernel), docId);
  saveHighlights(kernel, next);
  return next;
}
