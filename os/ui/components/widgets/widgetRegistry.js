/**
 * widgets/widgetRegistry.js — what the Today bar can show, and whether it does.
 *
 * `yancotab_widgets` had a reader (WidgetBar) and, until now, no writer
 * anywhere in the product: the key was registered, defaulted, synced, and
 * completely unreachable. Adding the Settings toggles meant two modules
 * would need to agree on the widget list, so the list lives here and both
 * import it.
 *
 * Deliberately data-only — no widget classes are imported. Settings needs
 * the names and keys, not four view constructors and their stylesheets.
 */

export const WIDGETS = [
  {
    key: 'weather',
    name: 'Weather',
    desc: 'Temperature and conditions for your saved city',
  },
  {
    key: 'pomodoro',
    name: 'Focus timer',
    // Load-bearing reassurance rather than flavour text: before the
    // headless ticker, hiding this card stopped the clock.
    desc: 'Pomodoro ring. The timer keeps running whether or not it is shown',
  },
  {
    key: 'todo',
    name: 'Tasks',
    desc: 'Your next few open tasks, tickable without opening the app',
  },
  {
    key: 'activity',
    name: 'Activity',
    desc: 'What you opened and finished recently',
  },
];

export const WIDGET_KEYS = WIDGETS.map((w) => w.key);

/**
 * A MISSING key counts as enabled.
 *
 * This is what lets a newly shipped widget appear for someone whose saved
 * config predates it — the alternative (absent means off) would have made
 * every future widget invisible to existing users until they went looking
 * in Settings for something they had never heard of. Only an explicit
 * `false` hides a card.
 */
export function isWidgetEnabled(stored, key) {
  return !stored || stored[key] !== false;
}
