/**
 * HomeSettings.js — Home & widgets tab for the Settings app
 *
 * Widget visibility, quick links, icon layout reset, dock reset,
 * folder re-seed, tips.
 *
 * The widget and quick-link sections exist because both of their storage
 * keys shipped with a reader and no writer: `yancotab_widgets` was
 * registered, defaulted and synced but unreachable from any UI, and
 * `yancotab_quick_links` could only ever hold the five seeded defaults.
 */

import { el } from '../../utils/dom.js';
import { showConfirm } from '../../ui/components/YancoModal.js';
import { WIDGETS, isWidgetEnabled } from '../../ui/components/widgets/widgetRegistry.js';
import { normalizeLinks, MAX_LINKS, LINKS_KEY } from '../../ui/quickLinks/quickLinksModel.js';
import { promptAddLink, confirmRemoveLink } from '../../ui/quickLinks/quickLinksActions.js';

const GRID_STORAGE_KEY = 'yancotab_mobile_grid_v8';
const DOCK_STORAGE_KEY = 'yancotab_dock_items';
const FOLDER_SEED_KEY = 'yancotab_mobile_seed_v06';
const HOME_LAYOUT_MODE_KEY = 'yancotab_home_layout_mode';
const HOME_LAYOUT_APPLIED_KEY = 'yancotab_home_layout_v100';
const WIDGETS_KEY = 'yancotab_widgets';

/**
 * @param {HTMLElement} container — scroll div
 * @param {object}      app      — SettingsApp instance
 */
export function renderHome(container, app) {
  const storage = app.kernel.storage;

  _widgets(container, app, storage);
  _quickLinks(container, app, storage);

  container.appendChild(app._group('Icon Layout', [
    app._actionRow('Reset Icon Positions', 'Restore default layout sorted by type and name', async () => {
      if (!await showConfirm('Reset Layout', 'Icons will be rearranged to their default positions.')) return;
      storage.remove(GRID_STORAGE_KEY);
      storage.remove(HOME_LAYOUT_APPLIED_KEY);
      localStorage.removeItem('yancotab_home_layout_v091_hotfix2');
      storage.save(HOME_LAYOUT_MODE_KEY, 'type-name');
      location.reload();
    }),
    app._actionRow('Reset Dock', 'Restore default dock items', async () => {
      if (!await showConfirm('Reset Dock', 'Restore default dock items?')) return;
      storage.remove(DOCK_STORAGE_KEY);
      location.reload();
    }),
  ]));

  container.appendChild(app._group('Folders', [
    app._actionRow('Reset Folders', 'Re-seed default folders (AI, TV, Social, Games)', async () => {
      if (!await showConfirm('Reset Folders', 'Re-seed default folders on next reload?')) return;
      localStorage.removeItem(FOLDER_SEED_KEY);
      location.reload();
    }),
  ]));

  container.appendChild(app._group('Tips', [
    app._infoRow('Shortcuts', 'Long-press desktop background to add web shortcuts'),
    app._infoRow('Quick Actions', 'Long-press any app for quick actions'),
  ]));
}

/* ── Widgets ── */

function _widgets(container, app, storage) {
  const stored = storage?.load(WIDGETS_KEY) || {};

  const rows = WIDGETS.map(({ key, name, desc }) =>
    app._toggleRow(name, desc, isWidgetEnabled(stored, key), (next) => {
      // Re-read before writing. The bay is rebuilt wholesale on every
      // refresh, so `stored` is a snapshot from render time; merging into
      // a stale copy would resurrect a toggle the user flipped a moment
      // ago in a different row.
      const cur = storage?.load(WIDGETS_KEY) || {};
      storage?.save(WIDGETS_KEY, { ...cur, [key]: !!next });
      // WidgetBar subscribes to the key and rebuilds itself — no event.
    }));

  container.appendChild(app._group('Today Widgets', rows));
}

/* ── Quick links ── */

function _quickLinks(container, app, storage) {
  const links = normalizeLinks(storage?.load(LINKS_KEY));

  const rows = links.map((link) => _linkRow(link, async () => {
    if (await confirmRemoveLink(app.kernel, link)) app._renderContent();
  }));

  if (links.length === 0) {
    rows.push(app._infoRow('No links yet', 'Links you add show up on the Web page'));
  }

  if (links.length < MAX_LINKS) {
    rows.push(app._actionRow('Add Link', `${links.length} of ${MAX_LINKS} used`, async () => {
      if (await promptAddLink(app.kernel)) app._renderContent();
    }));
  }

  container.appendChild(app._group('Quick Links', rows));
}

function _linkRow(link, onRemove) {
  const remove = el('button', {
    type: 'button',
    class: 'mc-set-remove',
    'aria-label': `Remove ${link.label}`,
  }, '✕');
  remove.addEventListener('click', onRemove);

  return el('div', { class: 'mc-set-row' }, [
    el('div', { class: 'mc-set-info' }, [
      el('div', { class: 'mc-set-label' }, link.label),
      el('div', { class: 'mc-set-desc' }, link.url),
    ]),
    remove,
  ]);
}
