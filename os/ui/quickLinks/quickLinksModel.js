/**
 * quickLinks/quickLinksModel.js — pure model for the Web pane's tiles.
 *
 * `yancotab_quick_links` shipped with five defaults and no way to change
 * them: the Web pane rendered the list read-only, and the one component
 * that could edit it (ui/components/QuickLinks.js) was never mounted by
 * anything. So the key had a reader and no writer — five links, forever.
 *
 * Two surfaces now edit it (the Web pane inline, and Settings → Home &
 * widgets), which is exactly the setup that produces two subtly different
 * validation rules. All of it lives here instead.
 *
 * The blob is sync-replicated and reachable by JSON import, so it can
 * arrive malformed, from a newer version, or hand-edited. Everything
 * unrecognised is dropped rather than trusted.
 */

import { isHttpUrl } from '../../utils/url.js';
import { sanitizeDisplayText } from '../../utils/text.js';

export const LINKS_KEY = 'yancotab_quick_links';
export const MAX_LINKS = 12;
export const MAX_LABEL = 24;

/**
 * Does `typed` already carry a scheme?
 *
 * Exported because the add flow needs to prefix "example.com" the way an
 * address bar does WITHOUT rescuing a rejected scheme — blindly prefixing
 * would turn `javascript:alert(1)` into `https://javascript:alert(1)`,
 * which parses, passes the http check, and is not what anyone typed.
 */
export function hasScheme(typed) {
  return /^[a-z][a-z0-9+.-]*:/i.test(String(typed || '').trim());
}

/** What the add flow will store if the user gives no name of their own. */
export function suggestLabel(typed) {
  const s = String(typed || '').trim();
  if (!s) return '';
  return labelFor(hasScheme(s) ? s : `https://${s}`);
}

/** Hostname without a leading www., used as the default label. */
export function labelFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/**
 * Coerce a stored value into a valid link array.
 *
 * Deliberately drops rather than repairs: a link whose URL no longer
 * passes the scheme check is a link that would open something we refuse
 * to open, so keeping a visible tile for it is worse than losing it.
 */
export function normalizeLinks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (!isHttpUrl(url)) continue;
    // Dedupe on the parsed href: "https://x.com" and "https://x.com/" are
    // the same tile, and two devices adding it independently must not
    // produce two.
    let href;
    try { href = new URL(url).href; } catch { continue; }
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({
      label: sanitizeDisplayText(entry.label, MAX_LABEL) || labelFor(href),
      url: href,
    });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

/**
 * Add a link. Returns the new array plus an error string when refused,
 * so a caller can surface exactly why rather than failing silently.
 *
 * @returns {{links: Array, error: string|null}}
 */
export function addLink(links, rawUrl, rawLabel = '') {
  const current = normalizeLinks(links);
  const typed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!typed) return { links: current, error: 'Enter a URL' };

  // Accept "example.com" the way an address bar does — see hasScheme for
  // why this is not an unconditional prefix.
  const candidate = hasScheme(typed) ? typed : `https://${typed}`;
  if (!isHttpUrl(candidate)) return { links: current, error: 'Only http and https links are allowed' };

  const href = new URL(candidate).href;
  if (current.some((l) => l.url === href)) return { links: current, error: 'That link is already here' };
  if (current.length >= MAX_LINKS) return { links: current, error: `Up to ${MAX_LINKS} links` };

  const label = sanitizeDisplayText(rawLabel, MAX_LABEL) || labelFor(href);
  return { links: [...current, { label, url: href }], error: null };
}

/** Remove by exact URL. Returns a new array; unknown urls are a no-op. */
export function removeLink(links, url) {
  const current = normalizeLinks(links);
  return current.filter((l) => l.url !== url);
}
