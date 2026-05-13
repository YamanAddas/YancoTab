/**
 * pdf/v3/render/shapeRender.js — render shape annotations as SVG.
 *
 * Annotation shape:
 *   {
 *     kind: 'shape',
 *     shape: 'rect' | 'ellipse' | 'arrow' | 'line',
 *     x, y, w, h:  fractional [0..1] of page intrinsic viewport
 *                  (w/h can be negative for direction)
 *     color, width, fill, dash
 *   }
 *
 * Builds the right SVG element shape for each kind. Arrow = line +
 * small triangle head at end point.
 *
 * Pure-ish: returns a DOM element constructed via document.createElementNS.
 * Caller appends to the annotation layer.
 *
 * Target size: ≤ 200 lines.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const DASH_PATTERN = {
  solid: null,
  dashed: '6 4',
  dotted: '1 4',
};

/**
 * Build an SVG element for a shape annotation, sized to the
 * viewBox dimensions.
 *
 * @param {object} ann      shape annotation
 * @param {number} vbW      viewBox width  (page intrinsic px)
 * @param {number} vbH      viewBox height (page intrinsic px)
 * @returns {SVGElement|null}
 */
export function buildShapeElement(ann, vbW, vbH) {
  if (!ann || !Number.isFinite(vbW) || !Number.isFinite(vbH)) return null;
  if (vbW <= 0 || vbH <= 0) return null;
  const x = (ann.x || 0) * vbW;
  const y = (ann.y || 0) * vbH;
  const w = (ann.w || 0) * vbW;
  const h = (ann.h || 0) * vbH;
  if (Math.abs(w) < 0.5 && Math.abs(h) < 0.5) return null;

  const color = ann.color || 'red';
  const strokeWidth = String(ann.width || 2);
  const dash = DASH_PATTERN[ann.dash || 'solid'];
  const fillAttr = ann.fill && ann.fill !== 'none' ? ann.fill : 'none';

  let node;
  switch (ann.shape) {
    case 'ellipse': {
      node = document.createElementNS(SVG_NS, 'ellipse');
      node.setAttribute('cx', String(x + w / 2));
      node.setAttribute('cy', String(y + h / 2));
      node.setAttribute('rx', String(Math.abs(w / 2)));
      node.setAttribute('ry', String(Math.abs(h / 2)));
      break;
    }
    case 'line': {
      node = document.createElementNS(SVG_NS, 'line');
      node.setAttribute('x1', String(x));
      node.setAttribute('y1', String(y));
      node.setAttribute('x2', String(x + w));
      node.setAttribute('y2', String(y + h));
      node.setAttribute('stroke-linecap', 'round');
      break;
    }
    case 'arrow': {
      const g = document.createElementNS(SVG_NS, 'g');
      // Main line
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(x + w));
      line.setAttribute('y2', String(y + h));
      line.setAttribute('stroke-linecap', 'round');
      g.appendChild(line);
      // Arrowhead — triangle at the end point.
      const headLen = Math.max(8, (ann.width || 2) * 4);
      const angle = Math.atan2(h, w);
      const x2 = x + w;
      const y2 = y + h;
      const ax = x2 - headLen * Math.cos(angle - Math.PI / 6);
      const ay = y2 - headLen * Math.sin(angle - Math.PI / 6);
      const bx = x2 - headLen * Math.cos(angle + Math.PI / 6);
      const by = y2 - headLen * Math.sin(angle + Math.PI / 6);
      const head = document.createElementNS(SVG_NS, 'polygon');
      head.setAttribute('points', `${x2},${y2} ${ax},${ay} ${bx},${by}`);
      head.setAttribute('fill', colorToStroke(color));
      g.appendChild(head);
      node = g;
      break;
    }
    case 'rect':
    default: {
      node = document.createElementNS(SVG_NS, 'rect');
      node.setAttribute('x', String(Math.min(x, x + w)));
      node.setAttribute('y', String(Math.min(y, y + h)));
      node.setAttribute('width', String(Math.abs(w)));
      node.setAttribute('height', String(Math.abs(h)));
      break;
    }
  }

  // Apply style attributes (stroke via class for token-themed colors;
  // arrowhead fill set above via inline attribute).
  node.setAttribute('class', `pdf-ann-shape pdf-ann-color-${color}`);
  node.setAttribute('stroke-width', strokeWidth);
  if (ann.shape !== 'arrow') {
    node.setAttribute('fill', fillAttr);
  }
  if (dash) node.setAttribute('stroke-dasharray', dash);

  if (Number.isFinite(ann.id)) node.dataset.annId = String(ann.id);
  return node;
}

/**
 * Live-preview helper: build a shape element for the in-progress drag.
 */
export function buildShapePreview({ shape, startX, startY, curX, curY, color, width, dash, fill }, vbW, vbH) {
  if (!Number.isFinite(vbW) || !Number.isFinite(vbH)) return null;
  // Convert absolute coords back to fractional for the buildShapeElement API.
  const fx = startX / vbW;
  const fy = startY / vbH;
  const fw = (curX - startX) / vbW;
  const fh = (curY - startY) / vbH;
  const ann = { shape, x: fx, y: fy, w: fw, h: fh, color, width, dash, fill };
  return buildShapeElement(ann, vbW, vbH);
}

// Map color name to a literal stroke (used only for arrowhead fill —
// we can't rely on a CSS class inside an SVG <polygon fill="…">).
function colorToStroke(name) {
  switch (name) {
    case 'red': return '#ff453a';
    case 'orange': return '#ff9500';
    case 'yellow': return '#ffde59';
    case 'green': return '#34c759';
    case 'blue': return '#007aff';
    case 'purple': return '#af52de';
    case 'black': return '#111111';
    default: return name;  // assume hex or named CSS color
  }
}
