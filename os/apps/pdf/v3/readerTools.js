/**
 * pdf/v3/readerTools.js — tools subsystem wiring for the v3 reader.
 *
 * Construction extracted out of reader.js to keep the orchestrator
 * under the 500-line cap. Owns:
 *   - the active tool dispatcher
 *   - per-tool sub-toolbars (ink, shape, sign — added in their phase)
 *   - per-tool implementations (inkTool, shapeTool, signTool)
 *
 * Returns the dispatcher + the DOM nodes the orchestrator needs to
 * mount into the reader's layout, plus a destroy() for teardown.
 *
 * Target size: ≤ 250 lines.
 */

import { buildInkToolbar } from './chrome/inkToolbar.js';
import { buildShapeToolbar } from './chrome/shapeToolbar.js';
import { buildSignToolbar } from './chrome/signToolbar.js';
import { buildSignatureModal } from './chrome/signatureModal.js';
import { createInkTool } from './tools/inkTool.js';
import { createShapeTool } from './tools/shapeTool.js';
import { createSignTool } from './tools/signTool.js';
import { createHandTool } from './tools/handTool.js';
import { createToolDispatcher } from './tools/toolDispatcher.js';
import { createNotesSubsystem } from './readerNotes.js';
import { createRedactController } from './readerRedact.js';

const SIG_STORAGE_KEY = 'yancotab_pdf_signatures';

