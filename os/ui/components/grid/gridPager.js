/**
 * grid/gridPager.js — the page dots under the app grid.
 *
 * Extracted from AppGrid.js, which sits over the 500-line cap; the
 * contract says a non-trivial edit to such a file should take a chunk out
 * rather than add to it, and adding keyboard navigation was that edit.
 *
 * Self-contained by nature: the dots own their own DOM, read the page
 * count they are handed, and talk back through `interaction.animateToPage`.
 * Nothing else in the grid touches them.
 */

import { el } from '../../../utils/dom.js';

const ACTIVE_W = '18px';
const IDLE_W = '6px';

/** Read the accent trio once per repaint rather than once per dot. */
function palette() {
  const cs = getComputedStyle(document.documentElement);
  return {
    accent: cs.getPropertyValue('--accent').trim() || '#00e5c1',
    accentRgb: cs.getPropertyValue('--accent-rgb').trim() || '0, 229, 193',
    uiTextRgb: cs.getPropertyValue('--ui-text-rgb').trim() || '200, 220, 240',
  };
}

function paintDot(dot, isActive, p) {
  dot.style.width = isActive ? ACTIVE_W : IDLE_W;
  dot.style.borderRadius = isActive ? '3px' : '50%';
  dot.style.backgroundColor = isActive ? p.accent : `rgba(${p.uiTextRgb}, 0.2)`;
  dot.style.boxShadow = isActive ? `0 0 8px rgba(${p.accentRgb}, 0.4)` : 'none';
}

export class GridPager {
  /**
   * @param {HTMLElement} container  the dots element (mounted by the shell)
   * @param {object} grid            AppGrid — for `interaction` and `state`
   */
  constructor(container, grid) {
    this.container = container;
    this.grid = grid;
  }

  render(count, activeIndex) {
    this.container.innerHTML = '';
    Object.assign(this.container.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      padding: '8px 0 4px',
      touchAction: 'none', cursor: 'pointer',
    });

    const p = palette();
    for (let i = 0; i < count; i++) {
      const dot = el('div', {
        class: 'dot',
        style: { height: '6px', transition: 'all 0.3s', pointerEvents: 'none' },
      });
      paintDot(dot, i === activeIndex, p);
      this.container.appendChild(dot);
    }
  }

  setActive(index) {
    if (index >= this.container.children.length) {
      this.render(index + 1, index);
      return;
    }
    const p = palette();
    this.container.querySelectorAll('.dot').forEach((d, i) => paintDot(d, i === index, p));
  }

  /**
   * Pointer handling: swipe past 30px pages, a near-stationary release
   * treats the strip as a scrubber and jumps to the dot under the finger.
   */
  bindSwipe() {
    let startX = 0;
    let pointerId = null;
    const press = (on) => {
      this.container.style.transform = `translateX(-50%) scale(${on ? 0.9 : 1})`;
      this.container.style.background = `rgba(0,0,0,${on ? 0.3 : 0.2})`;
    };

    this.container.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      startX = e.clientX;
      pointerId = e.pointerId;
      try { this.container.setPointerCapture(e.pointerId); } catch { /* best-effort */ }
      press(true);
    }, { passive: false });

    this.container.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (pointerId !== null && e.pointerId !== pointerId) return;
      try { this.container.releasePointerCapture(e.pointerId); } catch { /* best-effort */ }
      press(false);
      pointerId = null;

      const dx = e.clientX - startX;
      const page = this.grid.interaction.currentPage;
      const maxPage = (this.grid.state.pageCount || 1) - 1;

      if (Math.abs(dx) > 30) {
        if (dx > 0 && page > 0) this.grid.interaction.animateToPage(page - 1);
        else if (dx < 0 && page < maxPage) this.grid.interaction.animateToPage(page + 1);
      } else if (Math.abs(dx) < 10) {
        const rect = this.container.getBoundingClientRect();
        if (this.container.querySelectorAll('.dot').length > 1 && rect.width > 0) {
          const fraction = (e.clientX - rect.left) / rect.width;
          const target = Math.max(0, Math.min(maxPage, Math.round(fraction * maxPage)));
          if (target !== page) this.grid.interaction.animateToPage(target);
        }
      }
    });

    this.container.addEventListener('pointercancel', () => {
      press(false);
      pointerId = null;
    });
  }
}
