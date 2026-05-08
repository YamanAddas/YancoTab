/**
 * os/utils/url.js — URL scheme validation.
 *
 * Returns true only when the URL parses cleanly AND uses a scheme we
 * accept for user-controllable navigation. Anything else (javascript:,
 * data:, file:, blob:, intent:, vbscript:, chrome:, chrome-extension:,
 * about:, etc.) is rejected outright.
 *
 * Rationale: user-supplied URLs end up in `window.open`, `window.location.href`,
 * iframe `src`, anchor `href`. A javascript:-scheme URL passed to any of
 * those executes code in the new-tab origin, which has full access to
 * every localStorage/chrome.storage value the extension owns.
 */

const SAFE_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:', 'sms:']);

/**
 * Returns true if `raw` is a valid URL with a scheme we'll allow user
 * code to navigate to. Returns false for any parse failure or any
 * scheme not in the allowlist.
 *
 * Does NOT handle relative URLs — callers should resolve those to a
 * full URL (e.g. by prefixing `https://`) before validating.
 */
export function isSafeUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return SAFE_SCHEMES.has(parsed.protocol);
}

/**
 * Same as `isSafeUrl` but only allows `https:` and `http:` — used by
 * the in-extension Browser app's iframe target, where mailto:/tel:/sms:
 * have no business loading.
 */
export function isHttpUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  let parsed;
  try { parsed = new URL(raw); } catch { return false; }
  return parsed.protocol === 'https:' || parsed.protocol === 'http:';
}
