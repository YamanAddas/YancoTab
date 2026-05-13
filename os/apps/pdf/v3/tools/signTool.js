/**
 * pdf/v3/tools/signTool.js — drop a saved signature onto a page.
 *
 * Phase D4 MVP: click-to-drop only. The active signature comes from
 * the sign sub-toolbar (which one of the saved sigs is "armed"). On
 * pointerdown on a page, we drop the signature there at a default
 * size, persist, and refresh.
 *
 * Move + resize via drag handles is a follow-up.
 *
 * Target size: ≤ 200 lines.
 */

const DEFAULT_FRACTIONAL_WIDTH = 0.22;   // ~22% of page width by default

export function createSignTool({
  getPageLayer,
  getActiveSignature,    // () → { id, name, imageDataUrl } | null
  onCommit,              // ({ page, imageDataUrl, x, y, w, h }) → Promise
  onNoSignaturePrompt,   // () → user clicked drop with no sig selected → open the modal
} = {}) {
  let active = false;

  function setActive(on) {
    active = !!on;
  }

  function isActive() { return active; }

  async function onPointerDown(e) {
    if (!active || e.button !== 0) return;
    const pageEl = pageElFromEvent(e);
    if (!pageEl) return;
    const layerApi = getPageLayer?.(pageEl);
    if (!layerApi) return;
    const sig = getActiveSignature?.();
    if (!sig) {
      onNoSignaturePrompt?.();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const vb = layerApi.getViewBox();
    const r = pageEl.getBoundingClientRect();
    const fxCenter = (e.clientX - r.left) / r.width;
    const fyCenter = (e.clientY - r.top) / r.height;

    // Compute fractional w/h preserving the signature's aspect ratio,
    // anchored on the click point (centered).
    const aspectRatio = await measureSignatureAspect(sig.imageDataUrl);
    const w = DEFAULT_FRACTIONAL_WIDTH;
    const sigPageW = w * vb.w;
    const sigPageH = sigPageW / aspectRatio;
    const h = sigPageH / vb.h;
    const x = clamp01(fxCenter - w / 2);
    const y = clamp01(fyCenter - h / 2);

    const pageNum = Number(pageEl.dataset?.page);
    if (!Number.isFinite(pageNum)) return;

    try {
      await onCommit?.({
        page: pageNum,
        imageDataUrl: sig.imageDataUrl,
        x, y, w, h,
      });
    } catch (err) {
      console.warn('[pdf-v3 sign] commit failed:', err);
    }
  }

  function onPointerMove() { /* no-op in MVP */ }
  function onPointerUp() { /* no-op in MVP */ }
  function onPointerCancel() { /* no-op in MVP */ }

  function pageElFromEvent(e) {
    let n = e.target;
    while (n && n !== document) {
      if (n.nodeType === 1 && n.classList?.contains('pdf-page')) return n;
      n = n.parentNode;
    }
    return null;
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  return {
    setActive, isActive,
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
  };
}

/**
 * Compute width / height for a PNG data URL. Caches by URL since
 * each signature is reused many times.
 */
const aspectCache = new Map();
function measureSignatureAspect(dataUrl) {
  if (!dataUrl) return Promise.resolve(2.5);
  if (aspectCache.has(dataUrl)) return Promise.resolve(aspectCache.get(dataUrl));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const r = img.naturalWidth > 0 && img.naturalHeight > 0
        ? img.naturalWidth / img.naturalHeight
        : 2.5;
      aspectCache.set(dataUrl, r);
      resolve(r);
    };
    img.onerror = () => {
      aspectCache.set(dataUrl, 2.5);
      resolve(2.5);
    };
    img.src = dataUrl;
  });
}
