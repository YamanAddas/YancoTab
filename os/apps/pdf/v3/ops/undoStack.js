/**
 * pdf/v3/ops/undoStack.js — per-doc command stack for undo / redo.
 *
 * Each command is `{ label, undo, redo }` where `undo()` reverses the
 * mutation that was already applied at push() time, and `redo()` re-
 * applies it. Callers do the forward mutation themselves, then push a
 * command that knows how to reverse and re-apply it.
 *
 * Both methods may return a Promise — the stack awaits before flipping
 * the canUndo/canRedo state so callers can chain UI refreshes.
 *
 * Caps at 100 entries (oldest dropped). Redo stack clears on every
 * non-undo push. Stack is per-instance — reader.js creates one per
 * doc and clears it when the doc closes.
 *
 * Target size: ≤ 130 lines.
 */

const MAX_DEPTH = 100;

export function createUndoStack({ onChange } = {}) {
  const undoStack = [];
  const redoStack = [];
  let pending = false;   // true while undo()/redo() is awaiting

  function notify() {
    try { onChange?.({ canUndo: canUndo(), canRedo: canRedo() }); }
    catch { /* best-effort */ }
  }

  function push(command) {
    if (!command || typeof command.undo !== 'function' || typeof command.redo !== 'function') {
      return;   // silently drop malformed commands
    }
    undoStack.push({
      label: typeof command.label === 'string' ? command.label : 'edit',
      undo: command.undo,
      redo: command.redo,
    });
    // Cap at MAX_DEPTH — drop oldest.
    while (undoStack.length > MAX_DEPTH) undoStack.shift();
    // Any new push invalidates the redo branch.
    if (redoStack.length) redoStack.length = 0;
    notify();
  }

  async function undo() {
    if (pending) return false;
    const cmd = undoStack.pop();
    if (!cmd) return false;
    pending = true;
    try {
      await cmd.undo();
      redoStack.push(cmd);
      while (redoStack.length > MAX_DEPTH) redoStack.shift();
      return true;
    } catch (e) {
      // Failed to undo — push the command back so the user can try again
      // or so a later command's undo can still work.
      undoStack.push(cmd);
      console.warn('[pdf-v3] undo failed:', cmd.label, e);
      return false;
    } finally {
      pending = false;
      notify();
    }
  }

  async function redo() {
    if (pending) return false;
    const cmd = redoStack.pop();
    if (!cmd) return false;
    pending = true;
    try {
      await cmd.redo();
      undoStack.push(cmd);
      while (undoStack.length > MAX_DEPTH) undoStack.shift();
      return true;
    } catch (e) {
      redoStack.push(cmd);
      console.warn('[pdf-v3] redo failed:', cmd.label, e);
      return false;
    } finally {
      pending = false;
      notify();
    }
  }

  function clear() {
    undoStack.length = 0;
    redoStack.length = 0;
    notify();
  }

  function canUndo() { return undoStack.length > 0 && !pending; }
  function canRedo() { return redoStack.length > 0 && !pending; }
  function depth() { return { undo: undoStack.length, redo: redoStack.length }; }
  function topLabel() {
    return undoStack.length ? undoStack[undoStack.length - 1].label : null;
  }

  return { push, undo, redo, clear, canUndo, canRedo, depth, topLabel };
}
