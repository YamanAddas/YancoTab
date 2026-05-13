/**
 * pdf/v3/chrome/sidebar.js — left sidebar shell + tab switcher.
 *
 * 240px-wide rail with 5 vertically stacked icon tabs along the inner
 * edge: Thumbnails / Outline / Bookmarks / Annotations / Search.
 * Phase C1 ships Thumbnails / Outline / Bookmarks; Annotations and
 * Search land in Phase C2.
 *
 * Each tab is a lazy mount: the builder hands the sidebar a tab spec
 * `{ id, label, icon, mount(host) → { update?, destroy? } }` and the
 * sidebar lazily calls mount on first activation.
 *
 * Target size: ≤ 280 lines.
 */

import { el } from '../../../../utils/dom.js';
import { ICONS } from './icons.js';

let _svgParserInstance = null;
function svgParser() {
  if (!_svgParserInstance) _svgParserInstance = new DOMParser();
  return _svgParserInstance;
}

export function buildSidebar({ tabs = [], initial = null } = {}) {
  const root = el('div', { class: 'pdf-sidebar' });
  const tabStrip = el('div', { class: 'pdf-sidebar-tabs', role: 'tablist' });
  const panel = el('div', { class: 'pdf-sidebar-panel' });
  root.append(tabStrip, panel);

  let activeId = null;
  const mounted = new Map();  // id → { host, api }
  const tabButtons = new Map();  // id → button

  for (const spec of tabs) {
    const btn = el('button', {
      type: 'button',
      class: 'pdf-sidebar-tab',
      role: 'tab',
      'aria-label': spec.label,
      title: spec.label,
    });
    const svgStr = ICONS[spec.icon];
    if (svgStr) btn.appendChild(svgParser().parseFromString(svgStr, 'image/svg+xml').documentElement);
    btn.addEventListener('click', () => activate(spec.id));
    tabButtons.set(spec.id, btn);
    tabStrip.appendChild(btn);
  }

  function activate(id) {
    const spec = tabs.find((t) => t.id === id);
    if (!spec) return;
    if (activeId === id) return;
    activeId = id;
    for (const [tid, btn] of tabButtons) {
      btn.classList.toggle('is-active', tid === id);
    }
    // Lazy-mount the tab's content on first activation.
    if (!mounted.has(id)) {
      const host = el('div', { class: 'pdf-sidebar-content', 'data-tab': id });
      const api = spec.mount?.(host) || {};
      mounted.set(id, { host, api });
      panel.appendChild(host);
    }
    // Show only the active tab's host.
    for (const [tid, m] of mounted) {
      m.host.style.display = tid === id ? '' : 'none';
    }
  }

  // Activate the initial tab (default: first).
  const initId = initial || tabs[0]?.id;
  if (initId) activate(initId);

  function updateTab(id, data) {
    const m = mounted.get(id);
    if (!m) return;
    m.api?.update?.(data);
  }

  /**
   * Invoke an arbitrary method on a mounted tab's api (e.g. refreshOps).
   * No-op if the tab is not yet mounted or the method doesn't exist.
   */
  function callTab(id, method, ...args) {
    const m = mounted.get(id);
    if (!m) return undefined;
    const fn = m.api?.[method];
    if (typeof fn !== 'function') return undefined;
    try { return fn.apply(m.api, args); } catch { /* best-effort */ return undefined; }
  }

  function updateAll(data) {
    for (const [id, m] of mounted) {
      m.api?.update?.(data?.[id] ?? data);
    }
  }

  function setCollapsed(collapsed) {
    root.classList.toggle('is-collapsed', !!collapsed);
  }

  function destroy() {
    for (const m of mounted.values()) {
      try { m.api?.destroy?.(); } catch { /* best-effort */ }
    }
    mounted.clear();
  }

  return {
    root,
    activate,
    updateTab,
    updateAll,
    callTab,
    setCollapsed,
    getActive() { return activeId; },
    destroy,
  };
}
