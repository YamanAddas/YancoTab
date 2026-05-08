/**
 * files/engine/state.js — decorate raw fs items for the Vault view.
 *
 * Raw fs item shape (from FileSystemService.list):
 *   { type: 'file' | 'directory', path, content?, meta?: { created, modified, size, ... } }
 *
 * Decorated shape adds:
 *   name        — basename of the path
 *   displayName — name minus extension (or full name for dirs)
 *   ext         — lowercase extension (or '' for dirs)
 *   category    — fileType category (or 'directory' for dirs)
 *   size        — number of bytes; 0 if unknown
 *   created     — ms epoch (falls back to modified, then 0)
 *   modified    — ms epoch (falls back to created, then 0)
 *   pinned      — boolean (looked up from a passed-in Set)
 *
 * Pure module — no DOM, no kernel.
 */

import { extOf, categoryOf } from './fileType.js';

export function decorateItem(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const path = typeof raw.path === 'string' ? raw.path : null;
  if (!path) return null;
  const isDir = raw.type === 'directory';
  const name = basename(path);
  const ext = isDir ? '' : extOf(name);
  const category = isDir ? 'directory' : categoryOf(name);
  const displayName = isDir ? name : (ext ? name.slice(0, name.length - ext.length - 1) : name);

  // FileSystemService stores meta sub-fields on items; sizes default
  // to content-length for files when meta.size is missing.
  const meta = (raw.meta && typeof raw.meta === 'object') ? raw.meta : {};
  const created = pickTs(meta.created, meta.modified);
  const modified = pickTs(meta.modified, created);
  const size = computeSize(raw, meta);
  const pinned = opts.pinned instanceof Set ? opts.pinned.has(path) : !!raw.pinned;

  return {
    ...raw,
    path, name, displayName, ext,
    category,
    size, created, modified,
    pinned,
    isDir,
  };
}

export function decorateItems(rawArr, opts) {
  if (!Array.isArray(rawArr)) return [];
  const out = [];
  for (const r of rawArr) {
    const d = decorateItem(r, opts);
    if (d) out.push(d);
  }
  return out;
}

export function basename(p) {
  const s = String(p || '');
  const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return slash >= 0 ? s.slice(slash + 1) : s;
}

export function dirname(p) {
  const s = String(p || '');
  const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (slash <= 0) return '/';
  return s.slice(0, slash);
}

function pickTs(...candidates) {
  for (const c of candidates) {
    if (Number.isFinite(c) && c >= 0) return c;
  }
  return 0;
}

function computeSize(raw, meta) {
  if (Number.isFinite(meta.size) && meta.size >= 0) return meta.size;
  if (raw.type === 'file' && typeof raw.content === 'string') return raw.content.length;
  return 0;
}

/**
 * formatBytes(n) → human-friendly size string.
 */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
