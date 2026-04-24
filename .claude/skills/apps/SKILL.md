---
name: apps
description: Deep context for os/apps/*.js — how a YancoTab app is structured. Load when authoring a new app, reviewing one, or refactoring the App base class. Covers the App lifecycle (init, render, onSignal, destroy), the kernel handle, mobile + desktop layout rules, the el() DOM builder, and the 800/1200-line file-size cap.
---

# SKILL: Apps

**When to read:** any task in `os/apps/`. Every app in YancoTab extends `os/core/App.js` and follows the same lifecycle and conventions.

## The App contract

```js
// os/apps/MyApp.js
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

export class MyApp extends App {
  constructor(kernel, pid) {
    super(kernel, pid);
    this.metadata = { name: 'My App', icon: '🧩', id: 'myapp' };
  }

  async init(args = {}) {
    await super.init(args);      // sets this.root
    this.render();
  }

  render() {
    this.root.innerHTML = '';
    this.root.append(el('div', { class: 'myapp' }, 'Hello'));
  }

  onSignal(sig) { /* 'pause' | 'resume' */ }
  destroy() { /* cleanup listeners/intervals */ super.destroy(); }
}
```

The kernel passes itself in. Persistence: `this.kernel.storage.get(key)` / `.set(key, value)`. Events: `this.kernel.on('foo', fn)` / `.emit('foo', payload)`. Toasts: `this.kernel.emit('toast', { type, msg })`.

## Hard rules

- **Extend `App`.** Don't roll a bare class. The process manager depends on the lifecycle.
- **One app per file.** Under `os/apps/`. Games go under `os/apps/games/`.
- **800-line soft cap, 1200 hard.** Split helpers into sibling files (`MyApp.settings.js`, `MyApp.view.js`) before the next addition that would cross the cap.
- **Persistence through `kernel.storage` only.** Register new keys in `os/services/appStorage.js` with `storageClass`, `syncPolicy`, `version`, `default`, `validate`. Never touch `localStorage` or `chrome.storage` directly.
- **DOM via `el()` from `os/utils/dom.js`, not `innerHTML` with user content.** If you must set HTML, sanitize at the boundary — prefer `textContent`.
- **Clean up in `destroy()`.** Cancel intervals, remove global listeners, release observers. Memory leaks in a new-tab extension compound across tabs.
- **Pointer Events.** `pointerdown/move/up` on the target. No `document.onmousemove` globals.
- **Mobile-aware.** `os/ui/mobileShell.js` controls the mobile layout. Use CSS with `@media (max-width: …)` queries; the root is the same element.
- **Metadata is required.** `name`, `icon`, `id` — used by the dock, spotlight, and folder system.

## Layout

Apps render into `this.root` (a `div.app-window`). The desktop/mobileShell handles chrome (title bar, window controls). Don't create your own title bar.

For a full-bleed canvas app (games), set `this.root.classList.add('app-fullbleed')` and render a `<canvas>` sized via `ResizeObserver`.

## Storage-key naming

`yancotab_<domain>` — e.g. `yancotab_notes`, `yancotab_todo_lists`, `yancotab_widgets`. Always snake_case, always prefixed. Register it.

## Anti-patterns

- Two apps mashed into one file (Photos + Files before unification — see PRODUCTION_PLAN for the lesson).
- Global state on `window.*`. Use `kernel` or module-scoped state.
- `setInterval` without a cleanup path in `destroy()`.
- Inline `<style>` tags injected at runtime. Put styles in `css/<app>.css` and include from `index.html`.
- Reading `chrome.storage.local` directly to "migrate." Do the migration through `AppStorage`.

## Testing

UI-heavy apps don't need unit tests; verify via the preview workflow. Pure utilities pulled out of an app (formatters, parsers, reducers) **do** need `tests/<app>-utils.test.js`. See `.claude/skills/testing/SKILL.md`.
