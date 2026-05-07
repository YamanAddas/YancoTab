/**
 * settings/engine/syncLog.js — pure buffer for sync events.
 *
 * Red-team rule (CRITICAL): NEVER include a key's value, oldValue, or
 * newValue in the buffer. Note titles, file paths, and todo content
 * would leak to anyone shoulder-surfing the Sync tab. Only the
 * registry key, the source ('local'|'remote'), the chunk count, and
 * the timestamp are stored.
 *
 * Buffer is capped at MAX_ENTRIES; oldest dropped first. Volatile —
 * the shell wires this with syncPolicy: 'never' so the log doesn't
 * itself sync across devices (also avoids a feedback loop).
 */

export const MAX_ENTRIES = 6;

export function makeBuffer() {
  return { entries: [] };
}

/**
 * record(buffer, event, now) → new buffer.
 *
 * `event` shape (from kernel.storage.subscribe payload):
 *   { key: string, source: 'local'|'remote', chunks?: number, ok?: boolean, err?: string }
 *
 * We DELIBERATELY ignore `oldValue` and `newValue` even though the
 * subscribe payload includes them. The view never sees the user's
 * notes / todos / file paths.
 */
export function record(buffer, event, now = Date.now()) {
  if (!buffer || !event || typeof event.key !== 'string' || !event.key) return buffer;
  const entry = {
    ts: now,
    key: shortKey(event.key),
    source: event.source === 'remote' ? 'remote' : 'local',
    chunks: Number.isFinite(event.chunks) ? Math.max(0, Math.floor(event.chunks)) : 1,
    ok: event.err ? false : true,
    err: event.err ? String(event.err).slice(0, 80) : null,
  };
  const entries = [entry, ...(Array.isArray(buffer.entries) ? buffer.entries : [])].slice(0, MAX_ENTRIES);
  return { entries };
}

/**
 * Strip the `yancotab_` prefix and trailing version suffix so the log
 * line stays readable. e.g. `yancotab_notes_meta_v2` → `notes-meta`.
 *
 * Critical: only operates on the *key string*. No value passes through
 * this function.
 */
export function shortKey(key) {
  if (typeof key !== 'string') return '';
  // Strip 'yancotab' prefix whether followed by _, -, or camelCase.
  let k = key.replace(/^yancotab[_-]?/, '');
  // Drop trailing version suffix.
  k = k.replace(/_v\d+$/, '');
  // Lowercase + dash-separate.
  k = k.replace(/_/g, '-').toLowerCase();
  return k.slice(0, 40);
}

/** Format an entry for terminal-style display. Pure. */
export function formatEntry(entry) {
  if (!entry) return '';
  const t = formatTime(entry.ts);
  const verb = entry.source === 'remote' ? 'pull' : 'push';
  const chunks = entry.chunks === 1 ? '1 chunk' : `${entry.chunks} chunks`;
  const status = entry.ok ? '✓' : '✗';
  return `${t}  ${verb}  ${entry.key}  ${chunks}  ${status}`;
}

function formatTime(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '--:--:--';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
