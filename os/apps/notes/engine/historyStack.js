/**
 * notes/engine/historyStack.js — pure undo/redo stack for note bodies.
 *
 * Strategy: snapshot-on-commit. The editor calls push(body) every time
 * a save lands (debounced 300ms in the view layer). The stack stores
 * up to N versions. undo() returns the previous version; redo()
 * returns the next forward version.
 *
 * The stack distinguishes between:
 *   - "live" — the current in-editor body (not necessarily on the stack)
 *   - "stack" — committed snapshots
 *
 * This means Ctrl+Z first reverts uncommitted typing to the latest
 * snapshot, then walks backwards through the stack. Ctrl+Y replays
 * forward.
 *
 * Capped at MAX_DEPTH per note. Older entries fall off the back.
 *
 * The stack is JSON-serialisable so callers can persist it via
 * kernel.storage.
 *
 * Target size: ≤ 130 lines.
 */

const MAX_DEPTH = 100;

export function createHistoryStack({ initialBody = '', initial } = {}) {
  // initial = { entries, index, live } — for hydration from storage.
  /** @type {string[]} */
  let entries = [];
  let index = -1;
  let live = initialBody;

  if (initial && Array.isArray(initial.entries) && initial.entries.length > 0) {
    entries = initial.entries.slice(0, MAX_DEPTH);
    index = Math.max(0, Math.min(entries.length - 1, Number(initial.index) || 0));
    live = typeof initial.live === 'string' ? initial.live : (entries[index] || '');
  } else if (initial && Array.isArray(initial.entries)) {
    // Hydration was attempted but the entries array is empty — treat as
    // fresh state so canUndo() doesn't trip on `live !== undefined`.
    entries = [];
    index = -1;
    live = typeof initial.live === 'string' ? initial.live : '';
  } else {
    entries = [initialBody];
    index = 0;
    live = initialBody;
  }

  function push(body) {
    const s = typeof body === 'string' ? body : '';
    // No-op if this is the same as the current head.
    if (entries[index] === s) {
      live = s;
      return;
    }
    // If we're not at the head, drop the future (Ctrl+Y branch).
    if (index < entries.length - 1) {
      entries = entries.slice(0, index + 1);
    }
    entries.push(s);
    // Trim from the back when we blow past the cap.
    while (entries.length > MAX_DEPTH) {
      entries.shift();
    }
    index = entries.length - 1;
    live = s;
  }

  function undo() {
    // If live diverges from the head, snap back to head first.
    if (live !== entries[index]) {
      live = entries[index];
      return { body: live, didUndo: true };
    }
    if (index <= 0) return { body: live, didUndo: false };
    index--;
    live = entries[index];
    return { body: live, didUndo: true };
  }

  function redo() {
    if (index >= entries.length - 1) return { body: live, didRedo: false };
    index++;
    live = entries[index];
    return { body: live, didRedo: true };
  }

  function setLive(body) {
    live = typeof body === 'string' ? body : '';
  }

  function canUndo() {
    if (entries.length === 0) return false;
    return index > 0 || live !== entries[index];
  }
  function canRedo() {
    return index < entries.length - 1;
  }

  function serialise() {
    return {
      entries: entries.slice(),
      index,
      live,
    };
  }

  function depth() {
    return entries.length;
  }

  function head() {
    return entries[index];
  }

  return {
    push, undo, redo, setLive,
    canUndo, canRedo,
    serialise, depth, head,
  };
}

export { MAX_DEPTH };
