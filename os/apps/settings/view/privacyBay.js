/**
 * settings/view/privacyBay.js — verifiable privacy stats.
 *
 * Renders the corrected stats from privacyStats engine (NOT the
 * mock's wrong "tracking pixels" or "E2E" claims).
 */

import { el } from '../../../utils/dom.js';
import { privacyStats, listEndpoints } from '../engine/privacyStats.js';
import { buildBay } from './bay.js';

export function buildPrivacyBay() {
  const bay = buildBay({ id: 'privacy', title: 'Privacy — what stays local', color: 'accent' });

  const refresh = () => {
    bay.body.innerHTML = '';
    for (const stat of privacyStats()) {
      const row = el('div', { class: 'mc-privacy-stat' }, [
        el('div', { class: `mc-privacy-v${stat.value === 'Chrome Sync' ? ' is-muted' : ''}` }, stat.value),
        el('div', { class: 'mc-privacy-k' }, [
          el('b', {}, stat.label),
          el('span', {}, stat.sub),
        ]),
      ]);
      bay.body.appendChild(row);
    }
    // Endpoint detail (collapsible).
    const details = el('details', { class: 'mc-privacy-endpoints' });
    const summary = el('summary', {}, 'Endpoint detail');
    details.appendChild(summary);
    const list = el('div', { class: 'mc-privacy-endpoint-list' });
    for (const ep of listEndpoints()) {
      list.appendChild(el('div', { class: 'mc-privacy-endpoint' }, [
        el('b', {}, ep.label),
        el('span', { class: 'mc-privacy-endpoint-host' }, ep.host),
        el('span', { class: 'mc-privacy-endpoint-purpose' }, ep.purpose),
      ]));
    }
    details.appendChild(list);
    bay.body.appendChild(details);
  };

  refresh();
  return { root: bay.root, update: refresh };
}
