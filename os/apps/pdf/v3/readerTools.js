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
import { createInkTool } from './tools/inkTool.js';
import { createShapeTool } from './tools/shapeTool.js';
import { createToolDispatcher } from './tools/toolDispatcher.js';

export function setupTools({
  stage,
  strip,
  annStore,
  getDocId,
  toolbar,        // main toolbar; we call toolbar.setActiveTool() on tool change
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
      await annStore.addInk({ docId, page, points, color, width });
      await strip.refreshNonTextAnnotationsForPage(page);
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
      await annStore.addShape({ docId, ...ann });
      await strip.refreshNonTextAnnotationsForPage(ann.page);
    },
  });

  // ── Dispatcher ──
  const dispatcher = createToolDispatcher({
    stage,
    setStripToolsActive: (active) => strip.setAllToolsActive(active),
    onActiveChange: (toolId) => {
      toolbar?.setActiveTool?.(toolId);
      inkToolbar.hide();
      shapeToolbar.hide();
      if (toolId === 'ink') inkToolbar.show();
      else if (toolId === 'shape') shapeToolbar.show();
    },
  });
  dispatcher.register('text', {});
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

  function destroy() {
    dispatcher.destroy();
  }

  return {
    dispatcher,
    /** DOM nodes the orchestrator mounts in the reader layout. */
    subToolbarNodes: [inkToolbar.root, shapeToolbar.root],
    destroy,
  };
}
