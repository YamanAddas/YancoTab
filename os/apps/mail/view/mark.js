/**
 * view/mark.js — the provider plate.
 *
 * The only module in Mail that calls setLiteralHtml, and it only ever passes a
 * lookup into the module-level PROVIDER_MARKS registry — never data, never a
 * template. That keeps the codebase-wide invariant intact: every
 * setLiteralHtml call site resolves to a static constant.
 *
 * Colour handling is the whole point of this file. A brand mark composited
 * straight onto #060b14 would be invisible for every logo defined on white, so
 * the mark never touches the app surface — it sits on an opaque plate whose
 * colour pair is fixed in both themes. See marks.js §plates.
 */

import { el, setLiteralHtml } from '../../../utils/dom.js';
import { PROVIDER_MARKS } from '../marks.js';

/**
 * @param {import('../providerTable.js').Provider} provider
 * @param {'sm'|'md'|'lg'} [size]
 */
export function providerMark(provider, size = 'md') {
    const light = provider.plate === 'light';

    const plate = el('div', {
        class: `mail-mark mail-mark-${size} ${light ? 'mail-mark--light' : 'mail-mark--brand'}`,
        style: light
            // White plate, glyph in the brand colour.
            ? { color: provider.brand }
            // Brand plate, glyph in white. `color` drives currentColor in the
            // SVG *and* the letter fallback, so both stay legible together.
            : { background: provider.brand, color: '#fff' },
        'aria-hidden': 'true',
    });

    // hasOwn, not a bare lookup: an account blob can carry any providerId, and
    // 'constructor' must not resolve to something inherited from Object.
    const svg = Object.hasOwn(PROVIDER_MARKS, provider.id) ? PROVIDER_MARKS[provider.id] : null;
    if (svg) setLiteralHtml(plate, svg);
    else plate.textContent = provider.short || provider.name.slice(0, 1);

    return plate;
}
