# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in YancoTab, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email: [create a private security advisory on GitHub](https://github.com/YamanAddas/YancoTab/security/advisories/new)

We will respond within 48 hours and work with you to understand and fix the issue.

## Security Architecture

### Data Storage
- All user data is stored locally in the browser via `localStorage`
- When running as a Chrome extension, preferences sync via `chrome.storage.sync` (encrypted by Chrome)
- No data is sent to any server owned by YancoTab
- No analytics, telemetry, or tracking of any kind

### Permissions
- YancoTab requests only the `storage` permission
- No access to browsing history, tabs, bookmarks, cookies, or website content
- No content scripts injected into any page
- No background scripts or persistent connections

### External API Calls
YancoTab makes network requests only for weather functionality:
- **Open-Meteo API** (`api.open-meteo.com`) — weather forecasts (no API key, no auth)
- **Open-Meteo Geocoding** (`geocoding-api.open-meteo.com`) — city search (no API key, no auth)
- **OpenStreetMap Nominatim** (`nominatim.openstreetmap.org`) — reverse geocoding (no API key, no auth)
- **Google Favicon API** (`www.google.com/s2/favicons`) — website icons for bookmarks (no auth)
- **NWS Alerts API** (`api.weather.gov`) — US weather alerts (no auth)

No user data is sent in any of these requests. Only coordinates and city names.

### Content Security Policy
YancoTab enforces a strict CSP via Manifest V3:
- No inline scripts
- No `eval()` or dynamic code execution — the one exception is `'wasm-unsafe-eval'`, which permits `WebAssembly.compile()` for the vendored tesseract-wasm OCR engine (see `vendor/tesseract/PROVENANCE.md`). This directive does **not** enable `eval()` or `Function()` (see [Chrome MV3 CSP docs](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security#remove-execution-of-strings))
- No remote script loading
- All JavaScript loaded from the extension package only

### URL Handling
- All URLs opened by YancoTab are validated against an allowlist of safe schemes (`https:`, `http:`, `tel:`, `mailto:`, `sms:`)
- `javascript:`, `data:`, and `blob:` URIs are blocked
- External links open in new tabs with `noopener,noreferrer`

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x.x   | Yes      |
| < 2.0   | No       |


## OpenSSF Scorecard Notes

YancoTab scores well on most [OpenSSF Scorecard](https://securityscorecards.dev/) checks. One check is intentionally not applicable:

### Fuzzing (not applicable)

YancoTab is a **browser extension** — it has no server endpoints, no binary protocol parsers, and no network-facing attack surface that fuzzing could exercise. OSS-Fuzz requires a C/C++/Go/Rust/Java target with a `LLVMFuzzerTestOneInput` harness or equivalent. A pure-JavaScript Chrome extension with no native code has no compatible fuzzing target. This is a structural limitation of the Scorecard's fuzzing check, not a security gap.

All input-handling code (URL validation, file imports, JSON parsing, annotation data) is covered by the `node --test` unit suite in `tests/`.
