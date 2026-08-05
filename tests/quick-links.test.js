/**
 * quick-links.test.js — the model behind the Web page's tiles.
 *
 * `yancotab_quick_links` shipped with a reader and no writer: the Web pane
 * rendered it read-only and the one component that could edit it was never
 * mounted. Two surfaces now write to it, which is exactly the setup that
 * produces two subtly different validation rules — so the rules live in one
 * module and are pinned here.
 *
 * The blob is sync-replicated and reachable by the JSON import path, so it
 * can legitimately arrive malformed or hand-edited. Most of what follows is
 * hostile input rather than happy path.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeLinks, addLink, removeLink, labelFor,
    suggestLabel, hasScheme, MAX_LINKS, MAX_LABEL,
} from '../os/ui/quickLinks/quickLinksModel.js';
import { sanitizeDisplayText } from '../os/utils/text.js';

const ok = (url, label = '') => ({ url, label });

describe('normalizeLinks', () => {
    test('non-arrays and junk entries collapse to an empty list', () => {
        for (const bad of [null, undefined, 0, 'x', {}, NaN]) {
            assert.deepEqual(normalizeLinks(bad), []);
        }
        assert.deepEqual(normalizeLinks([null, 3, 'https://a.com', { nourl: 1 }]), []);
    });

    test('drops any entry whose scheme we would refuse to open', () => {
        const links = normalizeLinks([
            ok('javascript:alert(1)'),
            ok('data:text/html,<script>'),
            ok('file:///etc/passwd'),
            ok('chrome-extension://abc/x.html'),
            ok('mailto:a@b.com'),          // safe elsewhere, but not a web tile
            ok('https://good.com'),
        ]);
        assert.deepEqual(links.map((l) => l.url), ['https://good.com/']);
    });

    test('dedupes on the parsed href, not the raw string', () => {
        // Two devices adding the same site must not produce two tiles.
        const links = normalizeLinks([ok('https://x.com'), ok('https://x.com/'), ok('https://x.com')]);
        assert.equal(links.length, 1);
    });

    test('a missing label falls back to the hostname without www.', () => {
        assert.equal(normalizeLinks([ok('https://www.example.com/path')])[0].label, 'example.com');
    });

    test('label hygiene: controls, zero-widths and bidi overrides are stripped', () => {
        // A pasted RLO visually reverses the rest of the row; zero-widths
        // make two different tiles look identical.
        const hostile = `A‮B​C\nD`;
        assert.equal(normalizeLinks([ok('https://x.com', hostile)])[0].label, 'ABCD');
    });

    test('emoji and Arabic labels survive intact', () => {
        assert.equal(normalizeLinks([ok('https://x.com', '🚀 صفحة')])[0].label, '🚀 صفحة');
    });

    test('caps the list so a corrupt import cannot grow it without bound', () => {
        const many = Array.from({ length: MAX_LINKS + 20 }, (_, i) => ok(`https://s${i}.com`));
        assert.equal(normalizeLinks(many).length, MAX_LINKS);
    });
});

describe('addLink', () => {
    test('a bare hostname is accepted the way an address bar accepts it', () => {
        const { links, error } = addLink([], 'example.com');
        assert.equal(error, null);
        assert.deepEqual(links, [{ label: 'example.com', url: 'https://example.com/' }]);
    });

    test('a REJECTED scheme is not rescued by prefixing https://', () => {
        // The bug this guards: prefixing unconditionally turns
        // `javascript:alert(1)` into `https://javascript:alert(1)`, which
        // parses, passes the http check, and is not what anyone typed.
        for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
            const { links, error } = addLink([], bad);
            assert.deepEqual(links, [], `${bad} must not be stored`);
            assert.match(error, /http/i);
        }
    });

    test('refuses a duplicate and says so', () => {
        const first = addLink([], 'https://x.com').links;
        const { links, error } = addLink(first, 'https://x.com/');
        assert.equal(links.length, 1);
        assert.match(error, /already/i);
    });

    test('refuses past the cap and says so', () => {
        let links = [];
        for (let i = 0; i < MAX_LINKS; i++) links = addLink(links, `https://s${i}.com`).links;
        const res = addLink(links, 'https://one-too-many.com');
        assert.equal(res.links.length, MAX_LINKS);
        assert.match(res.error, new RegExp(String(MAX_LINKS)));
    });

    test('empty input is refused without throwing', () => {
        for (const empty of ['', '   ', null, undefined, 42]) {
            const res = addLink([], empty);
            assert.deepEqual(res.links, []);
            assert.ok(res.error);
        }
    });

    test('does not mutate the array it was given', () => {
        const before = normalizeLinks([ok('https://a.com')]);
        const snapshot = JSON.stringify(before);
        addLink(before, 'https://b.com');
        assert.equal(JSON.stringify(before), snapshot);
    });

    test('a long label is clamped rather than rejected', () => {
        const { links } = addLink([], 'https://x.com', 'y'.repeat(MAX_LABEL + 40));
        assert.equal(links[0].label.length, MAX_LABEL);
    });
});

describe('removeLink', () => {
    test('removes by exact url and leaves the rest ordered', () => {
        const links = normalizeLinks([ok('https://a.com'), ok('https://b.com'), ok('https://c.com')]);
        const after = removeLink(links, 'https://b.com/');
        assert.deepEqual(after.map((l) => l.url), ['https://a.com/', 'https://c.com/']);
    });

    test('an unknown url is a no-op, not a throw', () => {
        const links = normalizeLinks([ok('https://a.com')]);
        assert.equal(removeLink(links, 'https://nope.com').length, 1);
        assert.equal(removeLink(links, null).length, 1);
    });
});

describe('label helpers', () => {
    test('labelFor strips www. and survives garbage', () => {
        assert.equal(labelFor('https://www.a.co.uk/x?y=1'), 'a.co.uk');
        assert.equal(labelFor('not a url'), '');
    });

    test('suggestLabel matches what addLink will actually store', () => {
        for (const typed of ['example.com', 'https://www.example.com', '  example.com  ']) {
            const { links } = addLink([], typed);
            assert.equal(links[0].label, suggestLabel(typed),
                `the name offered in the prompt must equal the name stored for "${typed}"`);
        }
    });

    test('hasScheme distinguishes a scheme from a hostname with a colon', () => {
        assert.equal(hasScheme('https://x.com'), true);
        assert.equal(hasScheme('javascript:x'), true);
        assert.equal(hasScheme('example.com'), false);
        assert.equal(hasScheme('localhost:3000'), true); // ambiguous by design — RFC says scheme
    });
});

describe('sanitizeDisplayText', () => {
    test('returns a string for every input type', () => {
        for (const bad of [null, undefined, 5, {}, []]) {
            assert.equal(sanitizeDisplayText(bad), '');
        }
    });

    test('iterates by code point so astral characters are not split', () => {
        // A naive charCodeAt loop halves an emoji into lone surrogates.
        assert.equal(sanitizeDisplayText('a👨‍👩‍👧b'), 'a👨‍👩‍👧b');
    });

    test('ZWJ and ZWNJ survive; ZWSP and the bidi overrides do not', () => {
        // The range this was extracted from ran 200b–200f in one span and
        // swept up the two text-SHAPING characters along with the invisible
        // ones. ZWJ is what makes 👨‍👩‍👧 a single family glyph rather than
        // three people; ZWNJ controls Arabic and Persian letter joining.
        const ch = (cp) => String.fromCodePoint(cp);
        assert.equal(sanitizeDisplayText(`a${ch(0x200d)}b`), `a${ch(0x200d)}b`, 'ZWJ must survive');
        assert.equal(sanitizeDisplayText(`می${ch(0x200c)}رود`), `می${ch(0x200c)}رود`, 'ZWNJ must survive');
        assert.equal(sanitizeDisplayText(`a${ch(0x200b)}b`), 'ab', 'ZWSP must be stripped');
        assert.equal(sanitizeDisplayText(`a${ch(0x202e)}b`), 'ab', 'RLO must be stripped');
        assert.equal(sanitizeDisplayText(`a${ch(0x200e)}b`), 'ab', 'LRM must be stripped');
    });
});
