/**
 * photos/storage.js — FileSystemService adapter for photo I/O.
 *
 * Wraps the read/write/delete/list dance for the Photos app so the
 * shell can stay terse. Also handles the one-shot legacy migration
 * from the pre-v2 localStorage gallery into the virtual filesystem.
 */

const PHOTOS_DIR = '/home/photos';
const LEGACY_GALLERY_KEY = 'yancotab_photos_gallery';
const MIGRATION_FLAG = 'yancotab_photos_migrated_v1';

export { PHOTOS_DIR };

export function loadGallery(fs) {
  if (!fs) return [];
  const items = fs.list(PHOTOS_DIR);
  return items
    .filter((item) => item.type === 'file')
    .map((item) => ({
      id: item.meta?.photoId || item.path,
      path: item.path,
      name: basename(item.path),
      dataUrl: item.content,
      thumbnail: item.meta?.thumbnail || item.content,
      width: item.meta?.width || 0,
      height: item.meta?.height || 0,
      size: item.meta?.size || 0,
      mime: item.meta?.mime || 'image/png',
      created: item.meta?.created || Date.now(),
      modified: item.meta?.modified || Date.now(),
    }));
}

/**
 * savePhoto(fs, name, dataUrl, meta) → resolved fs path.
 * Resolves filename collisions by appending " (2)", " (3)", etc.
 */
export function savePhoto(fs, name, dataUrl, meta = {}) {
  if (!fs) return null;
  const cleanName = sanitizeFilename(name);
  let targetPath = `${PHOTOS_DIR}/${cleanName}`;
  if (fs.exists(targetPath)) {
    const ext = cleanName.includes('.') ? cleanName.slice(cleanName.lastIndexOf('.')) : '';
    const base = cleanName.includes('.') ? cleanName.slice(0, cleanName.lastIndexOf('.')) : cleanName;
    let counter = 2;
    while (fs.exists(targetPath)) {
      targetPath = `${PHOTOS_DIR}/${base} (${counter})${ext}`;
      counter++;
    }
  }
  fs.write(targetPath, dataUrl, {
    mime: meta.mime || 'image/png',
    size: meta.size || 0,
    width: meta.width || 0,
    height: meta.height || 0,
    thumbnail: meta.thumbnail || '',
    photoId: meta.photoId || `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: 'photos',
    created: meta.created || Date.now(),
  });
  return targetPath;
}

/** Move a photo to /home/trash; falls back to delete on collision. */
export function deletePhoto(fs, photoPath) {
  if (!fs || !photoPath) return;
  const name = basename(photoPath);
  const trashPath = `/home/trash/${name}`;
  try { fs.rename(photoPath, trashPath); }
  catch { fs.delete(photoPath); }
}

/**
 * Intentional direct localStorage: one-shot pre-v2 migration of the
 * old localStorage-backed gallery into the fs. Never written back.
 */
export function migrateLegacyGallery(fs) {
  if (!fs) return;
  if (localStorage.getItem(MIGRATION_FLAG)) return;
  try {
    const raw = localStorage.getItem(LEGACY_GALLERY_KEY);
    if (!raw) { localStorage.setItem(MIGRATION_FLAG, '1'); return; }
    const oldGallery = JSON.parse(raw);
    if (!Array.isArray(oldGallery) || oldGallery.length === 0) {
      localStorage.setItem(MIGRATION_FLAG, '1');
      return;
    }
    for (const item of oldGallery) {
      if (!item.dataUrl) continue;
      savePhoto(fs, item.name || `photo_${item.id}.png`, item.dataUrl, {
        mime: 'image/png',
        size: item.size || 0,
        width: item.width || 0,
        height: item.height || 0,
        thumbnail: item.thumbnail || '',
        photoId: item.id,
        created: item.created || Date.now(),
      });
    }
    localStorage.removeItem(LEGACY_GALLERY_KEY);
    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch (e) {
    console.warn('[Photos] Migration failed:', e);
    localStorage.setItem(MIGRATION_FLAG, '1');
  }
}

export function basename(path) { return (path || '').split('/').pop() || ''; }

export function sanitizeFilename(name) {
  return (name || 'photo.png')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'photo.png';
}

/** Build a JPEG thumbnail data URL from a loaded HTMLImageElement. */
export function makeThumbnail(img, size = 200) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(size / img.width, size / img.height);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}
