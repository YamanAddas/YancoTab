/**
 * HTML boolean attributes: presence alone applies them, so `disabled="false"`
 * disables an element just as surely as `disabled="true"`.
 *
 * That made `el('button', { disabled: someCondition })` fail in exactly the
 * case it was guarding — the falsy one — and it shipped: all four Mahjong
 * sidebar buttons (Undo / Hint / Shuffle / New Game) were permanently dead,
 * three of them rendering `disabled="false"` with no disabled styling, so they
 * looked perfectly clickable.
 *
 * Deliberately a fixed list rather than "skip every falsy value": for ARIA,
 * `aria-expanded="false"` is meaningful and must NOT be dropped.
 */
export const BOOLEAN_ATTRS = new Set([
  "disabled", "checked", "selected", "readonly", "required", "multiple",
  "open", "autofocus", "controls", "loop", "muted", "playsinline",
  "reversed", "ismap", "novalidate", "formnovalidate", "inert", "default",
  "hidden", "async", "defer", "autoplay", "nomodule", "itemscope",
]);

export function el(tag, props = {}, children = []) {
  const element = document.createElement(tag);

  Object.entries(props).forEach(([key, value]) => {
    if (key === "class") {
      element.className = value;
      return;
    }

    // Boolean attributes: set with an empty value when truthy, remove entirely
    // when not. `disabled: 'disabled'` still reads as truthy, so the explicit
    // always-on spelling used for placeholder controls keeps working.
    if (BOOLEAN_ATTRS.has(key.toLowerCase())) {
      if (value === false || value == null || value === "") {
        element.removeAttribute(key);
      } else {
        element.setAttribute(key, "");
      }
      return;
    }

    if (key === "style" && typeof value === "object") {
      Object.assign(element.style, value);
      return;
    }

    if (key.startsWith("on")) {
      // A non-function here (e.g. `onclick: cond ? null : fn`) used to fall
      // through to setAttribute and write a literal inline handler attribute
      // such as onclick="null". MV3's CSP makes that inert, so it failed
      // silently — and no standard attribute starts with "on", so there is
      // nothing legitimate to fall through to.
      if (typeof value === "function") {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      }
      return;
    }

    element.setAttribute(key, value);
  });

  const resolvedChildren = Array.isArray(children) ? children : [children];
  resolvedChildren.forEach((child) => {
    if (child == null) {
      return;
    }

    // Duck-type DOM node check instead of `instanceof Node` so this module
    // stays safe in Node.js test environments where the Node global is absent.
    if (typeof child === 'object' && typeof child.nodeType === 'number') {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  });

  return element;
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Safely replace an element's children with literal HTML/SVG markup without
 * touching the live DOM tree's innerHTML. The fragment is parsed in an
 * inert document by DOMParser so any scripts in the markup never execute
 * and resource references don't fire fetches until the nodes are imported
 * into the live tree.
 *
 * Inline <svg> roots inside the HTML body are namespaced correctly by the
 * HTML5 parser — no separate code path needed.
 *
 * Use for trusted, static markup constants (decorative SVGs, hard-coded
 * HTML structures). Never pass user-supplied strings here.
 */
export function setLiteralHtml(element, html) {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><body>${String(html)}</body>`,
    'text/html',
  );
  const imported = Array.from(doc.body.childNodes).map((n) => document.importNode(n, true));
  element.replaceChildren(...imported);
}

/**
 * Parse a string into a sanitized <svg> element. Returns null if the input
 * isn't a valid SVG root.
 *
 * Strips:
 *   - any `on*` event-handler attribute on any element
 *   - any `<script>` element
 *   - `href` / `xlink:href` values that aren't same-document fragment refs
 *     (i.e. don't start with `#`)
 *
 * Use this for SVG strings that came from persisted storage. Inline-string
 * icons from app code go through this same path so the safe pattern is the
 * same everywhere.
 */
export function parseSafeSvg(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith('<svg')) return null;
  let doc;
  try {
    doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = doc?.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null;
  if (root.getElementsByTagName('parsererror').length) return null;

  const walk = (node) => {
    if (node.nodeType !== 1) return;
    if (node.nodeName.toLowerCase() === 'script') {
      node.remove();
      return;
    }
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'xlink:href') && !attr.value.startsWith('#')) {
        node.removeAttribute(attr.name);
      }
    }
    for (const child of Array.from(node.children)) walk(child);
  };
  walk(root);

  return document.importNode(root, true);
}

/**
 * Escape a string for safe embedding in a CSS double-quoted token
 * (typically inside `url("...")`).
 *
 * Escapes backslash, double-quote, and newline characters per the CSS
 * spec. Bare `"` escaping alone is not sufficient — a backslash in the
 * input lets a `"` slip through unescaped.
 */
export function cssUrlEscape(s) {
  return String(s).replace(/[\\"\n\r]/g, (c) => {
    if (c === '\\') return '\\\\';
    if (c === '"') return '\\"';
    return '\\' + c.charCodeAt(0).toString(16).padStart(2, '0') + ' ';
  });
}

/**
 * Build a `<link rel="stylesheet" href="...">` element.
 *
 * Lift of the `function css(href)` helper that was copy-pasted into 14
 * app files (Browser, Calculator, Memory, Notes, PdfReader, Photos,
 * Pomodoro, Settings, Snake, TicTacToe, Todo, Files, Tarneeb, Trix)
 * with no behavioral differences. Apps push these links into a list at
 * init() and remove them in destroy() — the convention is unchanged;
 * only the construction is now centralized.
 */
export function cssLink(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  return link;
}
