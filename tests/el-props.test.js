/**
 * Guard: props passed to el() that silently do the wrong thing.
 *
 * os/utils/dom.js `el()` routes every prop that isn't `class`, `style`, or
 * `on*` through `element.setAttribute(key, value)`. That is fine for real
 * attributes and quietly wrong for several common shapes:
 *
 *  1. BOOLEAN ATTRIBUTES ARE PRESENCE-BASED. `disabled: false` becomes
 *     `setAttribute('disabled', 'false')`, and a `disabled` attribute disables
 *     the element whatever its value is. So the falsy case — the case meant to
 *     ENABLE the control — is exactly the case that breaks it. This shipped:
 *     all four Mahjong sidebar buttons (Undo / Hint / Shuffle / New Game) were
 *     permanently dead, three of them rendering with `disabled="false"` and no
 *     disabled styling, so they looked clickable.
 *
 *  2. DOM-ONLY PROPERTIES AREN'T ATTRIBUTES. `textContent`, `innerHTML`,
 *     `className` and `htmlFor` have no matching content attribute, so
 *     setAttribute creates an inert lowercase attribute and the intent is lost.
 *
 *  3. `value` ON A TEXTAREA does nothing — a textarea's value comes from its
 *     child text, not a `value` attribute. Already fixed once for the OCR
 *     panel (see CHANGELOG 1.0.0); this stops it recurring.
 *
 *  4. NON-FUNCTION `on*` VALUES fall past the listener branch (which requires
 *     `typeof value === 'function'`) into setAttribute, writing a literal
 *     inline handler attribute such as `onclick="null"`. MV3's CSP makes it
 *     inert, so it fails silently rather than loudly.
 *
 * All four are invisible in review because the code reads as if it works.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OS_DIR = resolve(__dirname, '../os');

/** Presence-based attributes: any value at all, including "false", applies. */
const BOOLEAN_ATTRS = new Set([
    'disabled', 'checked', 'selected', 'readonly', 'required', 'multiple',
    'open', 'autofocus', 'controls', 'loop', 'muted', 'playsinline',
    'reversed', 'ismap', 'novalidate', 'formnovalidate', 'inert', 'default',
]);

/** Properties with no equivalent content attribute. */
const DOM_ONLY_PROPS = new Set(['textContent', 'innerHTML', 'innerText', 'className', 'htmlFor']);

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (name.endsWith('.js')) out.push(p);
    }
    return out;
}

/** Strip comments and string bodies so their contents can't look like code. */
function blankNonCode(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
        if (c === '/' && d === '*') {
            out += '  '; i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
            out += '  '; i += 2; continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            const quote = c; out += quote; i++;
            while (i < n && src[i] !== quote) {
                if (src[i] === '\\') { out += '  '; i += 2; continue; }
                out += src[i] === '\n' ? '\n' : ' '; i++;
            }
            out += quote; i++; continue;
        }
        out += c; i++;
    }
    return out;
}

/** Extract the balanced {...} starting at `start`, or null. */
function balanced(src, start, open = '{', close = '}') {
    if (src[start] !== open) return null;
    let depth = 0;
    for (let i = start; i < src.length; i++) {
        if (src[i] === open) depth++;
        else if (src[i] === close) { depth--; if (depth === 0) return { text: src.slice(start, i + 1), end: i }; }
    }
    return null;
}

