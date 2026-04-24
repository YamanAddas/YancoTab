---
name: widgets
description: Deep context for the widget bar (Clock, Weather, Todo, Pomodoro and future widgets). Load when authoring a new widget or changing the widget bar. Covers the bento-bar layout, the data-push model (widgets never fetch), live-update cadence, the Yanco glass theme, and the mobile stacking behavior.
---

# SKILL: Widgets

**When to read:** any task that adds, modifies, or reviews a widget in the widget bar (see CHANGELOG v2.3.0).

## What a widget is

A small, always-visible surface on the new-tab page that shows a single piece of live information and allows at most one trivial inline action (e.g. toggle a todo). Widgets live in the bento bar below the greeting.

Today's widgets: **Clock**, **Weather**, **Todo**, **Pomodoro**. Storage key: `yancotab_widgets`.

## Hard rules

- **Widgets don't fetch.** They subscribe to a service (`weatherService`, `clockService`, `todoService`, `pomodoroService`) or read `kernel.storage`. A widget that calls `fetch()` is wrong layer.
- **One concern per widget.** A "stats" widget that rotates through 4 things is 4 widgets.
- **Live updates via kernel events.** Services emit on `kernel.emit('weather:updated', data)`; widgets subscribe in their lifecycle, unsubscribe on teardown.
- **At most one inline action.** Todo widget toggles a task — that's fine. A widget that opens a modal is not a widget; it's an app.
- **600-line cap per widget file.** (Tighter than the app cap — widgets should be small.)
- **Yanco glass styling.** Use the tokens from `.claude/skills/theme/SKILL.md`. No custom palette.
- **Mobile stacks vertically.** The bento row flex-wraps on narrow widths; widgets must render legibly in a single-column stack.
- **Render cost must be cheap.** Widgets are on the critical path for new-tab paint. Heavy work (LLM, large canvas, slow SVG) → don't ship as a widget.

## Lifecycle

```js
export class WeatherWidget {
  constructor(kernel, container) { this.kernel = kernel; this.root = container; }
  mount() { this.unsub = this.kernel.on('weather:updated', (d) => this.render(d)); this.render(); }
  render(data) { /* build DOM with el() */ }
  destroy() { this.unsub?.(); this.root.innerHTML = ''; }
}
```

The widget bar orchestrator owns mount/destroy — don't self-register.

## States

Every widget handles:

- `loading` — spinner/pulse, <300ms budget before rendering a neutral placeholder
- `ready` — normal render
- `empty` — "No tasks yet" / "No weather yet" with a link to open the app
- `error` — compact; clicking opens the owning app for details
- `stale` — data older than its TTL; show last-updated timestamp

## Accessibility

- Keyboard: Tab lands on the widget; Enter opens the owning app; interactive inline controls are reachable via Tab.
- Screen reader: each widget has an `aria-label` that includes its current value ("Weather: 72°F, sunny, San Francisco").
- Reduced motion: no bounces on update — fade only.

## Anti-patterns

- Widget that polls with `setInterval`. Subscribe to the service; the service polls centrally.
- Widget that writes to `kernel.storage` (other than its own inline action's payload via the owning service).
- A "more info" hover tooltip that hides critical state. If the user needs to hover to understand it, it's the wrong shape.
- Adding a new widget without updating the `yancotab_widgets` registry + settings UI for enable/disable.

## Adding a widget

1. Design via `architect` agent (scope, data source, storage key changes).
2. Add service if needed under `os/services/`.
3. Add widget class; register in the widget bar.
4. Add enable/disable toggle in Settings.
5. CHANGELOG entry.
