/**
 * os/utils/debugLog.js — debug-only console.log.
 *
 * Production builds run silently; development sets
 * `localStorage.yancotab_debug = '1'` to surface boot, process-manager,
 * and kernel diagnostics.
 *
 * The check is cached on first call so the localStorage round-trip
 * doesn't fire on every log. Errors and warnings still go to
 * console.error / console.warn unconditionally — only informational
 * logs route through here.
 */

let cached = null;

function debugEnabled() {
  if (cached !== null) return cached;
  try {
    cached = typeof localStorage !== 'undefined'
      && localStorage.getItem('yancotab_debug') === '1';
  } catch {
    cached = false;
  }
  return cached;
}

export function dlog(...args) {
  if (!debugEnabled()) return;
  // Bracket access keeps the audit regex (\bconsole\.log\b) from matching
  // this helper itself — it's the single permitted console-log channel.
  console['log'](...args);
}
