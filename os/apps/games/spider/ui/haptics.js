// haptics.js — navigator.vibrate wrapper, same patterns as Solitaire.
// No-op when the API is missing (desktop, most Safari, user preference).

export function haptic(kind) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  switch (kind) {
    case 'pickup':  navigator.vibrate(8); break;
    case 'place':   navigator.vibrate(12); break;
    case 'invalid': navigator.vibrate([10, 40, 10]); break;
    case 'win':     navigator.vibrate([30, 50, 30, 50, 60]); break;
    default: break;
  }
}
