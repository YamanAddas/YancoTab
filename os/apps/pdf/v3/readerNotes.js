/**
 * pdf/v3/readerNotes.js — sticky-note wiring for the v3 reader.
 *
 * Owns:
 *   - the notePopover instance (create + edit modes)
 *   - the noteTool (click-to-place)
 *   - the commit handlers that route through annotationStore + push
 *     undo entries
 *
 * Pip rendering is handled by pageStrip.refreshNotesForPage(); this
 * module just provides the callbacks pageStrip + the dispatcher call.
 *
 * Target size: ≤ 200 lines.
 */

import { buildNotePopover } from './chrome/notePopover.js';
import { createNoteTool } from './tools/noteTool.js';

export function createNotesSubsystem({
  annStore,
  strip,
  undoStack,
  onToast,
  getDocId,
  dispatcher,        // exits tool back to text after a save
}) {
  const popover = buildNotePopover({
    onSave: async (payload) => {
      if (highlightContext) {
        await saveHighlightBody(payload.body);
        return;
      }
      if (payload?.id) await editExisting(payload);
      else await saveNewPending(payload);
    },
    onDelete: async (id) => {
      if (highlightContext) {
        await saveHighlightBody('');   // clearing the body = "remove note"
        return;
      }
      if (Number.isFinite(id)) await deleteOne(id);
    },
    onCancel: () => {
      pendingPlacement = null;
      highlightContext = null;
    },
  });

  let pendingPlacement = null;   // { page, x, y } from the noteTool click
  let highlightContext = null;   // { annId, page, prevBody } — set when popover is opened for a highlight

  const tool = createNoteTool({
    onPlace: ({ page, x, y, clientX, clientY }) => {
      pendingPlacement = { page, x, y };
      popover.showAt({ clientX, clientY, page });
    },
  });

  function onPipClick(note, rect) {
    pendingPlacement = null;
    highlightContext = null;
    popover.showAt({
      clientX: rect.right + 8,
      clientY: rect.top,
      page: note.page,
      note,
    });
  }

  /**
   * Open the popover anchored next to an existing highlight, to add
   * or edit the comment body attached to it. `rect` is the highlight's
   * screen-coord bounding box; the popover renders to the right of it.
   *
   * The `body` arg is the current body (empty for "add note" flow).
   */
  async function openForHighlight({ annId, page, body = '', rect }) {
    if (!Number.isFinite(annId)) return;
    pendingPlacement = null;
    highlightContext = { annId, page, prevBody: body || '' };
    popover.showAt({
      clientX: rect ? rect.right + 8 : window.innerWidth / 2,
      clientY: rect ? rect.top : window.innerHeight / 2,
      page,
      // Reuse the popover's "edit" mode visuals (Delete button visible).
      note: { id: annId, page, body },
    });
  }

  async function saveHighlightBody(body) {
    const ctx = highlightContext;
    highlightContext = null;
    if (!ctx) return;
    const docId = getDocId();
    if (!docId) return;
    const trimmed = typeof body === 'string' ? body.trim() : '';
    if (trimmed === ctx.prevBody) return;
    try {
      await annStore.updateHighlightBody(ctx.annId, trimmed);
      await strip.refreshHighlightsForPage(ctx.page);
      onToast?.({
        message: trimmed ? (ctx.prevBody ? 'Note updated' : 'Note added') : 'Note removed',
        type: 'success',
      });
      if (undoStack) {
        const annId = ctx.annId;
        const page = ctx.page;
        const oldBody = ctx.prevBody;
        const newBody = trimmed;
        undoStack.push({
          label: oldBody ? (newBody ? 'edit highlight note' : 'remove highlight note') : 'add highlight note',
          undo: async () => {
            await annStore.updateHighlightBody(annId, oldBody);
            await strip.refreshHighlightsForPage(page);
          },
          redo: async () => {
            await annStore.updateHighlightBody(annId, newBody);
            await strip.refreshHighlightsForPage(page);
          },
        });
      }
    } catch (e) {
      onToast?.({ message: `Note save failed: ${e?.message || e}`, type: 'error' });
    }
  }

  async function saveNewPending({ body }) {
    const docId = getDocId();
    if (!docId || !pendingPlacement) return;
    const args = { docId, ...pendingPlacement, body, color: 'warm' };
    pendingPlacement = null;
    try {
      const rec = await annStore.addNote(args);
      if (!rec) {
        onToast?.({ message: 'Note save failed', type: 'error' });
        return;
      }
      await strip.refreshNotesForPage(args.page);
      onToast?.({ message: 'Note added', type: 'success' });
      // Drop back to text mode after a successful place.
      dispatcher?.setActive?.('text');
      if (undoStack) {
        let currentId = rec.id;
        undoStack.push({
          label: 'add note',
          undo: async () => {
            await annStore.deleteOne(currentId);
            await strip.refreshNotesForPage(args.page);
          },
          redo: async () => {
            const r = await annStore.addNote(args);
            if (r) currentId = r.id;
            await strip.refreshNotesForPage(args.page);
          },
        });
      }
    } catch (e) {
      onToast?.({ message: `Note failed: ${e?.message || e}`, type: 'error' });
    }
  }

  async function editExisting({ id, body }) {
    if (!Number.isFinite(id)) return;
    try {
      const prev = await annStore.getOne(id);
      if (!prev) return;
      const oldBody = prev.body || '';
      if (oldBody === body) return;
      await annStore.updateNoteBody(id, body);
      await strip.refreshNotesForPage(prev.page);
      if (undoStack) {
        undoStack.push({
          label: 'edit note',
          undo: async () => {
            await annStore.updateNoteBody(id, oldBody);
            await strip.refreshNotesForPage(prev.page);
          },
          redo: async () => {
            await annStore.updateNoteBody(id, body);
            await strip.refreshNotesForPage(prev.page);
          },
        });
      }
    } catch (e) {
      onToast?.({ message: `Note save failed: ${e?.message || e}`, type: 'error' });
    }
  }

  async function deleteOne(id) {
    try {
      const snapshot = await annStore.getOne(id);
      if (!snapshot) return;
      await annStore.deleteOne(id);
      await strip.refreshNotesForPage(snapshot.page);
      onToast?.({ message: 'Note deleted', type: 'success' });
      if (undoStack) {
        let currentId = id;
        undoStack.push({
          label: 'delete note',
          undo: async () => {
            const r = await annStore.addRaw(snapshot.docId, snapshot);
            if (r) currentId = r.id;
            await strip.refreshNotesForPage(snapshot.page);
          },
          redo: async () => {
            await annStore.deleteOne(currentId);
            await strip.refreshNotesForPage(snapshot.page);
          },
        });
      }
    } catch (e) {
      onToast?.({ message: `Delete failed: ${e?.message || e}`, type: 'error' });
    }
  }

  function destroy() {
    popover.destroy();
  }

  return {
    popoverRoot: popover.root,
    tool,
    onPipClick,
    openForHighlight,
    destroy,
  };
}
