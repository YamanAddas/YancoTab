import { el } from '../../utils/dom.js';
import { GAME_MINI_ICONS } from './GameIcons.js';

/**
 * FolderIcon — v0.7
 *
 * iOS-style 3D glass folder icon with live mini-icon previews.
 *
 * v0.7 fixes:
 *   - CRITICAL BUG FIX: constructor now receives children array directly
 *     (v0.6 passed array but code tried to call it as a function → icons never rendered)
 *   - 2×2 mini-icon layout (like iOS) for cleaner look
 *   - Enhanced 3D glass with dynamic specular highlight following finger
 *   - Proper image/emoji rendering for child previews
 */
export class FolderIcon {
  /**
   * @param {Object} folderItem - The folder state object
   * @param {Array} children - Array of child item objects (already resolved, not IDs)
   */
  constructor(folderItem, children) {
    this.folderItem = folderItem;
    // v0.7 FIX: children is an array of item objects, NOT a lookup function
    this.children = Array.isArray(children) ? children : [];
  }

  render() {
    const root = el('div', {
      class: 'hex-icon folder-hex folder-glass3d',
      'data-app-id': this.folderItem.id,
      title: this.folderItem.title || 'Folder'
    });

    // Interactive specular highlight
    root.style.setProperty('--fx', '50%');
    root.style.setProperty('--fy', '35%');

    const onMove = (e) => {
      const rect = root.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        root.style.setProperty('--fx', `${Math.max(0, Math.min(100, x)).toFixed(1)}%`);
        root.style.setProperty('--fy', `${Math.max(0, Math.min(100, y)).toFixed(1)}%`);
      }
    };
    const onLeave = () => {
      root.style.setProperty('--fx', '50%');
      root.style.setProperty('--fy', '35%');
    };
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave, { passive: true });
    root.addEventListener('pointercancel', onLeave, { passive: true });

    // Store refs for cleanup
    this._root = root;
    this._onMove = onMove;
    this._onLeave = onLeave;

    const content = el('div', { class: 'hex-icon-content folder-hex-content' });

    // ── Mini-icon grid (2×2 like iOS) ───────────────────────
    const previewGrid = el('div', { class: 'folder-preview-grid folder-preview-2x2' });
    const previews = this.children.slice(0, 4);

    for (let i = 0; i < 4; i++) {
      const child = previews[i] || null;
      previewGrid.appendChild(this._renderPreviewCell(child));
    }

    content.appendChild(previewGrid);

    // ── Glass layers ────────────────────────────────────────
    content.appendChild(el('div', { class: 'folder-depth' }));
    content.appendChild(el('div', { class: 'folder-specular' }));
    content.appendChild(el('div', { class: 'folder-sheen' }));
    content.appendChild(el('div', { class: 'folder-rim' }));

    root.appendChild(content);
    return root;
  }

  _renderPreviewCell(child) {
    const cell = el('div', { class: 'folder-preview-cell' });
    if (!child) return cell;

    const iconVal = child.icon;
    const title = child.title || '';

    // Game mini-icon (game:snake, game:memory, etc.)
    if (iconVal && String(iconVal).startsWith('game:')) {
      const gameKey = String(iconVal).substring(5);
      const miniSvg = GAME_MINI_ICONS[gameKey];
      if (miniSvg) {
        const wrap = el('div', { class: 'folder-preview-game' });
        wrap.innerHTML = miniSvg;
        cell.appendChild(wrap);
        return cell;
      }
    }

    // URL-based icon (favicon, image)
    if (iconVal && (String(iconVal).includes('/') || String(iconVal).startsWith('data:') || String(iconVal).startsWith('http'))) {
      const img = el('img', {
        src: iconVal, alt: title, draggable: false, class: 'folder-preview-img',
      });
      img.onerror = () => {
        img.remove();
        cell.appendChild(el('div', { class: 'folder-preview-emoji' }, title.charAt(0) || '?'));
      };
      cell.appendChild(img);
      return cell;
    }

    // SVG/HTML inline
    if (iconVal && String(iconVal).trim().startsWith('<')) {
      cell.innerHTML = iconVal;
      return cell;
    }

    // Emoji or text
    cell.appendChild(el('div', { class: 'folder-preview-emoji', title }, iconVal || title.charAt(0) || '📦'));
    return cell;
  }

  destroy() {
    if (this._root && this._onMove) {
      this._root.removeEventListener('pointermove', this._onMove);
      this._root.removeEventListener('pointerleave', this._onLeave);
      this._root.removeEventListener('pointercancel', this._onLeave);
    }
    this._root = null;
    this._onMove = null;
    this._onLeave = null;
  }
}
