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
