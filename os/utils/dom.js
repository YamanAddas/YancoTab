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

    if (child instanceof Node) {
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
