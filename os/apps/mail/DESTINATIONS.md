# Mail destination ledger

Every `dest` entry in [providerTable.js](providerTable.js) must appear here, and
the URL must match byte for byte. `tests/mail-destinations-ledger.test.js`
enforces both directions, so a destination cannot be added to the table without
being written down here first.

## Why this file exists

**Webmail deep links cannot be verified by probing.** Measured, not assumed:

```
https://mail.google.com/mail/u/0/                        302 -> accounts.google.com/ServiceLogin?...continue=.../mail/u/0/
https://mail.google.com/mail/u/0/zzzzz-not-a-real-path   302 -> accounts.google.com/ServiceLogin?...continue=.../mail/zzzzz-not-a-real-path/
https://outlook.live.com/mail/0/                         417
https://outlook.live.com/mail/0/zzzzz-not-a-real-path    417
https://mail.yahoo.com/d/folders/1                       302 -> login.yahoo.com/?...done=%2Fd%2Ffolders%2F1
https://mail.yahoo.com/d/zzzzz-not-a-real-path           302 -> login.yahoo.com/?...done=%2Fd%2Fzzzzz-not-a-real-path
```

Every provider bounces everything to login, and Gmail faithfully echoes the
nonsense path back. Worse: the highest-value destinations are **hash
fragments** (`#search/…`, `#starred`), and a fragment is never sent to the
server — so even an authenticated HTTP probe returns the same SPA shell for
`#starred` and `#zzzzz`.

Only a signed-in human, in a real browser, watching what renders, can confirm
one. This ledger is where that evidence is recorded.

## Status vocabulary

| status | meaning |
|---|---|
| `verified` | a signed-in human clicked the real control, copied the URL, and confirmed the templated form lands correctly |
| `inherited` | shipped in v1.2.0 and unchanged since; carried forward, never independently re-verified |
| `documented` | the provider's own address-bar-visible route; high confidence, **awaiting** a signed-in human |

All three ship. `documented` is the honest label for "I am confident and I have
not personally seen it" — it is not a synonym for `verified`, and the test
reports how many rows are still short of `verified` so the number can only fall
deliberately.

**Worst case for a wrong row is bounded**: a redirect to the provider's own
inbox or their own 404. `buildUrl`'s origin-invariance check means it can never
be a different host.

## How to verify a row

1. Sign in to the provider in a normal browser tab.
2. Click the real UI control (Sent, Drafts, the search box…).
3. Copy the URL bar verbatim.
4. Replace the account index with `{i}` and the query with `{q}`.
5. Paste into a clean tab with a real value substituted and confirm it lands.
6. Set `status` to `verified` and fill in the date.

~10 minutes per provider.

## Ledger

| provider | kind | url | status | verified | by |
|----------|------|-----|--------|----------|-----|
| gmail | inbox | `https://mail.google.com/mail/u/{i}/` | inherited | — | — |
| gmail | compose | `https://mail.google.com/mail/u/{i}/#inbox?compose=new` | inherited | — | — |
| gmail | search | `https://mail.google.com/mail/u/{i}/#search/{q}` | documented | — | — |
| gmail | starred | `https://mail.google.com/mail/u/{i}/#starred` | documented | — | — |
| gmail | sent | `https://mail.google.com/mail/u/{i}/#sent` | documented | — | — |
| gmail | drafts | `https://mail.google.com/mail/u/{i}/#drafts` | documented | — | — |
| outlook | inbox | `https://outlook.live.com/mail/{i}/` | inherited | — | — |
| outlook | compose | `https://outlook.live.com/mail/{i}/deeplink/compose` | documented | — | — |
| outlook | sent | `https://outlook.live.com/mail/{i}/sentitems` | documented | — | — |
| outlook | drafts | `https://outlook.live.com/mail/{i}/drafts` | documented | — | — |
| outlook365 | inbox | `https://outlook.office.com/mail/` | inherited | — | — |
| outlook365 | compose | `https://outlook.office.com/mail/deeplink/compose` | inherited | — | — |
| outlook365 | sent | `https://outlook.office.com/mail/sentitems` | documented | — | — |
| outlook365 | drafts | `https://outlook.office.com/mail/drafts` | documented | — | — |
| icloud | inbox | `https://www.icloud.com/mail` | inherited | — | — |
| proton | inbox | `https://mail.proton.me/u/{i}/inbox` | inherited | — | — |
| proton | compose | `https://mail.proton.me/u/{i}/inbox#compose` | inherited | — | — |
| proton | starred | `https://mail.proton.me/u/{i}/starred` | documented | — | — |
| proton | sent | `https://mail.proton.me/u/{i}/sent` | documented | — | — |
| proton | drafts | `https://mail.proton.me/u/{i}/drafts` | documented | — | — |
| yahoo | inbox | `https://mail.yahoo.com/d/folders/1` | inherited | — | — |
| yahoo | compose | `https://mail.yahoo.com/d/compose` | inherited | — | — |
| zoho | inbox | `https://mail.zoho.com/zm/` | inherited | — | — |
| zoho | compose | `https://mail.zoho.com/zm/#compose` | inherited | — | — |
| fastmail | inbox | `https://app.fastmail.com/mail/Inbox` | inherited | — | — |
| fastmail | compose | `https://app.fastmail.com/mail/compose` | inherited | — | — |
| fastmail | sent | `https://app.fastmail.com/mail/Sent` | documented | — | — |
| fastmail | drafts | `https://app.fastmail.com/mail/Drafts` | documented | — | — |
| yandex | inbox | `https://mail.yandex.com/` | inherited | — | — |
| yandex | compose | `https://mail.yandex.com/compose` | inherited | — | — |
| gmx | inbox | `https://navigator-bs.gmx.com/mail` | inherited | — | — |
| gmx | compose | `https://navigator-bs.gmx.com/mail?mailAction=compose` | inherited | — | — |
| aol | inbox | `https://mail.aol.com/d/folders/1` | inherited | — | — |
| aol | compose | `https://mail.aol.com/d/compose` | inherited | — | — |
| tuta | inbox | `https://app.tuta.com/mail` | inherited | — | — |
| tuta | compose | `https://app.tuta.com/mail/new` | inherited | — | — |

## Deliberately absent

| provider | kind | why |
|---|---|---|
| icloud | compose | Apple exposes no compose deep link. Previously the table set `compose` to the **inbox URL**, so the Compose button reopened the inbox and claimed to have composed. Absence is now the answer. |
| icloud | sent / drafts / starred / search | Same — `icloud.com/mail` is a single SPA entry point with no addressable sub-routes. |
| everything except gmail | search | Not confirmed for any other provider. A search chip that landed on an inbox would be worse than no search chip, so the search bar hides itself for accounts that cannot search. |
| yahoo / aol | sent / drafts | The `/d/folders/N` scheme is numeric and the mapping past `1` is not established. Guessing a folder id would silently open the wrong folder — the one failure mode with no visible symptom. |
| zoho / yandex / gmx / tuta | folders | No confirmed route. |

## Known maintenance debt

Providers change their URL schemes without notice and there is no way to be
told. Blast radius is one chip: a stale row misroutes that one destination and
nothing else. Rows carry dates so the oldest can be re-checked first.
