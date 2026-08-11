# Provider mark provenance

Covers the SVG brand marks in [marks.js](marks.js).

## What these are

Single-path monochrome silhouettes of each webmail provider's brand mark,
authored for YancoTab against each provider's published logo. They are
**geometric renditions, not copies of a vendor's SVG file** — each path was
constructed from primitives (arcs, straight segments) to fit a 24x24 viewBox
and to satisfy the two hard rules in `marks.js`:

- one `<path>` element, no `id`, no `<defs>`, no gradients
- `fill="currentColor"`, so colour comes from the plate rather than the file

Both rules are enforced by `tests/mail-marks.test.js`.

## Coverage

| provider | mark | notes |
|---|---|---|
| Gmail | yes | envelope whose interior forms the M |
| Outlook | yes | the O with the page it overlaps |
| Outlook 365 | yes | same glyph as Outlook — same product, one mark |
| iCloud Mail | yes | cloud |
| Proton Mail | yes | envelope with a detached V flap |
| Yahoo Mail | yes | Y with its exclamation mark |
| Zoho, Fastmail, Yandex, GMX, AOL, Tuta | letter fallback | see below |

The six without a mark render `provider.short` on the same brand-coloured
plate. That is not a placeholder: those brands are **wordmarks**, not glyphs,
and a letter on the brand colour is what they look like in a browser tab
already. `tests/mail-marks.test.js` asserts every provider renders something,
so no tile can go blank.

## Licensing

**Copyright.** The path data is original to this repository. No vendor SVG file
was copied, and no third-party icon package is vendored or depended on — which
also keeps the "no runtime npm dependencies" rule intact.

**Trademark.** The marks and provider names are registered trademarks of their
respective owners. They are used **nominatively**: to identify the destination
each tile opens, and nothing else. This is the same basis on which a browser
bookmark bar, a "Sign in with…" button, or any launcher displays them.

Conditions this usage meets:

1. The mark identifies only the provider it links to.
2. Nothing implies endorsement, affiliation, or partnership. The app states
   this in its own footnote, which is rendered on every screen:
   *"Provider names and logos are trademarks of their owners; YancoTab is not
   affiliated with or endorsed by any of them."*
3. No provider's mark is used as YancoTab's own branding.
4. Marks are reproduced as monochrome silhouettes on a plate.

**Point 4 is a deviation and worth naming.** Some vendors' brand guidelines —
Google's for Gmail in particular — specify full-colour reproduction. The
monochrome-on-plate treatment is the standard launcher convention and is
applied uniformly to all twelve, so it reads as one system rather than as an
appropriation of any single brand. It is still a modification.

## If a provider objects

Dropping a mark is a one-line change: delete its key from `PROVIDER_MARKS` and
it falls back to the letter plate automatically. No other code moves, and the
test that requires every provider to render something still passes.
