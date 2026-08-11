/**
 * marks.js — provider brand marks, as static inline SVG constants.
 *
 * Same shape as os/ui/components/PhosphorIcons.js and GameIcons.js: a
 * module-level frozen registry of literal strings, rendered by view/mark.js
 * through setLiteralHtml. Nothing here is ever built from data, so the
 * "setLiteralHtml only ever receives a module constant" invariant holds.
 *
 * WHY INLINE AND NOT FAVICONS
 * ---------------------------
 * Fetching https://s2.googleusercontent.com/s2/favicons?domain=… would render
 * today and vanish tomorrow. sw.js is precache-or-network with **no runtime
 * cache.put**, so a remote favicon cannot be cached and simply fails offline —
 * and "works offline" is a core product principle, not a nice-to-have. It
 * would also cost 12 network requests on every open and leak which providers
 * the user cares about to a third party. Inline SVG costs nothing and is
 * always there.
 *
 * TWO HARD RULES, BOTH ENFORCED BY tests/mail-marks.test.js
 * ---------------------------------------------------------
 * 1. **No `id` attributes, no <defs>, no gradients.** SmartIcon needs
 *    `_scopeSvgIds()` precisely because duplicate gradient ids across
 *    instances make `url(#…)` bind to the first match in document order —
 *    which, after a page switch, can be inside a `display:none` pane. Mail
 *    renders the same mark at up to three sizes at once, which is exactly
 *    that setup. Monochrome single-path marks make the whole bug class
 *    unreachable rather than mitigated.
 * 2. **`fill="currentColor"` and viewBox `0 0 24 24`.** Colour comes from the
 *    plate (below), so one authored mark serves every size and both themes.
 *
 * PLATES — how a brand mark survives both themes
 * ----------------------------------------------
 * Most brand marks are defined dark-on-white, and a dark glyph on #060b14 is
 * invisible. So a mark is *never* composited against the app surface: it
 * always sits on an opaque plate whose colour is fixed in both themes.
 *
 *   plate: 'light'  white plate, glyph in the provider's brand colour.
 *                   For marks that are defined on white (Gmail, Outlook,
 *                   iCloud) — the treatment their own guidelines expect.
 *   plate: 'brand'  plate in the brand colour, glyph in white. For brands
 *                   whose identity IS the colour, and for the letter
 *                   fallbacks below.
 *
 * Either way the contrast pair is (white, brand) and is theme-independent by
 * construction. tests/mail-marks.test.js computes it for all twelve and
 * requires >= 3:1 (WCAG 1.4.11, non-text graphical object).
 *
 * FALLBACK
 * --------
 * A provider with no entry here renders `provider.short` as text on the same
 * plate — which is what Yandex, GMX, AOL and Zoho actually look like in a
 * browser tab anyway, since their brands are wordmarks rather than glyphs.
 * No provider is ever blank; that is asserted by test.
 *
 * TRADEMARKS
 * ----------
 * These are third-party trademarks, used nominatively to identify the
 * destination they open — the same basis a bookmark bar or a "Sign in with…"
 * button operates on. YancoTab is not affiliated with or endorsed by any of
 * them, which the app states in its own footnote. See MARKS_PROVENANCE.md.
 */

// Outlook and Outlook 365 are the same product and ship the same glyph — only
// the tint and the `hint` line separate them. Icons cannot disambiguate these
// two; that is the `hint` field's job. See providerTable.js.
const OUTLOOK_MARK = '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"'
    + ' aria-hidden="true"><path d="M8.3 5.2a6.1 6.6 0 1 0 0 13.2 6.1 6.6 0 0 0 0-13.2Zm0 3a3.2'
    + ' 3.6 0 1 1 0 7.2 3.2 3.6 0 0 1 0-7.2ZM16.4 8.1 22 6.2v11.6l-5.6-1.9Z"/></svg>';

/** @type {Readonly<Object<string,string>>} */
export const PROVIDER_MARKS = Object.freeze({
    // Gmail — the envelope whose interior forms an M.
    gmail: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
        + '<path d="M22 6.6v11.02c0 .76-.62 1.38-1.38 1.38h-2.65v-7.9L12 15.24l-5.97-4.14v7.9H3.38'
        + 'A1.38 1.38 0 0 1 2 17.62V6.6c0-1.7 1.94-2.68 3.3-1.65l.73.55L12 9.66l5.97-4.16.73-.55'
        + 'C20.06 3.92 22 4.9 22 6.6Z"/></svg>',

    // Outlook — the O, with the page it overlaps.
    outlook: OUTLOOK_MARK,
    outlook365: OUTLOOK_MARK,

    // iCloud — the cloud.
    icloud: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
        + '<path d="M18.55 9.98a5.65 5.65 0 0 0-10.6-1.8 4.55 4.55 0 0 0 .5 9.07h9.5a3.7 3.7 0 0 0'
        + ' .6-7.27Z"/></svg>',

    // Proton Mail — envelope with the V flap detached from the body.
    proton: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
        + '<path d="M12 12.9 2.85 6.2A2 2 0 0 1 4.75 4.8h14.5a2 2 0 0 1 1.9 1.4Z"/>'
        + '<path d="M2.6 8.2 12 15.05 21.4 8.2v8.85a2.15 2.15 0 0 1-2.15 2.15H4.75'
        + 'A2.15 2.15 0 0 1 2.6 17.05Z"/></svg>',

    // Yahoo — the Y with its exclamation mark.
    yahoo: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
        + '<path d="M1.9 5.6h4.3l3.35 5.85L12.9 5.6h4.2l-5.55 9.2v4.6H7.45v-4.6Z"/>'
        + '<path d="M17.9 5.6h3.9l-.75 7.15h-2.4Z"/>'
        + '<path d="M19.5 15.2a2 2 0 1 1 0 4.01 2 2 0 0 1 0-4.01Z"/></svg>',
});
