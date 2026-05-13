/**
 * pdf/v3/render/annotationLayer.js — SVG overlay that renders non-text
 * annotations (ink, shapes, signatures) on a single page.
 *
 * Mounted alongside the canvas + textLayer inside each .pdf-page. The
 * SVG's viewBox is the page's intrinsic dimensions (page-px at zoom
 * 1.0), so we can store annotation coordinates as fractional [0..1]
 * and render them by multiplying through the viewBox.
 *
 * `pointer-events` toggles based on whether a drawing tool is active:
 *   - text/hand tool → pointer-events: none (selection works on the textLayer)
 *   - ink/shape tool → pointer-events: all (capture pointer events)
 *
 * The reader's tool dispatcher calls setToolActive() to toggle.
 *
 * Target size: ≤ 250 lines.
 */

import { buildPathFromFractional } from './inkRender.js';
import { buildShapeElement } from './shapeRender.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildAnnotationLayer({ viewBoxWidth, viewBoxHeight }) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pdf-annlayer');
  svg.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';     // default: don't block textLayer
  svg.style.zIndex = '3';                // above text-layer's `<mark>`s

  // Live-preview group — used by tools to show in-progress strokes.
  const previewG = document.createElementNS(SVG_NS, 'g');
  previewG.setAttribute('class', 'pdf-annlayer-preview');
  // Persisted-annotations group — re-built on every refresh.
  const annsG = document.createElementNS(SVG_NS, 'g');
  annsG.setAttribute('class', 'pdf-annlayer-anns');
  svg.append(annsG, previewG);

  function setToolActive(active) {
    svg.style.pointerEvents = active ? 'all' : 'none';
    svg.classList.toggle('is-tool-active', !!active);
  }

  function renderAnnotations(annotations) {
    annsG.innerHTML = '';
    if (!Array.isArray(annotations)) return;
    for (const ann of annotations) {
      if (!ann) continue;
      switch (ann.kind) {
        case 'ink':
          renderInk(ann);
          break;
        case 'shape':
          renderShape(ann);
          break;
        case 'signature':
          renderSignature(ann);
          break;
        // Phase D2 only has ink; shapes + signature are stubs that
        // become real in D3/D4.
        default:
          break;
      }
    }
  }

  function renderInk(ann) {
    const path = document.createElementNS(SVG_NS, 'path');
    const d = buildPathFromFractional(ann.points || [], viewBoxWidth, viewBoxHeight);
    if (!d) return;
    path.setAttribute('d', d);
    path.setAttribute('class', `pdf-ann-ink pdf-ann-color-${ann.color || 'red'}`);
    path.setAttribute('stroke-width', String(ann.width || 2));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    if (Number.isFinite(ann.id)) path.dataset.annId = String(ann.id);
    annsG.appendChild(path);
  }

  function renderShape(ann) {
    const node = buildShapeElement(ann, viewBoxWidth, viewBoxHeight);
    if (node) annsG.appendChild(node);
  }

  function renderSignature(ann) {
    // Phase D4 stub.
    if (!ann.imageDataUrl) return;
    const x = (ann.x || 0) * viewBoxWidth;
    const y = (ann.y || 0) * viewBoxHeight;
    const w = (ann.w || 0.2) * viewBoxWidth;
    const h = (ann.h || 0.1) * viewBoxHeight;
    const img = document.createElementNS(SVG_NS, 'image');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', ann.imageDataUrl);
    img.setAttribute('x', String(x));
    img.setAttribute('y', String(y));
    img.setAttribute('width', String(w));
    img.setAttribute('height', String(h));
    img.setAttribute('class', 'pdf-ann-signature');
    if (Number.isFinite(ann.id)) img.dataset.annId = String(ann.id);
    annsG.appendChild(img);
  }

  /** Set live-preview content (a single SVG element string or DOM node). */
  function setPreview(node) {
    previewG.innerHTML = '';
    if (node) previewG.appendChild(node);
  }
  function clearPreview() { previewG.innerHTML = ''; }

  return {
    root: svg,
    setToolActive,
    renderAnnotations,
    setPreview,
    clearPreview,
    getViewBox: () => ({ w: viewBoxWidth, h: viewBoxHeight }),
    getPreviewGroup: () => previewG,
  };
}

// Helper exposed for tool modules that need to create SVG elements
// in the same namespace.
export function svgNS() { return SVG_NS; }
