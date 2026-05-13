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
      if (payload?.id) await editExisting(payload);
      else await saveNewPending(payload);
    },
    onDelete: async (id) => {
      if (Number.isFinite(id)) await deleteOne(id);
    },
    onCancel: () => {
      pendingPlacement = null;
    },
  });

  let pendingPlacement = null;   // { page, x, y } from the noteTool click

  const tool = createNoteTool({
    onPlace: ({ page, x, y, clientX, clientY }) => {
      pendingPlacement = { page, x, y };
      popover.showAt({ clientX, clientY, page });
    },
  });

  function onPipClick(note, rect) {
    pendingPlacement = null;
    popover.showAt({
      clientX: rect.right + 8,
      clientY: rect.top,
      page: note.page,
      note,
    });
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
    destroy,
  };
}
