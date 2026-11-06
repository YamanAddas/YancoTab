# ADR 0001 — Add the `search` permission and route web search through the Chrome Search API

- **Status:** Proposed (branch `claude/chrome-search-api`, v1.12.0)
- **Date:** 2026-11-06

## Context

On 2026-11-03 the Chrome Web Store warned that YancoTab violates Quality
Guidelines → Single Purpose (reference "Red Argon"): it changes both the new
tab page and the user's search experience. YancoTab never set the default
search provider (`chrome_settings_overrides` is not in the manifest), but its
search bar, Browser app and PDF reader sent web searches to Google, DuckDuckGo
or Bing, picked by YancoTab's own setting. The store's fix: "If your new tab
page includes a search experience, it must respect the user's selected
settings by using the Chrome Search API." The warning expires 30 days after
2026-11-03; after that the listing is removed unless an approved draft
replaces it.

Policy reference: https://developer.chrome.com/docs/extensions/mv3/quality_guidelines
API reference: https://developer.chrome.com/docs/extensions/reference/api/search

## Decision

- Add `"search"` to `manifest.json` permissions. The permissions list shows no
  install warning for it, so existing users are not prompted or disabled.
- All web search goes through `os/services/webSearch.js` → `chrome.search.query({ text, disposition: 'NEW_TAB' })`.
- Remove YancoTab's own engine choice: onboarding step, Settings → Browser
  "Search Engine" group, Browser app engine pills. Settings now shows an info
  row pointing to Chrome's own search engine setting.
- If `chrome.search` is missing (standalone web build only), fall back to a
  plain web search URL. If `chrome.search.query` fails inside the extension,
  do nothing and log; never fall back to a hardcoded engine there.
- The legacy `yancotabSearchEngine` storage key and its validator stay so old
  saved data still loads; nothing reads it for searching any more.

## Alternatives rejected

- **Remove web search entirely.** No new permission, but loses a feature.
- **Engine dropdown defaulting to the Chrome engine.** Allowed by policy, but
  there is no API to name the user's engine, and it keeps the riskiest code.
- **Split into two extensions.** Only needed when overriding the default
  search provider, which YancoTab does not do.
- **Appeal.** The code did what the policy forbids.

## Consequences

- Searches always use the user's Chrome default engine.
- New code paths that open a web search must call `runWebSearch()`;
  `tests/webSearch.test.js` fails if engine URLs reappear in `os/`.
