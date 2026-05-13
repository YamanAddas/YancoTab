/**
 * notes/view/cosmosStage.js — absolute-positioned stars + SVG threads.
 *
 * Stage is a position:relative box. Stars use percent coords stored
 * in their meta. SVG overlay sits at z-index 0 with pointer-events:
 * none; stars (z-index 1+) sit above.
 *
 * The view is repaint-from-scratch because stars + edges change
 * together when filters update. Cheap — typical user has <50 notes.
 */

import { el } from '../../../utils/dom.js';
import { buildStar } from './star.js';
import { allEdges } from '../engine/wikilinks.js';
import { buildSearchBeam } from './searchBeam.js';

function clampVisibleNotes(notes) {
  return notes.filter((n) => n?.meta && Number.isFinite(n.meta.x) && Number.isFinite(n.meta.y));
}

export function buildCosmosStage({ onSelectStar, onContextStar, onSearch, onMoveStar }) {
  const root = el('div', { class: 'nc-stage' });

  // Toolbar pill (Cosmos / Cluster / Timeline) — only Cosmos wired in PR-2.
  const toolbar = el('div', { class: 'nc-stage-toolbar' });
  for (const id of ['Cosmos', 'Cluster', 'Timeline']) {
    const btn = el('button', {
      type: 'button',
      class: `nc-stage-toolbar-btn${id === 'Cosmos' ? ' is-active' : ''}`,
      'data-stage-mode': id.toLowerCase(),
      // Cluster + Timeline land in PR-3.
      disabled: id !== 'Cosmos' ? 'disabled' : undefined,
    }, id);
    toolbar.appendChild(btn);
  }

  // SVG thread overlay
  const threadSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  threadSvg.setAttribute('class', 'nc-threads');
  threadSvg.setAttribute('viewBox', '0 0 100 100');
  threadSvg.setAttribute('preserveAspectRatio', 'none');
  const threadGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  threadGroup.setAttribute('stroke', 'rgba(0,229,193,0.30)');
  threadGroup.setAttribute('stroke-width', '0.3');
  threadGroup.setAttribute('stroke-dasharray', '1.4 1.4');
  threadGroup.setAttribute('fill', 'none');
  threadSvg.appendChild(threadGroup);

  const starsLayer = el('div', { class: 'nc-stars' });

  const empty = el('div', { class: 'nc-stage-empty' }, [
    el('h3', { class: 'nc-stage-empty-title' }, 'Empty cosmos'),
    el('p', {}, 'Create a note to drop a star here.'),
  ]);
  empty.style.display = 'none';

  // Search beam at bottom
  const searchBeam = buildSearchBeam({ onSearch });

  root.append(toolbar, threadSvg, starsLayer, empty, searchBeam.root);

  return {
    root,
    setSearch: (q) => searchBeam.setValue(q),
    update(visibleNotes, allNotes, selectedPath) {
      starsLayer.innerHTML = '';
      threadGroup.innerHTML = '';
      const visible = clampVisibleNotes(visibleNotes);

      if (visible.length === 0) {
        empty.style.display = 'flex';
        return;
      }
      empty.style.display = 'none';

      // Build a path → meta lookup for thread endpoints. We render
      // edges only between currently-visible stars so threads don't
      // dangle into hidden notes.
      const visibleSet = new Set(visible.map((n) => n.path));
      const lookup = new Map(visible.map((n) => [n.path, n]));

      // Edges from the FULL note list (so threads from a hidden note
      // to a visible one still appear if both endpoints are visible).
      const edges = allEdges(allNotes);
      for (const { from, to } of edges) {
        if (!visibleSet.has(from) || !visibleSet.has(to)) continue;
        const a = lookup.get(from);
        const b = lookup.get(to);
        if (!a || !b) continue;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', a.meta.x);
        line.setAttribute('y1', a.meta.y);
        line.setAttribute('x2', b.meta.x);
        line.setAttribute('y2', b.meta.y);
        // Highlight threads touching the selected note.
        if (selectedPath && (from === selectedPath || to === selectedPath)) {
          line.setAttribute('stroke', 'rgba(0,229,193,0.80)');
          line.setAttribute('stroke-width', '0.4');
        }
        threadGroup.appendChild(line);
      }

      for (const n of visible) {
        starsLayer.appendChild(buildStar(n, {
          onSelect: onSelectStar,
          onContext: onContextStar,
          isSelected: n.path === selectedPath,
          onMove: onMoveStar,
          stageEl: starsLayer,
        }));
      }
    },
  };
}
