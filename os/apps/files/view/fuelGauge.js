/**
 * files/view/fuelGauge.js — storage breakdown bar for the side rail.
 *
 * Mirrors the design mock: stacked horizontal bar with 4 buckets
 * (docs / img / video / other), each colored, plus a legend below.
 */

import { el } from '../../../utils/dom.js';
import { formatBytes } from '../engine/state.js';

const BUCKET_DEFS = [
  { id: 'docs',  label: 'docs',  color: 'var(--accent, #00e5c1)' },
  { id: 'img',   label: 'img',   color: 'var(--violet, #9b7bff)' },
  { id: 'video', label: 'video', color: 'var(--warm, #ffb84a)' },
  { id: 'other', label: 'other', color: 'var(--cool, #5aa8ff)' },
];

const QUOTA_BYTES = 50 * 1024 * 1024 * 1024; // notional 50 GB local quota

export function buildFuelGauge() {
  const root = el('div', { class: 'fv-fuel' });
  const lbl = el('div', { class: 'fv-fuel-lbl' }, 'FUEL — LOCAL STORAGE');
  const val = el('div', { class: 'fv-fuel-val' });
  const bar = el('div', { class: 'fv-fuel-bar' });
  const legend = el('div', { class: 'fv-fuel-legend' });
  root.append(lbl, val, bar, legend);

  return {
    root,
    update(breakdown) {
      val.innerHTML = '';
      val.append(
        el('b', {}, formatBytes(breakdown?.totalBytes || 0)),
        document.createTextNode(' of '),
        document.createTextNode(formatBytes(QUOTA_BYTES)),
      );

      bar.innerHTML = '';
      let leftPct = 0;
      const minPct = 0.005; // 0.5% — show a sliver even for very small buckets
      for (const def of BUCKET_DEFS) {
        const b = breakdown?.buckets?.[def.id];
        const pct = (b && Number.isFinite(b.percent)) ? b.percent : 0;
        if (pct <= 0) continue;
        const renderPct = Math.max(pct, minPct);
        const seg = el('i', {
          class: `fv-fuel-seg fv-fuel-${def.id}`,
          style: {
            left: `${leftPct * 100}%`,
            width: `${renderPct * 100}%`,
            background: def.color,
          },
          title: `${def.label}: ${formatBytes(b.bytes)} (${(pct * 100).toFixed(1)}%)`,
        });
        bar.appendChild(seg);
        leftPct += pct;
      }

      legend.innerHTML = '';
      for (const def of BUCKET_DEFS) {
        legend.appendChild(el('span', { class: 'fv-fuel-leg' }, [
          el('i', { class: 'fv-fuel-leg-pip', style: { background: def.color } }),
          def.label,
        ]));
      }
    },
  };
}
