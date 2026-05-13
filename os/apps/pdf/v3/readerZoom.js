/**
 * pdf/v3/readerZoom.js — zoom controller for the v3 reader.
 *
 * Owns the dropdown + the mode-aware setZoom logic. Tracks both:
 *   - userZoom    — the resolved numeric scale used by the renderer
 *   - userZoomMode — what the user asked for ('fit-width'|'fit-page'|number)
 *
 * Extracted from reader.js to keep the orchestrator under the cap.
 *
 * Target size: ≤ 110 lines.
 */

import { buildZoomDropdown, labelForMode } from './chrome/zoomDropdown.js';
import { zoomToFit, levelFromString, clampZoom } from '../engine/zoom.js';

export function createZoomController({
  toolbar,
  stage,
  strip,
  getPdfDoc,
  getCurrentPage,
  getTotalPages,
  saveZoom,
  initialZoom = 1.0,
} = {}) {
  let zoom = clampZoom(initialZoom);
  let mode = zoom;
  const dropdown = buildZoomDropdown({ onSelect: (v) => set(v) });
  dropdown.setActive(mode);
  document.body.appendChild(dropdown.root);

  async function resolve(input) {
    if (typeof input === 'number' && Number.isFinite(input)) return clampZoom(input);
    if (typeof input !== 'string') return zoom;
    const parsed = levelFromString(input);
    if (typeof parsed === 'number') return clampZoom(parsed);
    const pdfDoc = getPdfDoc?.();
    if (!pdfDoc) return zoom;
    const page = await pdfDoc.getPage(getCurrentPage?.() || 1);
    const baseVp = page.getViewport({ scale: 1 });
    const stageRect = stage.getBoundingClientRect();
    return zoomToFit({
      mode: parsed,
      pageBaseViewport: { width: baseVp.width, height: baseVp.height },
      stage: { width: stageRect.width, height: stageRect.height },
    });
  }

  async function set(input) {
    const next = await resolve(input);
    const nextMode = (input === 'fit-width' || input === 'fit-page') ? input : next;
    if (next === zoom && nextMode === mode) return;
    zoom = next;
    mode = nextMode;
    dropdown.setActive(mode);
    const pdfDoc = getPdfDoc?.();
    if (pdfDoc) {
      await strip.prepareSlots(pdfDoc, stage, { zoom });
      strip.scrollToPage(getCurrentPage?.() || 1, stage);
    }
    toolbar.update({
      page: getCurrentPage?.(), totalPages: getTotalPages?.(),
      zoom: typeof mode === 'string' ? labelForMode(mode) : zoom,
    });
    saveZoom?.(zoom);
  }

  function getZoom() { return zoom; }
  function getMode() { return mode; }
  function toggleNear(anchor) { dropdown.toggleNear(anchor); }
  function destroy() { dropdown.destroy(); }

  return { set, getZoom, getMode, toggleNear, destroy };
}
