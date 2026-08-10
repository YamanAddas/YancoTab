/**
 * resourceKey.js — which spawn configs own an exclusive resource.
 *
 * An **editor** window owns one note path. It holds an in-memory buffer
 * of the whole document and flushes that whole buffer on a 300ms
 * debounce (and again on close, via flushAll), so two editors on one
 * path overwrite each other with their own stale copies: the one that
 * saves last wins, and closing a stale window is enough to revert the
 * other's work.
 *
 * What makes that silent is a guard that is otherwise correct —
 * editorFrame.update() deliberately refuses to touch the body on an
 * external `notes:changed` for the same path ("don't clobber the body
 * the user might still be editing"), so the second editor is never told
 * its buffer went stale. One editor per path is therefore an invariant,
 * not a nicety.
 *
 * A **library** window owns nothing: `payload.path` there is only an
 * initial selection, and every library window subscribes to
 * `notes:changed`, so several can coexist safely.
 *
 * The path is compared verbatim — not trimmed, not case-folded.
 * FileSystemService performs no normalization, so ' /a.txt' and
 * '/a.txt' really are different files to it, and this key must mean
 * exactly what NotesApp._initEditor means by `payload.path`.
 */

/**
 * @param {object} config — the spawn config
 * @returns {string|null} a stable ownership key, or null when this
 *   config owns nothing exclusive (several windows may coexist).
 */
export function notesResourceKey(config) {
  if (!config || typeof config !== 'object') return null;
  if (config.mode !== 'editor') return null;
  const path = config.path;
  if (typeof path !== 'string' || path === '') return null;
  return `notes:editor:${path}`;
}
