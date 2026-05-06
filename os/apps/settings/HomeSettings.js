/**
 * HomeSettings.js — Home Screen tab for the Settings app
 *
 * Icon layout reset, dock reset, folder re-seed, tips.
 */

const GRID_STORAGE_KEY = 'yancotab_mobile_grid_v8';
const DOCK_STORAGE_KEY = 'yancotab_dock_items';
const FOLDER_SEED_KEY = 'yancotab_mobile_seed_v06';
const HOME_LAYOUT_MODE_KEY = 'yancotab_home_layout_mode';
const HOME_LAYOUT_APPLIED_KEY = 'yancotab_home_layout_v100';

/**
 * @param {HTMLElement} container — scroll div
 * @param {object}      app      — SettingsApp instance
 */
export function renderHome(container, app) {
  const storage = app.kernel.storage;

  container.appendChild(app._group('Icon Layout', [
    app._actionRow('Reset Icon Positions', 'Restore default layout sorted by type and name', () => {
      if (!confirm('Reset home screen layout? Icons will be rearranged.')) return;
      storage.remove(GRID_STORAGE_KEY);
      storage.remove(HOME_LAYOUT_APPLIED_KEY);
      localStorage.removeItem('yancotab_home_layout_v091_hotfix2');
      storage.save(HOME_LAYOUT_MODE_KEY, 'type-name');
      location.reload();
    }),
    app._actionRow('Reset Dock', 'Restore default dock items', () => {
      if (!confirm('Reset dock to defaults?')) return;
      storage.remove(DOCK_STORAGE_KEY);
      location.reload();
    }),
  ]));

  container.appendChild(app._group('Folders', [
    app._actionRow('Reset Folders', 'Re-seed default folders (AI, TV, Social, Games)', () => {
      if (!confirm('This will re-seed default folders on next reload.')) return;
      localStorage.removeItem(FOLDER_SEED_KEY);
      location.reload();
    }),
  ]));

  container.appendChild(app._group('Tips', [
    app._infoRow('Shortcuts', 'Long-press desktop background to add web shortcuts'),
    app._infoRow('Quick Actions', 'Long-press any app for quick actions'),
  ]));
}
