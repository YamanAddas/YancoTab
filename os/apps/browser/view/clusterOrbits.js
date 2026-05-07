/**
 * browser/view/clusterOrbits.js — dashed bounding ellipses + cluster labels.
 *
 * Pure DOM builder. For each cluster with ≥2 members, draws a
 * dashed ellipse around their bounding box and a label tag.
 * Labels are positioned above the cluster's bounding box.
 */

import { el } from '../../../utils/dom.js';

function colorVar(color) {
  switch (color) {
    case 'cool':   return 'var(--cool, #5aa8ff)';
    case 'warm':   return 'var(--warm, #ffb84a)';
    case 'violet': return 'var(--violet, #9b7bff)';
    case 'rose':   return 'var(--rose, #ff6f8b)';
    case 'green':  return 'var(--green, #2dcf6a)';
    default:       return 'var(--accent, #00e5c1)';
  }
}

export function buildClusterOrbits() {
  const root = el('div', { class: 'wh-orbits' });
  return {
    root,
    update(state) {
      root.innerHTML = '';
      const clusters = Array.isArray(state?.clusters) ? state.clusters : [];
      const bookmarks = Array.isArray(state?.bookmarks) ? state.bookmarks : [];
      for (const cluster of clusters) {
        const members = bookmarks.filter((b) => b.clusterId === cluster.id);
        if (members.length < 2) continue;
        const bbox = boundingBox(members);
        // Padding around the bbox so portals don't kiss the edge.
        const pad = 6;
        const left = Math.max(0, bbox.minX - pad);
        const top = Math.max(0, bbox.minY - pad);
        const width = Math.min(100 - left, bbox.maxX - bbox.minX + 2 * pad);
        const height = Math.min(100 - top, bbox.maxY - bbox.minY + 2 * pad);
        const orbit = el('div', {
          class: 'wh-orbit',
          style: {
            left: `${left}%`,
            top: `${top}%`,
            width: `${width}%`,
            height: `${height}%`,
            'border-color': colorVar(cluster.color),
          },
        });
        // Label sits at the top-left, above the orbit.
        const label = el('div', {
          class: 'wh-cluster-label',
          style: {
            left: `${left + 2}%`,
            top: `${Math.max(0, top - 3)}%`,
            color: colorVar(cluster.color),
            'border-bottom-color': colorVar(cluster.color),
          },
        }, `⬡ ${cluster.name}`);
        root.append(orbit, label);
      }
    },
  };
}

function boundingBox(members) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of members) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x > maxX) maxX = b.x;
    if (b.y > maxY) maxY = b.y;
  }
  return { minX, minY, maxX, maxY };
}