export function setupTools({
  stage,
  strip,
  annStore,
  pdfStore,       // for redact bake
  getDocId,
  getDocTitle,
  toolbar,        // main toolbar; we call toolbar.setActiveTool() on tool change
  kernel,         // for signature storage
  onToast,
  undoStack,      // optional: pushed onto when annotations commit
  onOpenDoc,
}) {
  // ── Ink ──
  const inkToolbar = buildInkToolbar({
    onChange: () => { /* ink tool reads on each stroke */ },
    onCancel: () => dispatcher.setActive('text'),
  });
  const inkTool = createInkTool({
    getStripRoot: () => strip.root,
    getPageLayer: (pageEl) => {
      const pn = Number(pageEl?.dataset?.page);
      if (!Number.isFinite(pn)) return null;
      return strip.getAnnotationLayerForPage(pn);
    },
    getActiveColor: () => inkToolbar.getColor(),
    getActiveWidth: () => inkToolbar.getWidth(),
    onCommit: async ({ page, points, color, width }) => {
      const docId = getDocId();
      if (!docId) return;
      const args = { docId, page, points, color, width };
      const rec = await annStore.addInk(args);
      await strip.refreshNonTextAnnotationsForPage(page);
      if (rec && undoStack) {
        let currentId = rec.id;
        undoStack.push({
          label: 'ink stroke',
          undo: async () => {
            await annStore.deleteOne(currentId);
            await strip.refreshNonTextAnnotationsForPage(page);
          },
          redo: async () => {
            const r = await annStore.addInk(args);
            if (r) currentId = r.id;
            await strip.refreshNonTextAnnotationsForPage(page);
          },
        });
      }
    },
  });

  // ── Shape ──
  const shapeToolbar = buildShapeToolbar({
    onCancel: () => dispatcher.setActive('text'),
  });
  const shapeTool = createShapeTool({
    getStripRoot: () => strip.root,
    getPageLayer: (pageEl) => {
      const pn = Number(pageEl?.dataset?.page);
      if (!Number.isFinite(pn)) return null;
      return strip.getAnnotationLayerForPage(pn);
    },
    getActiveShape: () => shapeToolbar.getShape(),
    getActiveColor: () => shapeToolbar.getColor(),
    getActiveWidth: () => shapeToolbar.getWidth(),
    getActiveFill:  () => shapeToolbar.getFill(),
    getActiveDash:  () => shapeToolbar.getDash(),
    onCommit: async (ann) => {
      const docId = getDocId();
      if (!docId) return;
      const args = { docId, ...ann };
      const rec = await annStore.addShape(args);
      await strip.refreshNonTextAnnotationsForPage(ann.page);
      if (rec && undoStack) {
        let currentId = rec.id;
        undoStack.push({
          label: 'shape',
          undo: async () => {
            await annStore.deleteOne(currentId);
            await strip.refreshNonTextAnnotationsForPage(ann.page);
          },
          redo: async () => {
            const r = await annStore.addShape(args);
            if (r) currentId = r.id;
            await strip.refreshNonTextAnnotationsForPage(ann.page);
          },
        });
      }
    },
  });

  // ── Signature ──
  // Storage helpers (signature library lives in kernel.storage so it's
  // user-level + sync-capable; instances dropped on pages live in IDB).
  function loadSigs() {
    try { return kernel?.storage?.load?.(SIG_STORAGE_KEY) || []; }
    catch { return []; }
  }
  function saveSigs(arr) {
    try { kernel?.storage?.save?.(SIG_STORAGE_KEY, arr); }
    catch (e) { onToast?.({ message: `Couldn't save signature: ${e.message || e}`, type: 'error' }); }
  }

  const signatureModal = buildSignatureModal({
    onSave: (entry) => {
      const current = loadSigs();
      if (current.length >= 3) {
        onToast?.({ message: 'Signature limit reached (max 3). Delete one first.', type: 'error' });
        return;
      }
      saveSigs([...current, entry]);
      signToolbar.refresh();
      signToolbar.setActiveId(entry.id);
      onToast?.({ message: 'Signature saved', type: 'success' });
    },
    onCancel: () => { /* nothing */ },
  });
  document.body.appendChild(signatureModal.root);

  const signToolbar = buildSignToolbar({
    getSavedSignatures: loadSigs,
    onAddNew: () => signatureModal.open(),
    onDelete: (id) => {
      const next = loadSigs().filter((s) => s.id !== id);
      saveSigs(next);
      signToolbar.refresh();
    },
    onCancel: () => dispatcher.setActive('text'),
  });

  const signTool = createSignTool({
    getPageLayer: (pageEl) => {
      const pn = Number(pageEl?.dataset?.page);
      if (!Number.isFinite(pn)) return null;
      return strip.getAnnotationLayerForPage(pn);
    },
    getActiveSignature: () => signToolbar.getActive(),
    onCommit: async ({ page, imageDataUrl, x, y, w, h }) => {
      const docId = getDocId();
      if (!docId) return;
      const args = { docId, page, imageDataUrl, x, y, w, h };
      const rec = await annStore.addSignature(args);
      await strip.refreshNonTextAnnotationsForPage(page);
      onToast?.({ message: 'Signature placed', type: 'success' });
      if (rec && undoStack) {
        let currentId = rec.id;
        undoStack.push({
          label: 'signature',
          undo: async () => {
            await annStore.deleteOne(currentId);
            await strip.refreshNonTextAnnotationsForPage(page);
          },
          redo: async () => {
            const r = await annStore.addSignature(args);
            if (r) currentId = r.id;
            await strip.refreshNonTextAnnotationsForPage(page);
          },
        });
      }
    },
    onNoSignaturePrompt: () => signatureModal.open(),
  });

  // ── Dispatcher ──
  const dispatcher = createToolDispatcher({
    stage,
    setStripToolsActive: (active) => strip.setAllToolsActive(active),
    onActiveChange: (toolId) => {
      toolbar?.setActiveTool?.(toolId);
      inkToolbar.hide();
      shapeToolbar.hide();
      signToolbar.hide();
      if (toolId === 'ink') inkToolbar.show();
      else if (toolId === 'shape') shapeToolbar.show();
      else if (toolId === 'sign') signToolbar.show();
    },
  });
  dispatcher.register('text', {});
  const handTool = createHandTool({ getStage: () => stage });
  dispatcher.register('hand', {
    setActive: (on) => handTool.setActive(on),
    onPointerDown:   (e) => handTool.onPointerDown(e),
    onPointerMove:   (e) => handTool.onPointerMove(e),
    onPointerUp:     (e) => handTool.onPointerUp(e),
    onPointerCancel: (e) => handTool.onPointerCancel(e),
  });
  dispatcher.register('ink', {
    setActive: (on) => inkTool.setActive(on),
    onPointerDown:   (e) => inkTool.onPointerDown(e),
    onPointerMove:   (e) => inkTool.onPointerMove(e),
    onPointerUp:     (e) => inkTool.onPointerUp(e),
    onPointerCancel: (e) => inkTool.onPointerCancel(e),
  });
  dispatcher.register('shape', {
    setActive: (on) => shapeTool.setActive(on),
    onPointerDown:   (e) => shapeTool.onPointerDown(e),
    onPointerMove:   (e) => shapeTool.onPointerMove(e),
    onPointerUp:     (e) => shapeTool.onPointerUp(e),
    onPointerCancel: (e) => shapeTool.onPointerCancel(e),
  });
  dispatcher.register('sign', {
    setActive: (on) => signTool.setActive(on),
    onPointerDown:   (e) => signTool.onPointerDown(e),
    onPointerMove:   (e) => signTool.onPointerMove(e),
    onPointerUp:     (e) => signTool.onPointerUp(e),
    onPointerCancel: (e) => signTool.onPointerCancel(e),
  });

  // ── Redact (rect-select + bake) ──
  const redact = createRedactController({
    pdfStore, annStore, strip, undoStack,
    getDocId, getDocTitle, onToast, onOpenDoc,
  });
  dispatcher.register('redact', {
    setActive: (on) => redact.tool.setActive(on),
    onPointerDown:   (e) => redact.tool.onPointerDown(e),
    onPointerMove:   (e) => redact.tool.onPointerMove(e),
    onPointerUp:     (e) => redact.tool.onPointerUp(e),
    onPointerCancel: (e) => redact.tool.onPointerCancel(e),
  });

  // ── Notes (sticky comments) ──
  const notes = createNotesSubsystem({
    annStore, strip, undoStack, onToast, getDocId, dispatcher,
  });
  dispatcher.register('note', {
    setActive: (on) => notes.tool.setActive(on),
    onPointerDown:   (e) => notes.tool.onPointerDown(e),
    onPointerMove:   (e) => notes.tool.onPointerMove(e),
    onPointerUp:     (e) => notes.tool.onPointerUp(e),
    onPointerCancel: (e) => notes.tool.onPointerCancel(e),
  });
  document.body.appendChild(notes.popoverRoot);

  function destroy() {
    dispatcher.destroy();
    signatureModal.destroy();
    notes.destroy();
  }

  return {
    dispatcher,
    /** DOM nodes the orchestrator mounts in the reader layout. */
    subToolbarNodes: [inkToolbar.root, shapeToolbar.root, signToolbar.root],
    /** Callback the page strip routes note-pip clicks into. */
    onNotePipClick: notes.onPipClick,
    /** Open the note popover anchored to an existing highlight to add /
     *  edit its attached comment body. */
    openNoteForHighlight: notes.openForHighlight,
    /** Open the "new sticky note" popover at the given page-fractional
     *  coords, without requiring the user to switch to the note tool. */
    placeNewNote: notes.placeNewNote,
    /** Persist a new fractional position for a sticky note. Fired by
     *  the page strip when the user drags a pip to a new spot. */
    moveNote: notes.moveNote,
    /** Bake-redactions action surfaced to the More menu. */
    bakeRedactions: () => redact.bake(),
    destroy,
  };
}
