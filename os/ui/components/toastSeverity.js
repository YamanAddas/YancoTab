/**
 * toastSeverity.js — which toasts may never be suppressed.
 *
 * Pomodoro's `autoMute` setting hides toasts during a break so the
 * user is not interrupted by chatter. That is the right instinct for
 * "Settings saved" or "Task done" — and the wrong one for "Save
 * failed", "Storage full", or "Blocked unsafe URL", which report that
 * something did not happen. Hiding those does not create calm; it
 * makes a failed save look like a successful one.
 *
 * So toasts split into two classes:
 *
 *   ALERT   error, warning — something failed, or was refused. The
 *           message is the only evidence the user gets, and acting on
 *           a wrong belief ("my note saved") can lose data. Always
 *           shown, mute or not.
 *   ROUTINE success, info — confirmations of things that worked.
 *           Suppressible; this is what autoMute exists for.
 *
 * `warning` is on the alert side because both of its uses in the
 * product ("Window limit reached", "Account list is full") explain why
 * an action the user just took did nothing. Silently swallowing that
 * reads as a broken app.
 *
 * The split is enforced in CSS (`css/pomodoro.css`) via the
 * `toast-pill--alert` class this predicate drives, and pinned by
 * tests/toast-mute.test.js.
 */

/** Severities that must survive Pomodoro auto-mute. */
export const ALERT_TYPES = Object.freeze(['error', 'warning']);

/** Marker class put on alert pills; referenced by the mute rule. */
export const ALERT_CLASS = 'toast-pill--alert';

/**
 * @param {string} type — toast type ('success' | 'error' | 'info' | 'warning')
 * @returns {boolean} true when the toast must never be muted
 */
export function isAlertToast(type) {
  return ALERT_TYPES.includes(type);
}
