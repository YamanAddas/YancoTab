/**
 * notes/intents.js — pure helpers + small side-effect wrappers for
 * the Constellation shell. Each returns the new state or applies a
 * targeted patch through persistence.js.
 *
 * The shell holds the live notes array (combination of fs reads +
 * meta entries). These intents return new versions of that array
 * so render passes are deterministic.
 */

import { setEntry, removeEntry } from './persistence.js';

/** Returns a fresh notes array with the given path's meta merged. */
export function patchMeta(notes, path, patch) {
  if (!Array.isArray(notes) || !path || !patch) return notes;
  return notes.map((n) => (n.path === path
    ? { ...n, meta: { ...(n.meta || {}), ...patch } }
    : n));
}

export function persistMeta(kernel, path, patch) {
  setEntry(kernel, path, patch);
}

export function removeNote(notes, path) {
  if (!Array.isArray(notes) || !path) return notes;
  return notes.filter((n) => n.path !== path);
}

export function persistRemove(kernel, path) {
  removeEntry(kernel, path);
}

/** Replace one note's body in the live array. */
export function setBody(notes, path, body) {
  if (!Array.isArray(notes) || !path) return notes;
  return notes.map((n) => (n.path === path ? { ...n, body: String(body || '') } : n));
}

/** Replace one note's title (computed from body or user rename). */
export function setTitle(notes, path, title) {
  if (!Array.isArray(notes) || !path) return notes;
  const t = String(title || '').trim() || 'Untitled';
  return notes.map((n) => (n.path === path
    ? { ...n, title: t, meta: { ...(n.meta || {}), title: t } }
    : n));
}
