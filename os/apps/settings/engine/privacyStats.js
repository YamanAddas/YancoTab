/**
 * settings/engine/privacyStats.js — static, verifiable privacy facts.
 *
 * Red-team rule: every claim here must be **provable from the source
 * code**, not from a counter the user can't audit. The previous mock
 * had "0 tracking pixels in last 30 days" which was unverifiable — we
 * dropped it. "0 analytics scripts" is checked by `grep -ri` over the
 * source tree at any time.
 *
 * The endpoint list is the single source of truth that should match
 * `privacy.html`. If you add a network call elsewhere, add it here too.
 */

/**
 * The 5 third-party endpoints YancoTab speaks to. Each entry has a
 * label, a host, and a purpose. The host is for human reading — we
 * never make a request to a host string from here.
 */
export const ENDPOINTS = Object.freeze([
  { label: 'Open-Meteo', host: 'api.open-meteo.com',     purpose: 'forecast / geocode / air quality' },
  { label: 'weather.gov', host: 'api.weather.gov',         purpose: 'US severe-weather alerts' },
  { label: 'Nominatim',   host: 'nominatim.openstreetmap.org', purpose: 'reverse geocode' },
  { label: 'Google Favicons', host: 's2.googleusercontent.com', purpose: 'bookmark icons' },
  { label: 'Ko-fi',       host: 'ko-fi.com',               purpose: 'donate iframe (on click)' },
]);

/**
 * Returns a fixed shape the view renders. Computing on every render
 * is cheap (constant-time); we never cache.
 *
 * Each entry: { value, label, sub }
 */
export function privacyStats() {
  return [
    {
      value: '100%',
      label: 'Notes, todos, files',
      sub: 'stay on this device',
    },
    {
      value: '0',
      label: 'Analytics in source',
      sub: 'no gtag, mixpanel, or telemetry',
      // Truthful: no analytics scripts ship in the extension. Verifiable:
      // grep -ri "gtag\|analytics\|mixpanel\|sentry" os/ → no matches.
    },
    {
      value: String(ENDPOINTS.length),
      label: 'Network endpoints',
      sub: ENDPOINTS.map((e) => e.label).join(' · '),
    },
    {
      value: 'Chrome Sync',
      label: 'Encrypted in transit + at rest',
      sub: 'set a sync passphrase in Chrome for end-to-end',
    },
  ];
}

/**
 * Endpoint list rendering helper — used by the view to show the full
 * "tap to expand" detail.
 */
export function listEndpoints() {
  return ENDPOINTS.slice();
}
