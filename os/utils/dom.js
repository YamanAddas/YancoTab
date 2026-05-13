export function el(tag, props = {}, children = []) {
  const element = document.createElement(tag);

  Object.entries(props).forEach(([key, value]) => {
    if (key === "class") {
      element.className = value;
      return;
    }

    if (key === "style" && typeof value === "object") {
      Object.assign(element.style, value);
      return;
    }

    if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
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
    if (child !== null && typeof child === 'object' && typeof child.nodeType === 'number') {
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
 * setting innerHTML on the live DOM tree. Uses a <template> element so the
 * parser evaluates the fragment in an inert context where scripts cannot run.
 *
 * Use for trusted, static markup constants (decorative SVGs, hard-coded HTML
 * structures). Never pass user-supplied strings here.
 */
export function setLiteralHtml(element, html) {
  const tmpl = document.createElement('template');
  tmpl.innerHTML = html;
  element.replaceChildren(...Array.from(tmpl.content.childNodes));
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
