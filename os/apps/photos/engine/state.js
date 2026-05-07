/**
 * photos/engine/state.js — Lightbox photo record shape + helpers.
 *
 * The current PhotosApp loads a flat record array from FileSystemService:
 *   { id, path, name, dataUrl, thumbnail, width, height, size,
 *     created, modified }
 *
 * The Lightbox view layers a few derived fields on top, none of which
 * change the underlying fs.read content:
 *   displayName  — basename minus extension
 *   monthKey     — `YYYY-MM` string from `created`, used by the
 *                  scrubber and the featured-row label
 *   monthLabel   — human-friendly month label ("April 2026")
 *   exif         — only the slice of metadata we can verify
 *   favorite     — read from a separate kernel.storage key (we don't
 *                  rewrite image bytes just to flip a star)
 *
 * Pure module — no DOM, no kernel, no fs. Tests construct fake records
 * directly.
 */

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * decoratePhoto(rawPhoto, { favorites }) → photo with derived fields.
 *
 * `favorites` is a Set<string> of paths. Missing paths default to false.
 * Returns null if `rawPhoto` is non-object or has no `path`.
 */
export function decoratePhoto(rawPhoto, { favorites } = {}) {
  if (!rawPhoto || typeof rawPhoto !== 'object') return null;
  const path = typeof rawPhoto.path === 'string' ? rawPhoto.path : null;
  if (!path) return null;

  const created = Number.isFinite(rawPhoto.created) ? rawPhoto.created : 0;
  const modified = Number.isFinite(rawPhoto.modified) ? rawPhoto.modified : created;
  const name = typeof rawPhoto.name === 'string' && rawPhoto.name
    ? rawPhoto.name : basenameFromPath(path);
  const displayName = stripExt(name);
  const monthKey = created > 0 ? toMonthKey(created) : '';
  const monthLabel = created > 0 ? toMonthLabel(created) : '';
  const favorite = favorites instanceof Set ? favorites.has(path) : !!rawPhoto.favorite;

  return {
    ...rawPhoto,
    path,
    name,
    displayName,
    created,
    modified,
    monthKey,
    monthLabel,
    favorite,
    exif: buildExif(rawPhoto),
  };
}

/**
 * decoratePhotos(rawArr, opts) → array of decorated photos, dropping
 * malformed entries silently.
 */
export function decoratePhotos(rawArr, opts) {
  if (!Array.isArray(rawArr)) return [];
  const out = [];
  for (const r of rawArr) {
    const d = decoratePhoto(r, opts);
    if (d) out.push(d);
  }
  return out;
}

/**
 * Conservative EXIF view — only fields we know are real (non-zero
 * dimensions, finite size, mime). Camera/lens/ISO/shutter are NOT
 * synthesized — we only emit them if the source already has them.
 */
export function buildExif(p) {
  if (!p || typeof p !== 'object') return [];
  const out = [];
  if (Number.isFinite(p.width) && Number.isFinite(p.height) && p.width > 0 && p.height > 0) {
    out.push({ k: 'Dimensions', v: `${p.width} × ${p.height}` });
  }
  if (Number.isFinite(p.size) && p.size > 0) {
    out.push({ k: 'Size', v: formatBytes(p.size) });
  }
  if (typeof p.mime === 'string' && p.mime) {
    out.push({ k: 'Format', v: p.mime.replace(/^image\//i, '').toUpperCase() });
  }
  if (typeof p.path === 'string') {
    out.push({ k: 'Path', v: p.path });
  }
  // Only include camera/lens/ISO/shutter if upstream provided them.
  // (We don't currently extract these; the optional emit is forward-compat.)
  for (const key of ['camera', 'lens', 'iso', 'shutter', 'aperture']) {
    const v = p[key];
    if (typeof v === 'string' && v) {
      out.push({ k: cap(key), v });
    }
  }
  return out;
}

export function toMonthKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

export function toMonthLabel(ts) {
  const d = new Date(ts);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function fromMonthKey(key) {
  // returns { year, month, label } or null
  if (typeof key !== 'string') return null;
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month, label: `${MONTHS_LONG[month]} ${year}` };
}

function stripExt(name) {
  return String(name || '').replace(/\.[a-zA-Z0-9]{1,5}$/, '');
}

function basenameFromPath(p) {
  const s = String(p || '');
  const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return slash >= 0 ? s.slice(slash + 1) : s;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
