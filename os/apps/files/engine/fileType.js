/**
 * files/engine/fileType.js — extension → category mapping.
 *
 * Categories shape what the Vault highlights and how items render:
 *   docs    — text/markdown/notes/pdf/word/spreadsheet/presentation
 *   img     — images
 *   video   — video
 *   audio   — audio
 *   code    — source code, configs
 *   archive — zips, tarballs
 *   other   — fallback
 *
 * The fuel gauge buckets to {docs, img, video, other}; code/audio/
 * archive collapse into 'other' for the visual breakdown but keep
 * their richer category for icon + filtering.
 *
 * Pure module — no DOM, no kernel.
 */

export const CATEGORIES = Object.freeze(['docs', 'img', 'video', 'audio', 'code', 'archive', 'other']);

const EXT_TABLE = {
  // docs
  txt: 'docs', md: 'docs', rtf: 'docs', doc: 'docs', docx: 'docs',
  pdf: 'docs', odt: 'docs', tex: 'docs',
  csv: 'docs', tsv: 'docs', xls: 'docs', xlsx: 'docs', ods: 'docs',
  ppt: 'docs', pptx: 'docs', odp: 'docs', key: 'docs',
  epub: 'docs', mobi: 'docs',

  // img
  png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', webp: 'img',
  bmp: 'img', svg: 'img', heic: 'img', heif: 'img', tif: 'img', tiff: 'img',
  ico: 'img', avif: 'img',

  // video
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video',
  avi: 'video', wmv: 'video', flv: 'video', m4v: 'video',

  // audio
  mp3: 'audio', wav: 'audio', flac: 'audio', m4a: 'audio',
  ogg: 'audio', oga: 'audio', opus: 'audio', aac: 'audio', wma: 'audio',

  // code
  js: 'code', mjs: 'code', cjs: 'code', ts: 'code', tsx: 'code', jsx: 'code',
  html: 'code', htm: 'code', css: 'code', scss: 'code', sass: 'code', less: 'code',
  json: 'code', yaml: 'code', yml: 'code', toml: 'code', xml: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code', kt: 'code',
  swift: 'code', c: 'code', cc: 'code', cpp: 'code', h: 'code', hpp: 'code',
  cs: 'code', php: 'code', sh: 'code', bash: 'code', zsh: 'code', fish: 'code',
  sql: 'code', ini: 'code', cfg: 'code', conf: 'code', log: 'code',

  // archive
  zip: 'archive', tar: 'archive', gz: 'archive', bz2: 'archive',
  '7z': 'archive', rar: 'archive', xz: 'archive', tgz: 'archive',
};

/**
 * extOf(name) → lowercase extension or '' if no dot.
 */
export function extOf(name) {
  const s = String(name || '');
  const dot = s.lastIndexOf('.');
  if (dot < 0 || dot === 0 || dot === s.length - 1) return '';
  return s.slice(dot + 1).toLowerCase();
}

/**
 * categoryOf(name) → one of CATEGORIES, defaulting to 'other'.
 */
export function categoryOf(name) {
  const ext = extOf(name);
  if (!ext) return 'other';
  return EXT_TABLE[ext] || 'other';
}

/**
 * fuelBucketOf(category) → 'docs' | 'img' | 'video' | 'other'.
 * Used by the fuel gauge to roll up code/audio/archive into 'other'.
 */
export function fuelBucketOf(category) {
  if (category === 'docs' || category === 'img' || category === 'video') return category;
  return 'other';
}

/**
 * iconOf(name) → emoji character. Used as a low-fidelity fallback in
 * the file coin / preview panel when no thumbnail is available.
 */
export function iconOf(name) {
  const c = categoryOf(name);
  switch (c) {
    case 'docs':    return '📄';
    case 'img':     return '🖼';
    case 'video':   return '🎬';
    case 'audio':   return '🎵';
    case 'code':    return '⌨';
    case 'archive': return '🗜';
    default:        return '📦';
  }
}
