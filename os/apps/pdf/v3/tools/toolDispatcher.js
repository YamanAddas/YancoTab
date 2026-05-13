/**
 * pdf/v3/tools/toolDispatcher.js — central tool-state controller.
 *
 * Owns the "which tool is active" state, the active tool's pointer-
 * event routing, and side-effects of activation (sub-toolbar visibility,
 * annotation-layer pointer-events flag, body classes).
 *
 * Wires:
 *   - Tool buttons in the main toolbar (text / hand / highlight / ink /
 *     shape / note / sign) call dispatcher.setActive(toolId).
 *   - Pointer events on the stage are forwarded here; the dispatcher
 *     decides which tool gets them (or none, for text mode).
 *
 * Tools register their pointer handlers via register(toolId, handlers).
 *
 * Target size: ≤ 250 lines.
 */

const KNOWN_TOOLS = new Set(['text', 'hand', 'ink', 'shape', 'note', 'sign', 'redact']);
const DRAWING_TOOLS = new Set(['ink', 'shape', 'note', 'sign', 'redact']);

export function createToolDispatcher({
  stage,
  setStripToolsActive,    // (active: boolean) → toggle all annotation layers' pointer-events
  onActiveChange,         // (toolId) → optional UI side-effects (toolbar button highlight, etc.)
} = {}) {
  let active = 'text';
  const handlers = new Map();   // toolId → { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }

  function register(toolId, h) {
    if (!KNOWN_TOOLS.has(toolId)) return;
    handlers.set(toolId, h || {});
  }

  function setActive(toolId) {
    if (!KNOWN_TOOLS.has(toolId)) return;
    if (toolId === active) return;
    // Cancel any in-progress stroke from the OLD tool.
    const old = handlers.get(active);
    try { old?.setActive?.(false); } catch { /* best-effort */ }
    active = toolId;
    // Activate the NEW tool.
    const next = handlers.get(active);
    try { next?.setActive?.(true); } catch { /* best-effort */ }
    // Toggle pointer-events on every page's annotation layer.
    setStripToolsActive?.(DRAWING_TOOLS.has(active));
    // Body/root class for global CSS hooks (e.g. cursor changes).
    stage?.classList?.remove(...[...KNOWN_TOOLS].map((t) => `tool-${t}`));
    stage?.classList?.add(`tool-${active}`);
    onActiveChange?.(active);
  }

  function getActive() { return active; }

  // ── Pointer routing ──
  // Capture-phase listeners on the stage; we get events BEFORE the
  // textLayer or annotation layer. Forward to the active tool only
  // when it's a drawing tool — text mode lets native selection run.

  function onPointerDown(e) {
    if (active === 'text') return;
    const h = handlers.get(active);
    if (h?.onPointerDown) h.onPointerDown(e);
  }
  function onPointerMove(e) {
    if (active === 'text') return;
    const h = handlers.get(active);
    if (h?.onPointerMove) h.onPointerMove(e);
  }
  function onPointerUp(e) {
    if (active === 'text') return;
    const h = handlers.get(active);
    if (h?.onPointerUp) h.onPointerUp(e);
  }
  function onPointerCancel(e) {
    if (active === 'text') return;
    const h = handlers.get(active);
    if (h?.onPointerCancel) h.onPointerCancel(e);
  }

  if (stage) {
    stage.addEventListener('pointerdown', onPointerDown, true);
    stage.addEventListener('pointermove', onPointerMove, true);
    stage.addEventListener('pointerup', onPointerUp, true);
    stage.addEventListener('pointercancel', onPointerCancel, true);
  }

  function destroy() {
    if (stage) {
      stage.removeEventListener('pointerdown', onPointerDown, true);
      stage.removeEventListener('pointermove', onPointerMove, true);
      stage.removeEventListener('pointerup', onPointerUp, true);
      stage.removeEventListener('pointercancel', onPointerCancel, true);
    }
    for (const h of handlers.values()) {
      try { h?.setActive?.(false); } catch { /* best-effort */ }
    }
    handlers.clear();
  }

  return {
    register,
    setActive,
    getActive,
    destroy,
    isDrawingTool: () => DRAWING_TOOLS.has(active),
  };
}
