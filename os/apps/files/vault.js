/**
 * files/vault.js — Vault orchestrator.
 *
 * Composes side rail + breadcrumb + stage + preview panel. Owns the
 * current room state (a smart-room id, OR a folder path) + selected
 * file. The shell (FilesApp) owns fs IO and the kernel hooks.
 */

import { el } from '../../utils/dom.js';
import { buildSideRail } from './view/sideRail.js';
import { buildBreadcrumb } from './view/breadcrumb.js';
import { buildStage } from './view/stage.js';
import { buildPreviewPanel } from './view/previewPanel.js';

import { decorateItems, basename } from './engine/state.js';
import { applySmart, smartCounts } from './engine/smartRooms.js';
import { breakdown } from './engine/storageBreakdown.js';
import { iconOf } from './engine/fileType.js';

const SMART_TONE = {
  recent: 'smart',
  pinned: 'smart',
  heavy: 'warm',
  forgotten: '',
};

const SMART_LABEL = {
  recent: 'Recent',
  pinned: 'Pinned',
  heavy: 'Heavy',
  forgotten: 'Forgotten',
};

const FOLDER_TONES = ['violet', 'cool', 'warm', 'rose', 'smart'];

export function buildVault({
  // fs accessors — provided by the shell so engine code stays pure
  listDir,         // (path) → raw fs items
  listAllFiles,    // () → flat array of every file under /home (for smart rooms + breakdown)
  getPinnedSet,    // () → Set<string>
  getViewMode,     // () → 'honeycomb' | 'grid' | 'list'
  setViewMode,     // (mode) → void
  // actions
  onOpenItem,      // (item) — folder navigates, file opens
  onTogglePin,
  onRename,
  onDelete,
  onSendNotes,
  onSendBrowser,
  onSendPhotos,
  onSendWallpaper,
  onCopyPath,
  onMoveFile,      // (sourcePath, targetFolderPath) → void
} = {}) {
  const root = el('div', { class: 'vault' });

  // ── State ──
  let activeRoom = { kind: 'folder', path: '/home' };
  let selectedPath = null;
  let zoom = 1;

  // ── Subviews ──
  const side = buildSideRail({
    onPickSmart: (id) => { activeRoom = { kind: 'smart', id }; selectedPath = null; render(); },
    onPickFolder: (path) => { activeRoom = { kind: 'folder', path }; selectedPath = null; render(); },
  });

  const crumb = buildBreadcrumb({
    onPickView: (m) => { setViewMode?.(m); render(); },
    onZoomIn: () => { zoom = Math.min(2, zoom + 0.15); applyZoom(); },
    onZoomOut: () => { zoom = Math.max(0.6, zoom - 0.15); applyZoom(); },
    onZoomReset: () => { zoom = 1; applyZoom(); },
  });

  const stage = buildStage({
    onSelectCell: (spec) => {
      if (spec.kind === 'smart') {
        activeRoom = { kind: 'smart', id: spec.id };
        selectedPath = null;
      } else if (spec.kind === 'folder') {
        activeRoom = { kind: 'folder', path: spec.path };
        selectedPath = null;
      }
      render();
    },
    onSelectCoin: (item) => { selectedPath = item.path; render(); },
    onMoveFile: (sourcePath, target) => {
      if (target?.kind === 'folder' && target.path) {
        onMoveFile?.(sourcePath, target.path);
      }
    },
  });

  const preview = buildPreviewPanel({
    onPin: (item) => { onTogglePin?.(item); },
    onSendNotes: (item) => onSendNotes?.(item),
    onSendBrowser: (item) => onSendBrowser?.(item),
    onSendPhotos: (item) => onSendPhotos?.(item),
    onSendWallpaper: (item) => onSendWallpaper?.(item),
    onCopyPath: (item) => onCopyPath?.(item),
    onDelete: (item) => onDelete?.(item),
    onRename: (item) => onRename?.(item),
  });

  const stageWrap = el('div', { class: 'fv-stage-wrap' }, [crumb.root, stage.root]);
  root.append(side.root, stageWrap, preview.root);

  function applyZoom() {
    stage.root.style.setProperty('--fv-zoom', String(zoom));
  }
  applyZoom();

  // ── Render ──
  function render() {
    const pinnedSet = getPinnedSet?.() || new Set();
    const viewMode = getViewMode?.() || 'honeycomb';

    // Decorate ALL files for smart rooms + breakdown.
    const allRaw = listAllFiles?.() || [];
    const allItems = decorateItems(allRaw, { pinned: pinnedSet });

    // Side rail counts + folders.
    const counts = smartCounts(allItems);
    const homeRaw = listDir?.('/home') || [];
    const homeFolders = decorateItems(homeRaw.filter((it) => it.type === 'directory'),
      { pinned: pinnedSet });
    const folders = homeFolders.map((f, i) => ({
      path: f.path,
      name: f.name,
      tone: FOLDER_TONES[i % FOLDER_TONES.length],
      count: countDirChildren(f.path),
    }));

    side.update({
      counts,
      folders,
      breakdown: breakdown(allItems),
      activeSmart: activeRoom.kind === 'smart' ? activeRoom.id : null,
      activeFolderPath: activeRoom.kind === 'folder' ? activeRoom.path : null,
    });

    // Resolve the active room's items.
    const { cells, files, segment } = resolveRoom(activeRoom, allItems, pinnedSet);

    crumb.update({
      rootLabel: 'Vault',
      segment,
      view: viewMode,
    });

    stage.update({
      view: viewMode,
      cells,
      files,
      selectedPath,
    });

    // Cache the visible file paths so keyboard nav can step through
    // exactly what the user sees in the current room.
    visiblePathsCache = files.map((f) => f.path);

    const selected = files.find((f) => f.path === selectedPath)
      || allItems.find((it) => it.path === selectedPath)
      || null;
    preview.update(selected);
  }

  function cssEscape(s) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
    return String(s || '').replace(/(["\\])/g, '\\$1');
  }

  function countDirChildren(path) {
    const items = listDir?.(path) || [];
    return Array.isArray(items) ? items.length : 0;
  }

  function resolveRoom(room, allItems, pinnedSet) {
    if (room.kind === 'smart') {
      const id = room.id;
      const filtered = applySmart(allItems, id);
      return {
        cells: [],
        files: filtered,
        segment: SMART_LABEL[id] || 'Smart room',
      };
    }
    // Folder room
    const path = room.path || '/home';
    const raw = listDir?.(path) || [];
    const items = decorateItems(raw, { pinned: pinnedSet });
    const dirs = items.filter((it) => it.isDir);
    const files = items.filter((it) => !it.isDir);

    // Smart-room cells appear ONLY at the /home root
    const cells = [];
    if (path === '/home') {
      const smartDefs = [
        { id: 'recent',    label: 'Recent',    tone: 'smart',  icon: '🕒' },
        { id: 'pinned',    label: 'Pinned',    tone: 'smart',  icon: '📌' },
        { id: 'heavy',     label: 'Heavy',     tone: 'warm',   icon: '⚖️' },
        { id: 'forgotten', label: 'Forgotten', tone: '',       icon: '💀' },
      ];
      const counts = smartCounts(allItems);
      for (const def of smartDefs) {
        cells.push({
          kind: 'smart',
          id: def.id,
          label: def.label,
          tone: def.tone,
          icon: def.icon,
          meta: `${counts[def.id]} item${counts[def.id] === 1 ? '' : 's'}`,
        });
      }
    }
    dirs.forEach((d, i) => {
      cells.push({
        kind: 'folder',
        path: d.path,
        label: d.name,
        tone: FOLDER_TONES[i % FOLDER_TONES.length],
        icon: '📂',
        meta: `${countDirChildren(d.path)} items`,
      });
    });

    const segment = path === '/home' ? 'Home' : basename(path);
    return { cells, files, segment };
  }

  // ── Resize awareness — re-layout honeycomb when stage size changes.
  let resizeRaf = 0;
  const ro = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => render());
  });
  ro.observe(stage.root);

  // Cache of the most-recent visible file paths so keyboard nav lines
  // up with what the user can see on screen (after smart-room filter,
  // honeycomb cap, etc.). Populated by render().
  let visiblePathsCache = [];

  return {
    root,
    render,
    setRoom(room) { activeRoom = room; selectedPath = null; render(); },
    getRoom() { return { ...activeRoom }; },
    setSelected(path) { selectedPath = path; render(); },
    getSelected() {
      const allItems = decorateItems(listAllFiles?.() || [], { pinned: getPinnedSet?.() });
      return allItems.find((it) => it.path === selectedPath) || null;
    },
    clearSelection() { selectedPath = null; render(); },
    keyMove(delta) {
      if (!visiblePathsCache.length) return;
      const i = visiblePathsCache.indexOf(selectedPath);
      const next = i < 0
        ? (delta < 0 ? visiblePathsCache.length - 1 : 0)
        : (i + delta + visiblePathsCache.length) % visiblePathsCache.length;
      selectedPath = visiblePathsCache[next];
      render();
      // Scroll the active coin/tile/row into view if needed.
      const sel = root.querySelector(
        `.fv-coin[data-file-path="${cssEscape(selectedPath)}"], .fv-tile[data-path="${cssEscape(selectedPath)}"], .fv-list-row[data-path="${cssEscape(selectedPath)}"]`
      );
      sel?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    },
    /** Open the currently selected coin via the shell's open routing. */
    openSelected() {
      const it = this.getSelected();
      if (it) onOpenItem?.(it);
    },
    destroy() {
      ro.disconnect();
    },
  };
}

// Used by tests / shell for icon prefetch.
export { iconOf };