/** Top-level `key: value` pairs of an object literal's source text. */
function topLevelProps(objText) {
    const body = objText.slice(1, -1);
    const props = [];
    let depth = 0, keyStart = 0, key = null, valStart = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if ('{[('.includes(c)) depth++;
        else if ('}])'.includes(c)) depth--;
        else if (c === ':' && depth === 0 && key === null) {
            key = body.slice(keyStart, i).trim().replace(/^['"]|['"]$/g, '');
            valStart = i + 1;
        } else if (c === ',' && depth === 0) {
            if (key !== null) props.push({ key, value: body.slice(valStart, i).trim() });
            key = null; keyStart = i + 1;
        }
    }
    if (key !== null) props.push({ key, value: body.slice(valStart).trim() });
    return props.filter(p => /^[A-Za-z_$][\w$-]*$/.test(p.key));
}

/**
 * Minimal element/document stub — enough to exercise el()'s attribute routing
 * without a DOM. Mirrors the presence-based semantics of a real boolean
 * attribute: `has()` is what the browser would treat as "applied".
 */
function stubDom() {
    const made = [];
    const makeEl = (tag) => {
        const attrs = new Map();
        const node = {
            tag, attrs, style: {}, className: '', children: [], listeners: [],
            nodeType: 1,
            setAttribute: (k, v) => attrs.set(k, String(v)),
            removeAttribute: (k) => attrs.delete(k),
            getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
            hasAttribute: (k) => attrs.has(k),
            addEventListener: (t, fn) => node.listeners.push({ t, fn }),
            appendChild: (c) => { node.children.push(c); return c; },
        };
        made.push(node);
        return node;
    };
    return {
        made,
        install() {
            globalThis.document = {
                createElement: makeEl,
                createTextNode: (t) => ({ nodeType: 3, text: String(t) }),
            };
        },
        restore() { delete globalThis.document; },
    };
}

function analyse() {
    const findings = [];
    let elCalls = 0;

    for (const file of walk(OS_DIR)) {
        // dom.js defines el(); its own doc examples aren't call sites.
        if (file.replace(/\\/g, '/').endsWith('os/utils/dom.js')) continue;
        const raw = readFileSync(file, 'utf8');
        const src = blankNonCode(raw);
        const rel = file.slice(resolve(__dirname, '..').length + 1).replace(/\\/g, '/');

        for (const m of src.matchAll(/\bel\(/g)) {
            // Tag argument, then the props object.
            const afterOpen = m.index + m[0].length;
            // Read the tag from RAW: blankNonCode replaces string CONTENTS with
            // spaces (preserving length, so indices still line up), which means
            // the blanked copy has no tag name left to match.
            const tagMatch = raw.slice(afterOpen).match(/^\s*(['"])([a-zA-Z0-9-]+)\1\s*,\s*/);
            if (!tagMatch) continue;
            const tag = tagMatch[2].toLowerCase();
            const objStart = afterOpen + tagMatch[0].length;
            const obj = balanced(src, objStart);
            if (!obj) continue;
            elCalls++;

            const line = src.slice(0, m.index).split('\n').length;
            const rawProps = topLevelProps(
                raw.slice(objStart, objStart + obj.text.length));

            for (const { key, value } of rawProps) {
                const at = { file: rel, line, tag, key, value: value.replace(/\s+/g, ' ').slice(0, 70) };

                if (DOM_ONLY_PROPS.has(key)) {
                    findings.push({ ...at, kind: `"${key}" has no content attribute; setAttribute cannot set it` });
                }
                if (key === 'value' && tag === 'textarea') {
                    findings.push({ ...at, kind: 'textarea value comes from child text, not a value attribute' });
                }
                if (/^on[A-Za-z]/.test(key) && !/^\s*(\(|function\b|async\b|[A-Za-z_$][\w$.]*\s*(\)|$)|this\.)/.test(value)
                    && /^(null|undefined|false|true|\d)/.test(value)) {
                    findings.push({ ...at, kind: `"${key}" is not a function; it becomes a literal inline handler attribute` });
                }
            }
        }
    }
    return { findings, elCalls };
}

describe('el() — boolean attribute handling', () => {
    let dom, el, BOOLEAN_ATTRS_LIVE;

    const withDom = async (fn) => {
        dom = stubDom();
        dom.install();
        ({ el, BOOLEAN_ATTRS: BOOLEAN_ATTRS_LIVE } = await import('../os/utils/dom.js'));
        try { return fn(); } finally { dom.restore(); }
    };

    test('a falsy boolean attribute is omitted, not set to "false"', async () => {
        // The bug this guards: `disabled="false"` DISABLES the element, so the
        // branch meant to enable a control was the branch that broke it.
        await withDom(() => {
            for (const v of [false, null, undefined, '']) {
                const node = el('button', { disabled: v });
                assert.equal(node.hasAttribute('disabled'), false,
                    `disabled: ${JSON.stringify(v)} must not apply`);
            }
        });
    });

    test('a truthy boolean attribute is applied', async () => {
        await withDom(() => {
            for (const v of [true, 'disabled', 'true', 1]) {
                const node = el('button', { disabled: v });
                assert.equal(node.hasAttribute('disabled'), true,
                    `disabled: ${JSON.stringify(v)} must apply`);
                // Canonical empty value, as the HTML spec prefers.
                assert.equal(node.getAttribute('disabled'), '');
            }
        });
    });

    test('the real expressions from the shipped bug now behave', async () => {
        await withDom(() => {
            const canUndo = false, enabled = true, i = 0, len = 3;
            // mahjongSideView: opts.disabled = !canUndo, then disabled: !!opts.disabled
            assert.equal(el('button', { disabled: !!(!canUndo) }).hasAttribute('disabled'), true,
                'nothing to undo -> disabled');
            assert.equal(el('button', { disabled: !!(!true) }).hasAttribute('disabled'), false,
                'undo available -> enabled (this was the broken case)');
            assert.equal(el('button', { disabled: !enabled }).hasAttribute('disabled'), false,
                'enabled -> NOT disabled (this was the broken case)');
            assert.equal(el('button', { disabled: i === 0 }).hasAttribute('disabled'), true);
            assert.equal(el('button', { disabled: i === len - 1 }).hasAttribute('disabled'), false);
        });
    });

    test('ARIA false is preserved — it is meaningful, unlike a boolean attribute', async () => {
        await withDom(() => {
            const node = el('div', { 'aria-expanded': false, 'aria-hidden': 'false' });
            assert.equal(node.getAttribute('aria-expanded'), 'false');
            assert.equal(node.getAttribute('aria-hidden'), 'false');
        });
    });

    test('non-boolean attributes are untouched by the new branch', async () => {
        await withDom(() => {
            const node = el('input', { type: 'text', value: 'hi', 'data-id': '7' });
            assert.equal(node.getAttribute('type'), 'text');
            assert.equal(node.getAttribute('value'), 'hi');
            assert.equal(node.getAttribute('data-id'), '7');
        });
    });

    test('a non-function on* prop is dropped, not written as an inline handler', async () => {
        // mahjongSideView passes `onclick: opts.disabled ? null : onClick`.
        // That used to emit onclick="null" as a literal attribute.
        await withDom(() => {
            const node = el('button', { onclick: null });
            assert.equal(node.hasAttribute('onclick'), false);
            assert.equal(node.listeners.length, 0);

            const fn = () => {};
            const live = el('button', { onclick: fn });
            assert.equal(live.hasAttribute('onclick'), false, 'must be a listener, not an attribute');
            assert.deepEqual(live.listeners, [{ t: 'click', fn }]);
        });
    });

    test('the boolean list covers the attributes actually used in os/', async () => {
        await withDom(() => {
            for (const k of ['disabled', 'checked', 'selected', 'readonly', 'hidden', 'open', 'multiple']) {
                assert.ok(BOOLEAN_ATTRS_LIVE.has(k), `${k} missing from BOOLEAN_ATTRS`);
            }
        });
    });
});

describe('el() props that silently misbehave', () => {
    const { findings, elCalls } = analyse();

    test('the scanner actually parses el() call sites', () => {
        // If this collapses the assertions below become vacuous.
        assert.ok(elCalls > 200, `only ${elCalls} el() call sites parsed — scanner likely broken`);
    });

    test('no el() call passes a prop that setAttribute handles wrongly', () => {
        const report = findings.map(f =>
            `\n  ${f.file}:${f.line}  el('${f.tag}', { ${f.key}: ${f.value} })\n      ${f.kind}`).join('');
        assert.equal(findings.length, 0,
            `${findings.length} prop(s) will not do what they look like:${report}\n\n`
            + 'For boolean attributes, omit the prop entirely when false (spread a conditional '
            + 'object, or set element.disabled after construction). See the header of this file.');
    });
});
