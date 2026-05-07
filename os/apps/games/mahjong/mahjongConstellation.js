/**
 * mahjongConstellation.js — SVG overlay that draws faded teal curves
 * connecting the centroids of recently matched pairs. Pure cosmetic;
 * no game-logic interactions. Curves auto-fade after ~4 seconds.
 *
 * The overlay sits as a sibling of the tile inner-container and is
 * sized to match it. We listen for resize via the host's existing
 * fitBoard pipeline — caller invokes `resize()` after each fitBoard.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const FADE_MS = 4000;
const MAX_TRAILS = 6;

export class MahjongConstellation {
  constructor() {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'mj-constellation');
    this.svg.setAttribute('preserveAspectRatio', 'none');

    // Lazy-defined gradient — appended once on first draw.
    this._defs = document.createElementNS(SVG_NS, 'defs');
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', 'mj-constellation-grad');
    grad.setAttribute('x1', '0'); grad.setAttribute('x2', '1');
    const s0 = document.createElementNS(SVG_NS, 'stop');
    s0.setAttribute('offset', '0'); s0.setAttribute('stop-color', '#00e5c1'); s0.setAttribute('stop-opacity', '0.7');
    const s1 = document.createElementNS(SVG_NS, 'stop');
    s1.setAttribute('offset', '1'); s1.setAttribute('stop-color', '#00e5c1'); s1.setAttribute('stop-opacity', '0');
    grad.append(s0, s1);
    this._defs.appendChild(grad);
    this.svg.appendChild(this._defs);

    this._w = 0;
    this._h = 0;
    this._timers = new Set();
  }

  /** Mounts the SVG into the given parent. Caller is responsible for layout. */
  mount(parentEl) {
    parentEl.appendChild(this.svg);
    return this;
  }

  /** Re-measure the SVG to match the inner board container. */
  resize(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    this._w = width;
    this._h = height;
    this.svg.setAttribute('viewBox', `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`);
    this.svg.style.width = `${width}px`;
    this.svg.style.height = `${height}px`;
  }

  /**
   * Draw a curve between two tile DOM elements. The element bounding
   * boxes are projected into the local SVG viewBox using the SVG's
   * own bounding box as origin.
   */
  drawBetween(elA, elB) {
    if (!elA || !elB || !this.svg.isConnected) return;
    const svgRect = this.svg.getBoundingClientRect();
    const a = centerOf(elA, svgRect);
    const b = centerOf(elB, svgRect);
    if (!a || !b) return;

    // Quadratic curve with mid-point lifted vertically for a gentle arc
    const midX = (a.x + b.x) / 2;
    const midY = Math.min(a.y, b.y) - Math.abs(b.x - a.x) * 0.2 - 24;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'mj-constellation-line');
    path.setAttribute('d', `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`);
    path.setAttribute('stroke', 'url(#mj-constellation-grad)');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');

    const dotA = makeDot(a.x, a.y);
    const dotB = makeDot(b.x, b.y);

    this.svg.append(path, dotA, dotB);

    // Cap the trail length — drop the oldest if we exceed MAX_TRAILS×3 nodes
    const trails = this.svg.querySelectorAll('.mj-constellation-line');
    if (trails.length > MAX_TRAILS) {
      trails[0].remove();
    }

    const cleanup = setTimeout(() => {
      try { path.remove(); dotA.remove(); dotB.remove(); } catch {}
      this._timers.delete(cleanup);
    }, FADE_MS);
    this._timers.add(cleanup);
  }

  /** Drop everything (used on shuffle / new game / destroy). */
  clear() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this.svg.appendChild(this._defs);
  }

  destroy() {
    this.clear();
    if (this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
  }
}

function centerOf(elem, originRect) {
  const r = elem.getBoundingClientRect?.();
  if (!r || !r.width) return null;
  return {
    x: r.left - originRect.left + r.width / 2,
    y: r.top - originRect.top + r.height / 2,
  };
}

function makeDot(x, y) {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('class', 'mj-constellation-dot');
  c.setAttribute('cx', x);
  c.setAttribute('cy', y);
  c.setAttribute('r', '3');
  c.setAttribute('fill', '#00e5c1');
  return c;
}
