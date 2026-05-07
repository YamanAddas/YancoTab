/**
 * winLine.js — Animated SVG win-line streak.
 *
 * Renders a comet-style line over the 3×3 board connecting the three
 * winning cells. The reveal is pure CSS keyframe (stroke-dashoffset
 * 0 → full in 320ms) — no rAF loop. A second translucent path lays
 * a soft glow trail behind the main stroke.
 *
 * The viewBox is 100×100; cell centers are at the integer grid:
 *   index → (col, row) where col = idx%3, row = (idx/3|0)
 *   center px = (col*33.33 + 16.67, row*33.33 + 16.67)
 */
import { el } from '../../utils/dom.js';

function centerOf(idx) {
  const col = idx % 3;
  const row = Math.floor(idx / 3);
  const x = col * 33.333 + 16.667;
  const y = row * 33.333 + 16.667;
  return { x, y };
}

/**
 * @param {[number, number, number]} pattern  3 cell indices that won
 * @returns {HTMLElement} SVG node positioned absolutely, sized 100% × 100%
 */
export function buildWinLine(pattern) {
  if (!Array.isArray(pattern) || pattern.length !== 3) {
    return el('div', { class: 'ttt-winline ttt-winline-empty' });
  }
  const a = centerOf(pattern[0]);
  const c = centerOf(pattern[2]);
  // Extend slightly past the end-cells so the streak overshoots
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const ext = 6;
  const x1 = a.x - (dx / L) * ext;
  const y1 = a.y - (dy / L) * ext;
  const x2 = c.x + (dx / L) * ext;
  const y2 = c.y + (dy / L) * ext;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ttt-winline');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');

  // Glow trail (drawn first, sits underneath)
  const glow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  glow.setAttribute('class', 'ttt-winline-glow');
  glow.setAttribute('x1', x1);
  glow.setAttribute('y1', y1);
  glow.setAttribute('x2', x2);
  glow.setAttribute('y2', y2);
  svg.appendChild(glow);

  // Main stroke
  const main = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  main.setAttribute('class', 'ttt-winline-main');
  main.setAttribute('x1', x1);
  main.setAttribute('y1', y1);
  main.setAttribute('x2', x2);
  main.setAttribute('y2', y2);
  svg.appendChild(main);

  return svg;
}
